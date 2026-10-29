import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const { defaultImageBlur, imageBlurRegion, validateImageBlur } = loadLocalModule("app/lib/image-blur-options.ts");
const { applyImageBlurPixels, checkImageBlurWork, prepareImageBlurSource, processImageBlur } = loadLocalModule("app/lib/image-blur.ts");

// Independent slow 2D reference: no shared sliding-window or region helper.
function reference(input, width, height, options) {
  const output = input.slice(), r = options.region, left = options.scope === "all" ? 0 : Math.floor(width * r.left / 100), top = options.scope === "all" ? 0 : Math.floor(height * r.top / 100), right = options.scope === "all" ? width : Math.min(width, Math.ceil(width * (r.left + r.width) / 100)), bottom = options.scope === "all" ? height : Math.min(height, Math.ceil(height * (r.top + r.height) / 100));
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const at = (y * width + x) * 4; if (!input[at + 3] || !options.strength) continue;
    const sum = [0, 0, 0]; let alpha = 0;
    for (let dy = -options.radius; dy <= options.radius; dy++) for (let dx = -options.radius; dx <= options.radius; dx++) {
      const xx = Math.max(0, Math.min(width - 1, x + dx)), yy = Math.max(0, Math.min(height - 1, y + dy)), sample = (yy * width + xx) * 4, a = input[sample + 3];
      alpha += a; for (let c = 0; c < 3; c++) sum[c] += input[sample + c] * a;
    }
    for (let c = 0; c < 3; c++) output[at + c] = input[at + c] * (1 - options.strength / 100) + sum[c] / alpha * options.strength / 100;
  }
  return output;
}
test("均值模糊与独立二维参考一致，包括大半径、小图、半透明及局部矩形", () => {
  for (const [width, height] of [[1, 1], [1, 5], [7, 1], [7, 5]]) {
    const input = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 61 + 37) % 256), saved = input.slice();
    for (const radius of [1, 3, 12, 100]) for (const strength of [0, 31, 100]) for (const scope of ["all", "region"]) {
      const options = { ...defaultImageBlur, radius, strength, scope, region: { left: 14, top: 20, width: 58, height: 60 } }, actual = applyImageBlurPixels(input, width, height, options), expected = reference(input, width, height, options);
      for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= 1, `${width}×${height}, r=${radius}, ${strength}%, ${scope}, channel=${i}: ${actual[i]} != ${expected[i]}`);
      for (let i = 3; i < actual.length; i += 4) assert.equal(actual[i], input[i]);
    }
    assert.deepEqual(input, saved);
  }
});
test("透明隐藏RGB不染黑，alpha和范围外像素不变，0%逐字节保持原样", () => {
  const input = new Uint8ClampedArray([210, 70, 30, 255, 210, 70, 30, 1, 0, 0, 0, 0]);
  assert.deepEqual(applyImageBlurPixels(input, 3, 1, defaultImageBlur), input);
  const varied = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 240, 240, 240, 255]), options = { ...defaultImageBlur, radius: 1, scope: "region", region: { left: 34, top: 0, width: 1, height: 100 } }, out = applyImageBlurPixels(varied, 3, 1, options);
  assert.deepEqual([...out.slice(0, 4)], [...varied.slice(0, 4)]); assert.deepEqual([...out.slice(8)], [...varied.slice(8)]); assert.deepEqual([...out.slice(4, 8)], [113, 113, 113, 255]);
  assert.deepEqual(applyImageBlurPixels(varied, 3, 1, { ...defaultImageBlur, strength: 0 }), varied);
  assert.deepEqual(imageBlurRegion(7, 5, { ...options, region: { left: 0, top: 0, width: 100, height: 100 } }), { left: 0, top: 0, right: 7, bottom: 5 });
});
test("非法参数、像素长度、边长、预算和取消在大内存分配前拒绝", () => {
  for (const options of [null, {}, { ...defaultImageBlur, scope: "x" }, { ...defaultImageBlur, radius: 0 }, { ...defaultImageBlur, radius: 101 }, { ...defaultImageBlur, radius: 2.2 }, { ...defaultImageBlur, strength: NaN }, { ...defaultImageBlur, strength: 101 }, { ...defaultImageBlur, region: { left: 51, top: 0, width: 50, height: 100 } }, { ...defaultImageBlur, region: { left: 0, top: 0, width: 0, height: 100 } }]) assert.throws(() => validateImageBlur(options));
  assert.throws(() => applyImageBlurPixels(new Uint8ClampedArray(3), 1, 1, defaultImageBlur), /像素/);
  assert.throws(() => checkImageBlurWork(8193, 1), /8192/); assert.throws(() => checkImageBlurWork(8192, 8192), /工作空间/);
  assert.doesNotThrow(() => checkImageBlurWork(3500, 3500, true)); assert.throws(() => checkImageBlurWork(4000, 3500, true), /工作空间/);
  assert.throws(() => checkImageBlurWork(1, 1, "false"), /预算参数/);
  const a = new AbortController(); a.abort(); assert.throws(() => applyImageBlurPixels(new Uint8ClampedArray(4), 1, 1, defaultImageBlur, a.signal), { name: "AbortError" });
  const b = new AbortController(); assert.throws(() => applyImageBlurPixels(new Uint8ClampedArray(4 * 128), 1, 128, defaultImageBlur, b.signal, () => b.abort()), { name: "AbortError" });
});

