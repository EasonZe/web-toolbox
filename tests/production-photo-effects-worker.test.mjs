import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { makeGif } from "./helpers/ninth-fixtures.mjs";
const { applyPhotoEffectPixels } = loadLocalModule("app/lib/image-photo-effects.ts");
const { defaultDuotone, defaultSharpen } = loadLocalModule("app/lib/image-photo-effects-options.ts");

async function productionWorker(t) {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url), names = (await readdir(root)).filter((name) => /^image-photo-effects\.worker-.*\.js$/.test(name));
  assert.equal(names.length, 1, "Build must emit exactly one dedicated photo effects module Worker");
  const worker = new Worker(new URL("./helpers/photo-effects-production-runner.mjs", import.meta.url), { workerData: { entry: new URL(names[0], root).href } });
  t.after(() => worker.terminate());
  const [ready] = await once(worker, "message"); assert.equal(ready.ready, true, ready.fatal);
  return {
    run(request, device) {
      return new Promise((resolve, reject) => {
        const progress = [];
        const cleanup = () => { worker.off("message", receive); worker.off("error", failure); };
        const failure = (cause) => { cleanup(); reject(cause); };
        const receive = (message) => {
          if (message.fatal) return failure(new Error(message.fatal));
          if (Object.hasOwn(message, "progress")) { progress.push(message.progress); return; }
          cleanup(); resolve({ ...message, observedProgress: progress });
        };
        worker.on("message", receive); worker.once("error", failure);
        worker.postMessage({ request, filename: request?.file?.name, device });
      });
    },
  };
}
async function png(pixels, width, height) { return new File([await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer()], "photo.png", { type: "image/png" }); }
async function image(blob) { return sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
function released(response) { assert.equal(response.error, undefined); assert.equal(response.adapterResources.released, true); }

test("实际Vite图片效果Worker读File缩略图、双色调与原尺寸PNG，不访问网络且释放资源", { timeout: 15000 }, async (t) => {
  const worker = await productionWorker(t), pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 128, 0, 0, 0, 0]), file = await png(pixels, 2, 2);
  const preview = await worker.run({ action: "preview", file, kind: "duotone", constrained: false }); released(preview);
  assert.equal(preview.result.width, 2); assert.equal(preview.result.height, 2); assert.equal(preview.result.thumbnail.type, "image/png");
  const source = await image(preview.result.thumbnail); assert.equal(source.info.width, 2); assert.equal(source.info.height, 2);
  const options = { ...defaultDuotone, shadow: "#000000", highlight: "#FFFFFF" }, output = await worker.run({ action: "process", file, options, constrained: false }); released(output);
  assert.equal(output.result.width, 2); assert.equal(output.result.height, 2); assert.equal(output.result.blob.type, "image/png");
  const full = await image(output.result.blob), thumb = await image(output.result.thumbnail), expected = applyPhotoEffectPixels(pixels, 2, 2, options);
  assert.equal(full.info.width, 2); assert.equal(full.info.height, 2);
  for (let i = 0; i < expected.length; i++) assert.ok(Math.abs(full.data[i] - expected[i]) <= 1, `channel ${i}: ${full.data[i]} vs ${expected[i]}`);
  assert.deepEqual(thumb.data, full.data); assert.ok(output.observedProgress.length > 0); assert.ok(output.observedProgress.every((value) => Number.isFinite(value) && value >= 0 && value <= 100));
});
test("实际Vite图片锐化Worker与独立纯函数参考像素一致，0强度保留所有像素", { timeout: 15000 }, async (t) => {
  const worker = await productionWorker(t), pixels = Uint8ClampedArray.from({ length: 4 * 3 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 71 + 17) % 256), file = await png(pixels, 4, 3), options = { ...defaultSharpen, radius: 2, amount: 150, threshold: 4 };
  const output = await worker.run({ action: "process", file, options, constrained: false }); released(output);
  const full = await image(output.result.blob), expected = applyPhotoEffectPixels(pixels, 4, 3, options);
  assert.equal(full.info.width, 4); assert.equal(full.info.height, 3); assert.deepEqual([...full.data], [...expected]);
  const identity = await worker.run({ action: "process", file, options: { ...options, amount: 0 }, constrained: false }); released(identity);
  assert.deepEqual([...(await image(identity.result.blob)).data], [...pixels]);
});
test("实际Vite图片效果Worker拒绝动画、坏协议及放宽移动预算的请求", { timeout: 15000 }, async (t) => {
  const worker = await productionWorker(t), gifBytes = makeGif([{ pixels: [1, 1, 1], delay: 100 }, { pixels: [2, 2, 2], delay: 100 }]), gif = new File([gifBytes], "animated.gif", { type: "image/gif" }), file = await png(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
  const animation = await worker.run({ action: "preview", file: gif, kind: "duotone", constrained: false }); assert.match(animation.error, /动图|格式|静态/); assert.equal(animation.adapterResources.bitmaps, 0);
  const webp = new File([await sharp(Buffer.from(gifBytes), { animated: true }).webp({ loop: 0, delay: [100, 100] }).toBuffer()], "animated.webp", { type: "image/webp" });
  const animatedWebp = await worker.run({ action: "preview", file: webp, kind: "duotone", constrained: false }); assert.match(animatedWebp.error, /动画 WebP/); assert.equal(animatedWebp.adapterResources.bitmaps, 0);
  for (const constrained of [undefined, "false", 0, null]) {
    const invalid = await worker.run({ action: "preview", file, kind: "duotone", constrained }); assert.match(invalid.error, /设备预算参数无效/); assert.equal(invalid.adapterResources.bitmaps, 0);
  }
  assert.match((await worker.run({ action: "unknown", file, constrained: false })).error, /请求/);
  const large = new File([await sharp({ create: { width: 4000, height: 3000, channels: 4, background: "red" } }).png().toBuffer()], "12mp.png", { type: "image/png" });
  const ipad = await worker.run({ action: "preview", file: large, kind: "sharpen", constrained: true }, { userAgent: "Macintosh Safari" }); assert.match(ipad.error, /工作空间.*预算/); assert.equal(ipad.adapterResources.bitmaps, 0);
  const android = await worker.run({ action: "process", file: large, options: defaultSharpen, constrained: false }, { userAgent: "Android", deviceMemory: 4 }); assert.match(android.error, /工作空间.*预算/); assert.equal(android.adapterResources.bitmaps, 0);
});
