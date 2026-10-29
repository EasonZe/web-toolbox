import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { makeGif } from "./helpers/ninth-fixtures.mjs";
const { defaultImageBlur } = loadLocalModule("app/lib/image-blur-options.ts");

async function productionWorker(t) {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url), names = (await readdir(root)).filter((name) => /^image-blur\.worker-.*\.js$/.test(name));
  assert.equal(names.length, 1, "Build must emit exactly one dedicated image blur module Worker");
  // The common adapter imports the exact Vite-produced browser entry in a native
  // Node worker. Native Canvas adapts platform APIs; no browser QA is implied.
  const worker = new Worker(new URL("./helpers/photo-effects-production-runner.mjs", import.meta.url), { workerData: { entry: new URL(names[0], root).href } });
  t.after(() => worker.terminate()); const [ready] = await once(worker, "message"); assert.equal(ready.ready, true, ready.fatal);
  return { run(request, device) { return new Promise((resolve, reject) => {
    const progress = [], cleanup = () => { worker.off("message", receive); worker.off("error", failure); }, failure = (cause) => { cleanup(); reject(cause); };
    const receive = (message) => { if (message.fatal) return failure(new Error(message.fatal)); if (Object.hasOwn(message, "progress")) { progress.push(message.progress); return; } cleanup(); resolve({ ...message, observedProgress: progress }); };
    worker.on("message", receive); worker.once("error", failure); worker.postMessage({ request, filename: request?.file?.name, device });
  }); } };
}
async function png(pixels, width, height) { return new File([await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer()], "photo.png", { type: "image/png" }); }
async function image(blob) { return sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
function released(response) { assert.equal(response.error, undefined); assert.equal(response.adapterResources.released, true); }

/** Independent small-image two-dimensional oracle, not production's sliding windows. */
function referenceBlur(input, width, height, options) {
  const output = input.slice(), region = options.region;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    if (!input[at + 3] || !options.strength || options.scope === "region" && (x < Math.floor(width * region.left / 100) || x >= Math.ceil(width * (region.left + region.width) / 100) || y < Math.floor(height * region.top / 100) || y >= Math.ceil(height * (region.top + region.height) / 100))) continue;
    const sum = [0, 0, 0]; let alpha = 0;
    for (let yy = y - options.radius; yy <= y + options.radius; yy++) for (let xx = x - options.radius; xx <= x + options.radius; xx++) {
      const sample = (Math.max(0, Math.min(height - 1, yy)) * width + Math.max(0, Math.min(width - 1, xx))) * 4, weight = input[sample + 3];
      alpha += weight; for (let c = 0; c < 3; c++) sum[c] += input[sample + c] * weight;
    }
    for (let c = 0; c < 3; c++) output[at + c] = input[at + c] * (1 - options.strength / 100) + sum[c] / alpha * options.strength / 100;
  }
  return output;
}

