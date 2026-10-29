import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { PaddleOCR, normalizeOcrPipelineConfig } from "@paddleocr/paddleocr-js";
import cvModule from "@techstark/opencv-js";
// The SDK checks HTTP origins. This supplies only its URL protocol in Node;
// inference below uses real cv.Mat input, not a browser/canvas emulation.
globalThis.location = new URL("https://local.test/");

let engine;
try {
  const base = new URL("../../public/ocr/paddle/0.4.2/models/", import.meta.url);
  engine = new PaddleOCR({
    pipelineConfig: normalizeOcrPipelineConfig({ pipeline_name: "OCR", SubModules: {
      TextDetection: { model_name: "PP-OCRv5_mobile_det", model_dir: { url: "https://local.test/PP-OCRv5_mobile_det.tar" }, batch_size: 1 },
      TextRecognition: { model_name: "PP-OCRv5_mobile_rec", model_dir: { url: "https://local.test/PP-OCRv5_mobile_rec.tar" }, batch_size: 1 },
    } }),
    ortOptions: { backend: "wasm", numThreads: 1, proxy: false },
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.origin !== "https://local.test" || !/^\/PP-OCRv5_mobile_(?:det|rec)\.tar$/.test(url.pathname)) throw new Error("Test model request escaped allowlist");
      return new Response(await readFile(new URL(url.pathname.slice(1), base)));
    },
  });
  await engine.initialize();
  const results = [];
  const cv = cvModule instanceof Promise ? await cvModule : cvModule;
  for (const image of workerData.images) {
    const mat = cv.matFromArray(image.height, image.width, cv.CV_8UC4, image.pixels);
    try { const [result] = await engine.predict(mat, { textDetLimitSideLen: 1280, textDetLimitType: "max", textDetMaxSideLimit: 2048, textRecScoreThresh: 0.25 }); results.push(result); }
    finally { mat.delete(); }
  }
  await engine.dispose(); engine = null;
  parentPort.postMessage({ results });
} catch (cause) { await engine?.dispose(); parentPort.postMessage({ error: cause.stack || cause.message }); }
