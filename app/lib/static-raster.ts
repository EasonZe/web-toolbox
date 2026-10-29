import { inspectRasterHeader } from "./local-images";
import { checkFiles } from "./local-files";
import { toolLimits } from "./resource-limits";

/** New static-image tools must not silently discard an animation's later frames. */
export async function inspectStaticRaster(file: File, signal: AbortSignal) {
  signal.throwIfAborted(); checkFiles([file], toolLimits.image.fileBytes, 1);
  const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer()); signal.throwIfAborted();
  const header = inspectRasterHeader(bytes, toolLimits.image.pixels);
  if (header.mime === "image/webp" && bytes.length >= 21 && String.fromCharCode(...bytes.subarray(12, 16)) === "VP8X" && (bytes[20] & 2)) throw new Error("不支持动画 WebP，请先提取静态帧。");
  if (header.mime === "image/avif") {
    const end = Math.min(bytes.length, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0));
    for (let p = 8; p + 4 <= end; p += 4) if (p !== 12 && String.fromCharCode(...bytes.subarray(p, p + 4)) === "avis") throw new Error("不支持动画 AVIF，请先提取静态帧。");
  }
  if (header.mime === "image/png") {
    let offset = 8;
    for (let count = 0; count < toolLimits.image.metadataParts && offset + 8 <= file.size; count++) {
      const part = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer()); signal.throwIfAborted();
      if (part.length !== 8) throw new Error("PNG 文件结构不完整。");
      const length = new DataView(part.buffer, part.byteOffset, part.byteLength).getUint32(0), type = String.fromCharCode(...part.subarray(4, 8));
      if (type === "acTL") throw new Error("不支持 APNG 动画，请先提取静态帧。");
      if (offset + 12 + length > file.size || type === "IEND") throw new Error("PNG 文件结构不完整。");
      if (type === "IDAT") return header;
      offset += 12 + length;
    }
    throw new Error("PNG 头部内容过多或缺少图像数据。");
  }
  return header;
}
