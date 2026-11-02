import { runWorkerTask } from "./worker-task";
import { isConstrainedDevice } from "./resource-limits";
import { vectorizerLimits, type ImageVectorizerOptions } from "./image-vectorizer-options";
import type { ImageVectorizerSource, ImageVectorizerResult } from "./image-vectorizer";
export type ImageVectorizerRequest = { action: "preview"; file: File; constrained: boolean } | { action: "process"; file: File; options: ImageVectorizerOptions; constrained: boolean };
function run<T>(request: ImageVectorizerRequest, signal: AbortSignal, report?: (progress: number, status: string) => void) {
  return runWorkerTask<T>(() => new Worker(new URL("../workers/image-vectorizer.worker.ts", import.meta.url), { type: "module" }), request, signal, { timeoutMs: vectorizerLimits.timeoutMs, timeoutMessage: "矢量描摹超过 2 分钟，请减小处理尺寸后重试。", loadMessage: "矢量描摹引擎加载失败，请刷新后重试。", cancelMessage: "已取消矢量描摹。", progress: "field", report });
}
export function readImageVectorizerSource(file: File, signal: AbortSignal, report?: (progress: number, status: string) => void) { return run<ImageVectorizerSource>({ action: "preview", file, constrained: isConstrainedDevice() }, signal, report); }
export function runImageVectorizer(file: File, options: ImageVectorizerOptions, signal: AbortSignal, report?: (progress: number, status: string) => void) { return run<ImageVectorizerResult>({ action: "process", file, options, constrained: isConstrainedDevice() }, signal, report); }
