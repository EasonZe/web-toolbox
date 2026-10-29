import { runWorkerTask } from "./worker-task";
import { isConstrainedDevice } from "./resource-limits";
import type { PhotoEffectKind, PhotoEffectOptions } from "./image-photo-effects-options";
import type { PhotoEffectResult, PhotoEffectSource } from "./image-photo-effects";
export type PhotoEffectRequest = { action: "preview"; file: File; kind: PhotoEffectKind; constrained: boolean } | { action: "process"; file: File; options: PhotoEffectOptions; constrained: boolean };
function runPhotoWorker<T>(request: PhotoEffectRequest, signal: AbortSignal, report?: (progress: number, status: string) => void) {
  // File/Blob use structured cloning; no full pixel buffer is copied to or from the UI thread.
  return runWorkerTask<T>(() => new Worker(new URL("../workers/image-photo-effects.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: 180000, timeoutMessage: "图片处理超时，请先缩小图片再重试。", loadMessage: "图片处理引擎加载失败，请刷新后重试。", cancelMessage: "已取消图片处理。", progress: "field", report,
  });
}
export function runPhotoEffect(file: File, options: PhotoEffectOptions, signal: AbortSignal, report?: (progress: number, status: string) => void) { return runPhotoWorker<PhotoEffectResult>({ action: "process", file, options, constrained: isConstrainedDevice() }, signal, report); }
export function readPhotoEffectSource(file: File, kind: PhotoEffectKind, signal: AbortSignal, report?: (progress: number, status: string) => void) { return runPhotoWorker<PhotoEffectSource>({ action: "preview", file, kind, constrained: isConstrainedDevice() }, signal, report); }
