import { toolLimits, checkImagePixels, checkRasterWork } from "./resource-limits";
import { checkFiles } from "./local-files";
import { detectImageMime } from "./image-base64";
export function inspectRasterHeader(bytes: Uint8Array, maxPixels: number) {
  const mime = detectImageMime(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/bmp",
      "image/avif",
    ].includes(mime)
  )
    throw new Error("不支持动图、SVG 或此图片格式。");
  let width = 0,
    height = 0;
  if (mime === "image/png" && bytes.length >= 24) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  }
  if (mime === "image/bmp" && bytes.length >= 26) {
    const header = view.getUint32(14, true);
    if (header === 12) {
      width = view.getUint16(18, true);
      height = view.getUint16(20, true);
    } else {
      width = Math.abs(view.getInt32(18, true));
      height = Math.abs(view.getInt32(22, true));
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const type = String.fromCharCode(...bytes.subarray(12, 16));
    if (type === "VP8X") {
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536;
    }
    if (
      type === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
    if (type === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  if (mime === "image/jpeg") {
    for (let p = 2; p + 8 < bytes.length;) {
      if (bytes[p] !== 0xff) break;
      const marker = bytes[p + 1];
      if (marker === 0xff) {
        p++;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const length = view.getUint16(p + 2);
      if (length < 2) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        height = view.getUint16(p + 5);
        width = view.getUint16(p + 7);
        break;
      }
      p += length + 2;
    }
  }
  if (width && height && width * height > maxPixels)
    throw new Error(
      `图片像素超过 ${Math.round(maxPixels / 1_000_000)} MP，请先缩小图片。`,
    );
  return { mime, width, height };
}
export async function loadRaster(
  file: File,
  signal: AbortSignal,
  maxPixels: number = toolLimits.image.pixels,
) {
  checkFiles([file], toolLimits.image.fileBytes, 1);
  signal.throwIfAborted();
  if (!/\.(png|jpe?g|webp|avif|bmp)$/i.test(file.name))
    throw new Error("请选择 PNG、JPG、WebP、AVIF 或 BMP 图片。");
  inspectRasterHeader(
    new Uint8Array(await file.slice(0, 65536).arrayBuffer()),
    maxPixels,
  );
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  if (signal.aborted) {
    bitmap.close();
    signal.throwIfAborted();
  }
  if (bitmap.width * bitmap.height > maxPixels) {
    bitmap.close();
    throw new Error(
      `图片像素超过 ${Math.round(maxPixels / 1_000_000)} MP，请先缩小图片。`,
    );
  }
  try { checkImagePixels(bitmap.width, bitmap.height); }
  catch (cause) { bitmap.close(); throw cause; }
  return bitmap;
}
export async function rasterPixels(
  file: File,
  signal: AbortSignal,
  width?: number,
  height?: number,
) {
  const header = inspectRasterHeader(new Uint8Array(await file.slice(0, 65536).arrayBuffer()), toolLimits.image.pixels);
  if (header.width && header.height) checkRasterWork(header.width, header.height, 1 + 2 * ((width ?? header.width) * (height ?? header.height)) / (header.width * header.height));
  const bitmap = await loadRaster(file, signal);
  try {
    checkRasterWork(bitmap.width, bitmap.height, 1 + 2 * ((width ?? bitmap.width) * (height ?? bitmap.height)) / (bitmap.width * bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = width ?? bitmap.width;
    canvas.height = height ?? bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持图片绘制。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}
export async function pixelsToPng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片绘制。");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("PNG 导出失败。"));
    }, "image/png"),
  );
}
