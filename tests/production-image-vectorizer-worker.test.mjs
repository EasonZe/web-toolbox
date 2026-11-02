import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { defaultImageVectorizer } = loadLocalModule("app/lib/image-vectorizer-options.ts");
const options = { ...defaultImageVectorizer, colors: 2, fitting: .1, speckles: 0 };

async function productionWorker(t) {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url);
  const names = (await readdir(root)).filter((name) => /^image-vectorizer\.worker-.*\.js$/.test(name));
  assert.equal(names.length, 1);
  const worker = new Worker(new URL("./helpers/photo-effects-production-runner.mjs", import.meta.url), { workerData: { entry: new URL(names[0], root).href } });
  t.after(() => worker.terminate()); const [ready] = await once(worker, "message"); assert.equal(ready.ready, true, ready.fatal);
  return { run(request) { return new Promise((resolve, reject) => {
    const progress = [], cleanup = () => { worker.off("message", receive); worker.off("error", failure); }, failure = (cause) => { cleanup(); reject(cause); };
    const receive = (message) => { if (message.fatal) return failure(new Error(message.fatal)); if (Object.hasOwn(message, "progress")) { progress.push(message.progress); return; } cleanup(); resolve({ ...message, observedProgress: progress }); };
    worker.on("message", receive); worker.once("error", failure); worker.postMessage({ request, filename: request?.file?.name });
  }); } };
}

test("实际Vite矢量Worker生成真实彩色SVG，半透明和透明洞栅格正确且释放资源", { timeout: 20000 }, async (t) => {
  const worker = await productionWorker(t), pixels = new Uint8Array(48 * 48 * 4);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) pixels.set(x >= 6 && x < 42 && y >= 6 && y < 42 && !(x >= 18 && x < 30 && y >= 18 && y < 30) ? [230, 45, 80, 128] : [0, 0, 0, 0], (y * 48 + x) * 4);
  const file = new File([await sharp(pixels, { raw: { width: 48, height: 48, channels: 4 } }).png().toBuffer()], "ring.png", { type: "image/png" });
  const preview = await worker.run({ action: "preview", file, constrained: false });
  assert.equal(preview.error, undefined); assert.equal(preview.result.width, 48); assert.equal(preview.adapterResources.released, true);
  const result = await worker.run({ action: "process", file, options, constrained: false });
  assert.equal(result.error, undefined); assert.equal(result.adapterResources.released, true); assert.equal(result.result.blob.type, "image/svg+xml");
  const xml = await result.result.blob.text(); assert.match(xml, /<path /); assert.match(xml, /clipPath/); assert.doesNotMatch(xml, /<image|script|foreignObject|href=|data:/i);
  const { data, info } = await sharp(Buffer.from(await result.result.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 48); assert.equal(info.height, 48);
  const point = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.equal(point(1, 1)[3], 0); assert.equal(point(24, 24)[3], 0);
  const color = point(10, 10); [230, 45, 80, 128].forEach((value, i) => assert.ok(Math.abs(color[i] - value) < 5, `${color}`));
  assert.ok(result.observedProgress.length > 2); assert.ok(result.observedProgress.every((n) => n >= 0 && n <= 100));
});

test("实际Vite矢量Worker遵守显式缩放，预算和坏请求在解码前拒绝", { timeout: 20000 }, async (t) => {
  const worker = await productionWorker(t);
  const file = new File([await sharp({ create: { width: 800, height: 400, channels: 4, background: "#2850be" } }).png().toBuffer()], "wide.png", { type: "image/png" });
  const result = await worker.run({ action: "process", file, options, constrained: false });
  assert.equal(result.error, undefined); assert.equal(result.result.width, 512); assert.equal(result.result.height, 256); assert.equal(result.result.sourceWidth, 800); assert.equal(result.result.scale, .64); assert.equal(result.adapterResources.released, true);
  const before = result.adapterResources.bitmaps;
  const large = new File([await sharp({ create: { width: 2048, height: 2048, channels: 4, background: "red" } }).png().toBuffer()], "large.png", { type: "image/png" });
  const limited = await worker.run({ action: "process", file: large, options: { ...options, edge: 2048 }, constrained: true });
  assert.match(limited.error, /预算/); assert.equal(limited.adapterResources.bitmaps, before); assert.equal(limited.adapterResources.released, true);
  for (const request of [{ action: "process", file, options: { ...options, colors: 1 }, constrained: false }, { action: "preview", file, constrained: "false" }, { action: "unknown", file, constrained: false }, { action: "preview", file: new File(["GIF89a"], "bad.gif"), constrained: false }]) {
    const response = await worker.run(request); assert.ok(response.error); assert.equal(response.result, undefined); assert.equal(response.adapterResources.bitmaps, before); assert.equal(response.adapterResources.released, true);
  }
});
