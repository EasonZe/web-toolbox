import assert from "node:assert/strict";
import test from "node:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import sharp from "sharp";
test("真实生产 Paddle Worker 经站内模型及WASM执行中文识别，Node平台适配无外部请求", { timeout: 120000 }, async (t) => {
  const png = await sharp({ text: { text: "多功能工具箱\n生活明朗万物可爱", font: "Noto Sans SC 28", fontfile: fileURLToPath(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url)), rgba: true } }).flatten({ background: "white" }).extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" }).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dir = new URL("../dist/client/_next/static/workers/", import.meta.url), name = (await readdir(dir)).find((value) => /^paddle-ocr\.worker-.*\.js$/.test(value)); assert.ok(name);
  const worker = new Worker(new URL("./helpers/production-paddle-runner.mjs", import.meta.url), { workerData: { entry: new URL(name, dir).href, image: { pixels: new Uint8ClampedArray(data), width: info.width, height: info.height } } });
  t.after(() => worker.terminate());
  const result = await new Promise((resolve, reject) => { worker.on("error", reject); worker.on("message", (data) => { if (data.diagnostic || data.progress !== undefined) t.diagnostic(data.diagnostic ?? `progress ${data.progress}: ${data.status}`); if (data.error || data.result) resolve(data); }); });
  assert.equal(result.error, undefined); assert.match(result.result.text, /多功能工具箱/); assert.match(result.result.text, /生活明朗万物可爱/);
});
