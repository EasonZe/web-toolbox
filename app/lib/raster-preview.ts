import { loadRaster } from "./local-images";
export async function readRasterPreview(file: File, signal: AbortSignal) {
  const bitmap = await loadRaster(file, signal), canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法生成图片缩略图。"); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("缩略图生成失败。")), "image/png"));
    signal.throwIfAborted(); return { file, width: bitmap.width, height: bitmap.height, thumbnail };
  } finally { bitmap.close(); canvas.width = canvas.height = 0; }
}
