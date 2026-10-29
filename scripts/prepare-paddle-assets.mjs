import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../public/ocr/paddle/0.4.2/", import.meta.url);
const source = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/";
export const paddleAssets = [
  { name: "PP-OCRv5_mobile_det", bytes: 4843520, sha256: "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30", url: `${source}PP-OCRv5_mobile_det_onnx_infer.tar` },
  { name: "PP-OCRv5_mobile_rec", bytes: 16701440, sha256: "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c", url: `${source}PP-OCRv5_mobile_rec_onnx_infer.tar` },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function modelFile(asset) {
  const target = new URL(`models/${asset.name}.tar`, root);
  try { const bytes = await readFile(target); if (bytes.length === asset.bytes && hash(bytes) === asset.sha256) return; }
  catch (cause) { if (cause.code !== "ENOENT") throw cause; }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok || !response.body) throw new Error(`模型下载失败：HTTP ${response.status}`);
      const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.length; if (length > asset.bytes) throw new Error("模型下载超过锁定字节数。"); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (length !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error(`模型摘要不一致：${asset.name}`);
      await writeFile(target, bytes); return;
    } catch (cause) { lastError = cause; }
  }
  throw lastError;
}
export async function preparePaddleAssets() {
  await mkdir(new URL("models/", root), { recursive: true }); await mkdir(new URL("ort/", root), { recursive: true });
  const sdkEntry = fileURLToPath(import.meta.resolve("@paddleocr/paddleocr-js")), require = createRequire(sdkEntry);
  const ortDist = dirname(require.resolve("onnxruntime-web/wasm"));
  for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) await cp(join(ortDist, file), new URL(`ort/${file}`, root));
  await Promise.all(paddleAssets.map(modelFile));
  await cp(new URL("../licenses/PaddleOCR-LICENSE", import.meta.url), new URL("LICENSE", root));
}
