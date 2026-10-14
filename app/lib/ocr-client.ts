export function recognizeImage(
  image: Blob,
  language: "eng" | "chi_sim" | "chi_sim+eng",
  signal: AbortSignal,
  report: (value: number, text?: string) => void,
): Promise<{ text: string; confidence: number }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/ocr.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const abort = () => {
      finish();
      reject(signal.reason ?? new Error("已取消识别。"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("OCR 超时，请裁剪图片后重试。"));
    }, 600000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) {
        report(data.progress, data.status);
        return;
      }
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("OCR 引擎加载失败，请刷新后重试。"));
    };
    try {
      worker.postMessage({ image, language });
    } catch (cause) {
      finish();
      reject(cause);
    }
  });
}