async function environment(t, work) {
  const keys = ["OffscreenCanvas", "createImageBitmap", "ImageData"], saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = []; let closed = 0, fail = false, onEncode = () => {};
  globalThis.ImageData = ImageData;
  globalThis.OffscreenCanvas = class { constructor(width, height) { const canvas = createCanvas(width, height); canvas.convertToBlob = async ({ type }) => { onEncode(); if (fail) throw new Error("encode failed"); return new Blob([canvas.toBuffer(type)], { type }); }; canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await work({ canvases, closed: () => closed, failEncoding: () => { fail = true; }, onEncoding: (fn) => { onEncode = fn; } });
}
async function png(pixels, width, height) { return new File([await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer()], "sample.png", { type: "image/png" }); }
test("真实NativeCanvas导出原尺寸PNG、缩略图和透明度正确，bitmap与画布释放", async (t) => environment(t, async ({ canvases, closed }) => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 120, 20, 70, 128, 0, 0, 0, 0]), file = await png(pixels, 2, 2), signal = new AbortController().signal;
  const source = await prepareImageBlurSource(file, signal); assert.equal(source.width, 2); assert.equal(source.height, 2);
  const result = await processImageBlur(file, { ...defaultImageBlur, radius: 1 }, signal), image = sharp(Buffer.from(await result.blob.arrayBuffer())), metadata = await image.metadata(), actual = await image.ensureAlpha().raw().toBuffer(), expected = applyImageBlurPixels(pixels, 2, 2, { ...defaultImageBlur, radius: 1 });
  assert.equal(metadata.width, 2); assert.equal(metadata.height, 2); assert.equal(result.width, 2); assert.equal(result.height, 2); assert.equal(result.blob.type, "image/png");
  for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= 1, `channel ${i}: ${actual[i]} != ${expected[i]}`);
  const preview = await sharp(Buffer.from(await result.thumbnail.arrayBuffer())).metadata(); assert.equal(preview.width, 2); assert.equal(preview.height, 2); assert.equal(closed(), 2); assert.ok(canvases.every((canvas) => canvas.width <= 1 && canvas.height <= 1));
}));
test("真实PNG局部范围外不变且0%导出保留像素，预览不扩大或裁剪", async (t) => environment(t, async () => {
  const pixels = Uint8ClampedArray.from({ length: 4 * 3 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 71 + 17) % 256), file = await png(pixels, 4, 3), signal = new AbortController().signal, options = { ...defaultImageBlur, radius: 2, scope: "region", region: { left: 25, top: 0, width: 25, height: 100 } };
  const result = await processImageBlur(file, options, signal), actual = await sharp(Buffer.from(await result.blob.arrayBuffer())).ensureAlpha().raw().toBuffer(); assert.deepEqual([...actual], [...reference(pixels, 4, 3, options)]);
  const same = await processImageBlur(file, { ...defaultImageBlur, strength: 0 }, signal); assert.deepEqual([...(await sharp(Buffer.from(await same.blob.arrayBuffer())).ensureAlpha().raw().toBuffer())], [...pixels]);
  const wide = new File([await sharp({ create: { width: 1600, height: 2, channels: 4, background: "red" } }).png().toBuffer()], "wide.png"), source = await prepareImageBlurSource(wide, signal), thumb = await sharp(Buffer.from(await source.thumbnail.arrayBuffer())).metadata(); assert.equal(source.width, 1600); assert.equal(thumb.width, 1280); assert.equal(thumb.height, 2);
}));
test("取消编码和编码失败不泄漏画布或迟到结果", async (t) => environment(t, async ({ canvases, closed, onEncoding, failEncoding }) => {
  const file = await png(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1), controller = new AbortController(); onEncoding(() => controller.abort());
  await assert.rejects(processImageBlur(file, defaultImageBlur, controller.signal), { name: "AbortError" }); onEncoding(() => {}); failEncoding(); await assert.rejects(processImageBlur(file, defaultImageBlur, new AbortController().signal), /encode failed/);
  assert.equal(closed(), 2); assert.ok(canvases.every((canvas) => canvas.width <= 1 && canvas.height <= 1));
}));

