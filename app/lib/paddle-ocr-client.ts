import { runWorkerTask } from "./worker-task";
import type { OcrResult } from "./ocr-text";
export function recognizeWithPaddle(image: ImageData, signal: AbortSignal, report: (value: number, status: string) => void): Promise<OcrResult> {
  return runWorkerTask(() => new Worker(new URL("../workers/paddle-ocr.worker.ts", import.meta.url), { type: "module" }), { pixels: image.data, width: image.width, height: image.height }, signal, {
    timeoutMs: 600000, timeoutMessage: "OCR 超时，请裁剪图片后重试。", loadMessage: "PaddleOCR 引擎加载失败，可改用兼容引擎。", cancelMessage: "已取消识别。", progress: "field", report, transfer: () => [image.data.buffer as ArrayBuffer],
  });
}
