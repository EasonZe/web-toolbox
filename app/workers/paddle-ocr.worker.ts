import { PaddleOCR, normalizeOcrPipelineConfig } from "@paddleocr/paddleocr-js";
import cvModule from "@techstark/opencv-js";
import { paddleOcrResult } from "../lib/ocr-text";
import { toolLimits } from "../lib/resource-limits";
self.onmessage = async ({ data }: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>) => {
  let engine: PaddleOCR | undefined;
  try {
    const { width, height, pixels } = data;
    if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= toolLimits.ocr.edge) || width * height > toolLimits.ocr.desktopPixels || pixels.length !== width * height * 4) throw new Error("识别图像尺寸无效或超出预算。");
    const base = new URL("/ocr/paddle/0.4.2/", self.location.origin).href;
    self.postMessage({ progress: 5, status: "正在加载站内 PaddleOCR 引擎与中英文模型…" });
    engine = new PaddleOCR({
      pipelineConfig: normalizeOcrPipelineConfig({ pipeline_name: "OCR", SubModules: {
        TextDetection: { model_name: "PP-OCRv5_mobile_det", model_dir: { url: `${base}models/PP-OCRv5_mobile_det.tar` }, batch_size: 1 },
        TextRecognition: { model_name: "PP-OCRv5_mobile_rec", model_dir: { url: `${base}models/PP-OCRv5_mobile_rec.tar` }, batch_size: 1 },
      } }),
      ortOptions: { backend: "wasm", wasmPaths: `${base}ort/`, numThreads: 1, proxy: false },
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, self.location.origin);
        if (!url.href.startsWith(`${base}models/`)) throw new Error("已阻止非站内模型请求。");
        return fetch(url, init);
      },
    });
    await engine.initialize(); self.postMessage({ progress: 45, status: "正在检测文字并逐行识别…" });
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    const mat = cv.matFromArray(height, width, cv.CV_8UC4, pixels);
    try {
      const [result] = await engine.predict(mat, { textDetLimitSideLen: 1280, textDetLimitType: "max", textDetMaxSideLimit: 2048, textRecScoreThresh: 0.25 });
      self.postMessage({ result: paddleOcrResult(result.items) });
    } finally { mat.delete(); }
  } catch (cause) { self.postMessage({ error: `PaddleOCR：${cause instanceof Error ? cause.message : "识别失败，请更换图片或使用兼容引擎。"}` }); }
  finally { await engine?.dispose(); }
};
