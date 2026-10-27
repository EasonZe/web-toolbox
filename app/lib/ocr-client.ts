import { runWorkerTask } from "./worker-task";
export function recognizeImage(
  image: Blob,
  language: "eng" | "chi_sim" | "chi_sim+eng",
  signal: AbortSignal,
  report: (value: number, text?: string) => void,
): Promise<{ text: string; confidence: number }> {
  return runWorkerTask(() => new Worker(new URL("../workers/ocr.worker.ts", import.meta.url), { type: "module" }), { image, language }, signal, {
    timeoutMs: 600000, timeoutMessage: "OCR 超时，请裁剪图片后重试。",
    loadMessage: "OCR 引擎加载失败，请刷新后重试。", cancelMessage: "已取消识别。",
    progress: "field", report,
  });
}
