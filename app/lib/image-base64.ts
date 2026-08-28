export const maxBase64ImageBytes = 10 * 1024 * 1024;
export const maxBase64InputChars = Math.ceil(maxBase64ImageBytes / 3) * 4 + 200_000;
export const supportedImageFormats = "PNG、JPG、WebP、GIF、BMP、ICO、AVIF";

const extensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/bmp": "bmp", "image/x-icon": "ico", "image/avif": "avif",
};

export function detectImageMime(bytes: Uint8Array): string {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (starts(255, 216, 255)) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 26 && starts(66, 77)) return "image/bmp";
  if (bytes.length >= 22 && starts(0, 0, 1, 0) && (bytes[4] || bytes[5])) return "image/x-icon";
  if (ascii(4, 4) === "ftyp") {
    const boxEnd = Math.min(bytes.length, 256, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0));
    for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
      if (offset !== 12 && ["avif", "avis"].includes(ascii(offset, 4))) return "image/avif";
    }
  }
  throw new Error(`没有识别到受支持的图片。请选择${supportedImageFormats}，暂不支持SVG或其他文件。`);
}

export function validateImageSize(size: number) {
  if (!size) throw new Error("图片内容为空，请重新选择。");
  if (size > maxBase64ImageBytes) throw new Error("图片不能超过10 MB。");
}

export function encodeImageBytes(bytes: Uint8Array): string {
  validateImageSize(bytes.byteLength);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function formatImageBase64(base64: string, mime: string, format: "data-url" | "raw") {
  return format === "raw" ? base64 : `data:${mime};base64,${base64}`;
}

export function decodeImageBase64(input: string): { bytes: Uint8Array; mime: string } {
  if (!input.trim()) throw new Error("请先输入Base64编码。");
  if (input.length > maxBase64InputChars) throw new Error("编码过长，最多支持还原10 MB的图片。");
  let value = input.trim(), declared = "";
  if (/^data:/i.test(value)) {
    const comma = value.indexOf(",");
    const header = value.slice(0, comma);
    if (comma < 0 || header.length > 200 || !/^data:image\/[a-z0-9.+-]+(?:;charset=[a-z0-9-]+)?;base64$/i.test(header)) throw new Error("请输入图片的Base64 Data URL，例如 data:image/png;base64,...");
    declared = header.slice(5).split(";")[0].toLowerCase();
    value = value.slice(comma + 1);
  }
  value = value.replace(/[\t\n\r ]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1 || (value.includes("=") && value.length % 4 !== 0)) throw new Error("Base64编码格式不正确，请检查是否复制完整。");
  value = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const size = value.length / 4 * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  validateImageSize(size);
  let binary: string;
  try { binary = atob(value); } catch { throw new Error("Base64解码失败，请检查编码内容。"); }
  if (btoa(binary) !== value) throw new Error("Base64编码不完整或末尾数据无效。");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const mime = detectImageMime(bytes);
  const aliases: Record<string, string> = { "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/vnd.microsoft.icon": "image/x-icon", "image/x-ms-bmp": "image/bmp" };
  if (declared && (aliases[declared] || declared) !== mime) throw new Error("Data URL声明的图片格式与实际内容不一致，请检查前缀或只粘贴纯Base64编码。");
  return { bytes, mime };
}

export function imageDownloadName(mime: string) { return `还原图片.${extensions[mime] || "png"}`; }

export function inspectImageBlob(blob: Blob, signal: AbortSignal): Promise<{ width: number; height: number }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    const cleanup = () => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      image.onload = null; image.onerror = null; image.src = ""; URL.revokeObjectURL(url);
    };
    const abort = () => { cleanup(); reject(new DOMException("已取消", "AbortError")); };
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight;
      cleanup();
      if (!width || !height || width * height > 40_000_000) reject(new Error("图片尺寸无效或超过4000万像素，请缩小图片后重试。"));
      else resolve({ width, height });
    };
    image.onerror = () => { cleanup(); reject(new Error("图片已损坏，或当前浏览器不支持预览此格式，请换用PNG、JPG或WebP。")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("图片读取超时，请换一张图片重试。")); }, 15000);
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

export async function imageFileToBase64(file: File, signal: AbortSignal) {
  validateImageSize(file.size); signal.throwIfAborted();
  const buffer = await file.arrayBuffer(); signal.throwIfAborted();
  const bytes = new Uint8Array(buffer), mime = detectImageMime(bytes);
  const blob = new Blob([buffer], { type: mime });
  const dimensions = await inspectImageBlob(blob, signal); signal.throwIfAborted();
  return { blob, mime, base64: encodeImageBytes(bytes), ...dimensions };
}

export async function base64ToImage(input: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const { bytes, mime } = decodeImageBase64(input);
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const dimensions = await inspectImageBlob(blob, signal); signal.throwIfAborted();
  return { blob, mime, base64: "", ...dimensions };
}