function entrypoint(path, resolve, globals = {}) {
  const url = new URL(`../${path}`, import.meta.url), exports = {}, source = readFileSync(url, "utf8").replaceAll("import.meta.url", JSON.stringify(url.href));
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: resolve, Blob, File, Error, AbortController, ...globals }); return exports;
}
test("iPad Window预算传到Worker，畸形设备标记拒绝且false不放松Android预算", async (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator"), device = (value) => Object.defineProperty(globalThis, "navigator", { configurable: true, value }); t.after(() => { if (saved) Object.defineProperty(globalThis, "navigator", saved); else delete globalThis.navigator; });
  const resources = loadLocalModule("app/lib/resource-limits.ts"), requests = [];
  device({ userAgent: "Macintosh Safari", platform: "MacIntel", maxTouchPoints: 5 });
  const client = entrypoint("app/lib/image-blur-client.ts", (id) => id === "./resource-limits" ? resources : { runWorkerTask(_factory, request) { requests.push(request); return Promise.resolve({}); } });
  const file = new File(["x"], "sample.png"), signal = new AbortController().signal; await client.readImageBlurSource(file, signal); await client.runImageBlur(file, defaultImageBlur, signal); assert.ok(requests.every((request) => request.constrained === true));
  device({ userAgent: "Android", deviceMemory: 4 }); const messages = [], calls = [], self = { postMessage: (message) => messages.push(message) };
  entrypoint("app/workers/image-blur.worker.ts", (id) => id === "../lib/resource-limits" ? resources : { async prepareImageBlurSource(_file, _signal, constrained) { calls.push(constrained); checkImageBlurWork(4000, 3500, constrained); }, async processImageBlur(_file, _options, _signal, _report, constrained) { calls.push(constrained); checkImageBlurWork(4000, 3500, constrained); } }, { self });
  for (const flag of [undefined, null, 0, "false", {}]) { messages.length = 0; await self.onmessage({ data: { action: "preview", file, constrained: flag } }); assert.match(messages[0].error, /预算参数无效/); assert.equal(calls.length, 0); }
  for (const action of ["preview", "process"]) { messages.length = 0; await self.onmessage({ data: { action, file, options: defaultImageBlur, constrained: false } }); assert.match(messages[0].error, /工作空间/); assert.equal(calls.at(-1), true); }
});
test("移动预算在解码前与未知头尺寸解码后检查，超预算bitmap释放", async (t) => {
  const saved = ["OffscreenCanvas", "createImageBitmap"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]); let decodes = 0, closed = 0;
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  globalThis.OffscreenCanvas = class { constructor() { throw new Error("unexpected allocation"); } }; globalThis.createImageBitmap = async () => { decodes++; return { width: 4000, height: 3500, close() { closed++; } }; };
  const large = new File([await sharp({ create: { width: 4000, height: 3500, channels: 4, background: "red" } }).png().toBuffer()], "large.png");
  await assert.rejects(prepareImageBlurSource(large, new AbortController().signal, true), /工作空间/); assert.equal(decodes, 0);
  const avif = new File([await sharp({ create: { width: 2, height: 1, channels: 4, background: "red" } }).avif().toBuffer()], "late.avif");
  await assert.rejects(processImageBlur(avif, defaultImageBlur, new AbortController().signal, undefined, true), /工作空间/); assert.equal(decodes, 1); assert.equal(closed, 1);
});
test("专用Worker成功、取消、超时、消息错误均清理，晚到结果无效且不传巨量像素", async () => {
  for (const mode of ["success", "cancel", "timeout", "message"]) {
    const app = workerClientHarness("app/lib/image-blur-client.ts"), controller = new AbortController(), file = new File(["x"], "a.png"), pending = app.exports.runImageBlur(file, defaultImageBlur, controller.signal), worker = app.workers[0], late = worker.onmessage;
    assert.equal(worker.request.file, file); assert.equal(worker.transfer.length, 0); assert.equal(worker.request.action, "process");
    if (mode === "success") { worker.emit({ result: { blob: new Blob(["result"]) } }); assert.equal((await pending).blob.size, 6); }
    else { if (mode === "cancel") controller.abort(); if (mode === "timeout") [...app.timers.values()][0].callback(); if (mode === "message") worker.onmessageerror(); await assert.rejects(pending); }
    late({ data: { result: "old" } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
  const app = workerClientHarness("app/lib/image-blur-client.ts"), controller = new AbortController(), pending = app.exports.readImageBlurSource(new File(["x"], "a.png"), controller.signal); assert.equal(app.workers[0].request.action, "preview"); controller.abort(); await assert.rejects(pending);
});
