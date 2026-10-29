import { runWorkerTask } from "./worker-task";
import { isConstrainedDevice } from "./resource-limits";
import type { ImageBlurOptions } from "./image-blur-options";
import type { ImageBlurSource, ImageBlurResult } from "./image-blur";
export type ImageBlurRequest = { action: "preview"; file: File; constrained: boolean } | { action: "process"; file: File; options: ImageBlurOptions; constrained: boolean };
function runImageBlurWorker<T>(request: ImageBlurRequest, signal: AbortSignal, report?: (progress: number, status: string) => void) {
  return runWorkerTask<T>(() => new Worker(new URL("../workers/image-blur.worker.ts", import.meta.url), { type: "module" }), request, signal, { timeoutMs: 180000, timeoutMessage: "图片处理超时，请先缩小图片再重试。", loadMessage: "图片模糊引擎加载失败，请刷新后重试。", cancelMessage: "已取消图片处理。", progress: "field", report });
}
export function readImageBlurSource(file: File, signal: AbortSignal, report?: (progress: number, status: string) => void) { return runImageBlurWorker<ImageBlurSource>({ action: "preview", file, constrained: isConstrainedDevice() }, signal, report); }
export function runImageBlur(file: File, options: ImageBlurOptions, signal: AbortSignal, report?: (progress: number, status: string) => void) { return runImageBlurWorker<ImageBlurResult>({ action: "process", file, options, constrained: isConstrainedDevice() }, signal, report); }
