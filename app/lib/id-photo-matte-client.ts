import { runWorkerTask } from "./worker-task";
import { loadRaster } from "./local-images";
import { toolLimits } from "./resource-limits";
export async function preparePortrait(file: File, signal: AbortSignal) {
  const bitmap = await loadRaster(file, signal), canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, toolLimits.idPhoto.matteEdge / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("无法准备人像抠图。"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("人像图像编码失败。")), "image/png")); signal.throwIfAborted(); return blob;
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
export async function removePortraitBackground(file: File, signal: AbortSignal, report: (progress: number, status: string) => void): Promise<Blob> {
  const image = await preparePortrait(file, signal); signal.throwIfAborted();
  return runPortraitMatte(image, signal, report);
}
export function runPortraitMatte(image: Blob, signal: AbortSignal, report: (progress: number, status: string) => void): Promise<Blob> {
  return runWorkerTask(() => new Worker(new URL("../workers/id-photo-matte.worker.ts", import.meta.url), { type: "module" }), { image }, signal, { timeoutMs: 600000, timeoutMessage: "人像抠图超时，可使用已有透明 PNG。", loadMessage: "人像抠图加载失败，请检查网络或使用透明 PNG。", cancelMessage: "已取消人像抠图。", progress: "field", report });
}