test("实际Vite模糊Worker读File缩略图、全图/局部PNG，像素匹配独立参考且释放资源", { timeout: 15000 }, async (t) => {
  const worker = await productionWorker(t), pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 128, 0, 0, 0, 0]), file = await png(pixels, 2, 2);
  const preview = await worker.run({ action: "preview", file, constrained: false }); released(preview);
  assert.equal(preview.result.width, 2); assert.equal(preview.result.height, 2); assert.equal(preview.result.thumbnail.type, "image/png");
  const source = await image(preview.result.thumbnail); assert.equal(source.info.width, 2); assert.equal(source.info.height, 2); assert.deepEqual([...source.data], [...pixels]);
  for (const options of [{ ...defaultImageBlur, radius: 1 }, { ...defaultImageBlur, radius: 1, scope: "region", region: { left: 50, top: 0, width: 50, height: 100 } }, { ...defaultImageBlur, strength: 0 }]) {
    const response = await worker.run({ action: "process", file, options, constrained: false }); released(response);
    assert.equal(response.result.width, 2); assert.equal(response.result.height, 2); assert.equal(response.result.blob.type, "image/png");
    const full = await image(response.result.blob), thumb = await image(response.result.thumbnail), expected = referenceBlur(pixels, 2, 2, options);
    assert.equal(full.info.width, 2); assert.equal(full.info.height, 2); assert.deepEqual(thumb.data, full.data);
    for (let i = 0; i < expected.length; i++) assert.ok(Math.abs(full.data[i] - expected[i]) <= 1, `channel ${i}: ${full.data[i]} vs ${expected[i]}`);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(full.data[i], pixels[i], "Source transparency must remain unchanged");
    if (options.scope === "region") for (const start of [0, 8]) assert.deepEqual([...full.data.slice(start, start + 4)], [...pixels.slice(start, start + 4)], "Pixels outside the chosen rectangle must remain unchanged");
    if (options.strength === 0) assert.deepEqual([...full.data], [...pixels]);
    assert.ok(response.observedProgress.length > 0); assert.ok(response.observedProgress.every((value) => Number.isFinite(value) && value >= 0 && value <= 100));
  }
});

test("实际Vite模糊Worker拒绝动画/坏参数，保留Window设备预算且不提前解码或泄漏", { timeout: 15000 }, async (t) => {
  const worker = await productionWorker(t), file = await png(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
  for (const options of [{ ...defaultImageBlur, radius: 0 }, { ...defaultImageBlur, strength: 101 }, { ...defaultImageBlur, region: { left: 50, top: 0, width: 51, height: 100 } }]) {
    const invalid = await worker.run({ action: "process", file, options, constrained: false }); assert.match(invalid.error, /参数|范围/); assert.equal(invalid.adapterResources.bitmaps, 0); assert.equal(invalid.adapterResources.released, true);
  }
  const gifBytes = makeGif([{ pixels: [1, 1, 1], delay: 100 }, { pixels: [2, 2, 2], delay: 100 }]), gif = new File([gifBytes], "animated.gif", { type: "image/gif" });
  const gifResponse = await worker.run({ action: "preview", file: gif, constrained: false }); assert.match(gifResponse.error, /动图|格式|静态/); assert.equal(gifResponse.adapterResources.bitmaps, 0);
  const webp = new File([await sharp(Buffer.from(gifBytes), { animated: true }).webp({ loop: 0, delay: [100, 100] }).toBuffer()], "animated.webp", { type: "image/webp" });
  const animation = await worker.run({ action: "process", file: webp, options: defaultImageBlur, constrained: false }); assert.match(animation.error, /动画 WebP/); assert.equal(animation.adapterResources.bitmaps, 0);
  for (const constrained of [undefined, "false", 0, null]) { const response = await worker.run({ action: "preview", file, constrained }); assert.match(response.error, /设备预算参数无效/); assert.equal(response.adapterResources.bitmaps, 0); }
  assert.match((await worker.run({ action: "unknown", file, constrained: false })).error, /请求/);
  const large = new File([await sharp({ create: { width: 4000, height: 3500, channels: 4, background: "red" } }).png().toBuffer()], "14mp.png", { type: "image/png" });
  // WorkerNavigator alone does not necessarily expose iPad desktop-mode touch
  // evidence. The Window's constrained=true must still reject before decoding.
  for (const action of ["preview", "process"]) {
    const carried = await worker.run({ action, file: large, options: defaultImageBlur, constrained: true }, { userAgent: "Macintosh Safari" });
    assert.match(carried.error, /工作空间.*预算/); assert.equal(carried.adapterResources.bitmaps, 0); assert.equal(carried.adapterResources.released, true);
  }
  const local = await worker.run({ action: "process", file: large, options: defaultImageBlur, constrained: false }, { userAgent: "Android", deviceMemory: 4 });
  assert.match(local.error, /工作空间.*预算/); assert.equal(local.adapterResources.bitmaps, 0); assert.equal(local.adapterResources.released, true);
});
