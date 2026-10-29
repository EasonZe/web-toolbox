import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { paddleAssets } from "../scripts/prepare-paddle-assets.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

test("实际 Paddle 模型与站内分发数据摘要一致，不将 LFS 指针或错误页当模型", async () => {
  for (const asset of paddleAssets) {
    const bytes = await readFile(new URL(`../dist/client/ocr/paddle/0.4.2/models/${asset.name}.tar`, import.meta.url));
    assert.equal(bytes.length, asset.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  }
});
test("实际 PP-OCRv5 / OpenCV / CPU WASM 识别中英文行，中文不再插入多余空格", { timeout: 120000 }, async (t) => {
  const images = [];
  for (const size of [16, 36]) {
    const png = await sharp({ text: { text: "多功能工具箱\n生活明朗万物可爱\nEnglish 123", font: `Noto Sans SC ${size}`, fontfile: fileURLToPath(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url)), rgba: true } }).flatten({ background: "white" }).extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" }).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); images.push({ pixels: data, width: info.width, height: info.height });
  }
  const worker = new Worker(new URL("./helpers/paddle-ocr-runner.mjs", import.meta.url), { workerData: { images } }); t.after(() => worker.terminate());
  const [reply] = await once(worker, "message"); assert.equal(reply.error, undefined);
  const { paddleOcrResult } = loadLocalModule("app/lib/ocr-text.ts");
  for (const value of reply.results) {
    const result = paddleOcrResult(value.items); assert.match(result.text, /多功能工具箱/); assert.match(result.text, /生活明朗万物可爱/); assert.match(result.text, /English\s*123/);
    assert.doesNotMatch(result.text, /\p{Script=Han} +\p{Script=Han}/u); assert.ok(result.confidence > 0 && result.confidence <= 100);
  }
});
