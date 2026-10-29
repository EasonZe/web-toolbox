import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const { defaultDuotone, defaultSharpen, validatePhotoEffect } = loadLocalModule("app/lib/image-photo-effects-options.ts");
const { applyPhotoEffectPixels, processPhotoEffect, preparePhotoEffectSource, checkPhotoEffectWork } = loadLocalModule("app/lib/image-photo-effects.ts");

test("双色调使用线性 sRGB 亮度，暗亮端点准确，混合强度0及透明像素不变", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128, 255, 0, 0, 255, 17, 21, 44, 0]), saved = pixels.slice();
  const options = { ...defaultDuotone, shadow: "#000000", highlight: "#FFFFFF" }, result = applyPhotoEffectPixels(pixels, 4, 1, options);
  assert.deepEqual([...result.slice(0, 8)], [0, 0, 0, 255, 255, 255, 255, 128]);
  // Red's linear relative luminance 0.2126 encodes to approximately 127 in sRGB.
  assert.deepEqual([...result.slice(8, 12)], [127, 127, 127, 255]); assert.deepEqual([...result.slice(12)], [17, 21, 44, 0]);
  assert.deepEqual(pixels, saved);
  assert.deepEqual(applyPhotoEffectPixels(pixels, 4, 1, { ...options, strength: 0 }), pixels);
  const flat = applyPhotoEffectPixels(pixels, 4, 1, { ...options, shadow: "#123456", highlight: "#123456" });
  for (const i of [0, 4, 8]) assert.deepEqual([...flat.slice(i, i + 3)], [18, 52, 86]);
  const partial = applyPhotoEffectPixels(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, { ...options, shadow: "#FFFFFF", strength: 50 });
  assert.deepEqual([...partial], [188, 188, 188, 255]);
});

function referenceSharpen(input, width, height, options) {
  const out = input.slice(), clamp = (n, size) => Math.max(0, Math.min(size - 1, n));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4; if (!input[offset + 3]) continue;
    const sum = [0, 0, 0]; let alpha = 0;
    for (let yy = y - options.radius; yy <= y + options.radius; yy++) for (let xx = x - options.radius; xx <= x + options.radius; xx++) {
      const at = (clamp(yy, height) * width + clamp(xx, width)) * 4, weight = input[at + 3] / 255; alpha += weight;
      for (let c = 0; c < 3; c++) sum[c] += input[at + c] * weight;
    }
    const d = sum.map((value, c) => input[offset + c] - value / alpha);
    if (Math.max(...d.map(Math.abs)) > options.threshold) for (let c = 0; c < 3; c++) out[offset + c] = input[offset + c] + d[c] * options.amount / 100;
  }
  return out;
}
test("锐化滑动窗口与独立二维参考算法一致，alpha加权、不改透明度与源缓冲", () => {
  const pixels = new Uint8ClampedArray(7 * 5 * 4); for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 67 + 13) % 256;
  const saved = pixels.slice();
  for (const radius of [1, 2, 7, 12]) for (const threshold of [0, 7, 64]) {
    const options = { ...defaultSharpen, radius, threshold, amount: 130 }, output = applyPhotoEffectPixels(pixels, 7, 5, options), reference = referenceSharpen(pixels, 7, 5, options);
    for (let i = 0; i < output.length; i++) assert.ok(Math.abs(output[i] - reference[i]) <= 1, `radius=${radius}, channel=${i}`);
    for (let i = 3; i < output.length; i += 4) assert.equal(output[i], pixels[i]);
  }
  assert.deepEqual(pixels, saved); assert.deepEqual(applyPhotoEffectPixels(pixels, 7, 5, { ...defaultSharpen, amount: 0 }), pixels);
});
test("锐化透明边缘不产生黑晕，低alpha邻域按覆盖率加权，平坦区保持颜色", () => {
  const pixels = new Uint8ClampedArray([210, 80, 25, 255, 210, 80, 25, 1, 0, 0, 0, 0]);
  const output = applyPhotoEffectPixels(pixels, 3, 1, { ...defaultSharpen, amount: 300, threshold: 0 });
  assert.deepEqual([...output], [...pixels]);
  const edge = new Uint8ClampedArray([100, 100, 100, 255, 150, 150, 150, 255]);
  const strong = applyPhotoEffectPixels(edge, 2, 1, { ...defaultSharpen, radius: 1, threshold: 0 });
  assert.ok(strong[0] < 100); assert.ok(strong[4] > 150);
  assert.deepEqual(applyPhotoEffectPixels(edge, 2, 1, { ...defaultSharpen, threshold: 64 }), edge);
});
test("效果参数、像素长度、边长和设备工作空间在分配前验证，已取消处理不分配", () => {
  for (const value of [{ ...defaultDuotone, strength: NaN }, { ...defaultDuotone, shadow: "red" }, { ...defaultDuotone, highlight: "#fff" }, { ...defaultSharpen, amount: 301 }, { ...defaultSharpen, threshold: -1 }, { ...defaultSharpen, radius: 1.2 }, { ...defaultSharpen, radius: 0 }, { kind: "other" }]) assert.throws(() => validatePhotoEffect(value));
  assert.throws(() => applyPhotoEffectPixels(new Uint8ClampedArray(3), 1, 1, defaultDuotone), /像素/);
  assert.throws(() => checkPhotoEffectWork(8193, 1, "duotone"), /8192/); assert.throws(() => checkPhotoEffectWork(8192, 8192, "sharpen"), /工作空间/);
  const aborted = new AbortController(); aborted.abort(); assert.throws(() => applyPhotoEffectPixels(new Uint8ClampedArray(4), 1, 1, defaultSharpen, aborted.signal), { name: "AbortError" });
  const controller = new AbortController(); assert.throws(() => applyPhotoEffectPixels(new Uint8ClampedArray(4 * 128), 1, 128, defaultDuotone, controller.signal, () => controller.abort()), { name: "AbortError" });
});
test("图像预算按真实缓冲与设备计算，不引入固定32MP或16MP硬限", (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (saved) Object.defineProperty(globalThis, "navigator", saved); else delete globalThis.navigator; });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "desktop", platform: "Win32", maxTouchPoints: 0 } });
  assert.doesNotThrow(() => checkPhotoEffectWork(7000, 7000, "duotone")); // 49 MP, five RGBA buffers fit desktop's shared budget.
  assert.doesNotThrow(() => checkPhotoEffectWork(5000, 4000, "sharpen"));
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 } });
  assert.doesNotThrow(() => checkPhotoEffectWork(3000, 3000, "sharpen"));
  assert.throws(() => checkPhotoEffectWork(4000, 3000, "sharpen"), /工作空间/);
  assert.doesNotThrow(() => checkPhotoEffectWork(4500, 4000, "duotone")); // 18 MP is valid for the lighter effect.
});

function deviceEnvironment(t, device) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (saved) Object.defineProperty(globalThis, "navigator", saved); else delete globalThis.navigator; });
  const set = (value) => Object.defineProperty(globalThis, "navigator", { configurable: true, value }); set(device); return set;
}
// Actual client/Worker entrypoint code, with platform APIs adapted in Node. This is not browser QA.
function effectEntrypoint(path, resolve, globals = {}) {
  const url = new URL(`../${path}`, import.meta.url), exports = {}, source = readFileSync(url, "utf8").replaceAll("import.meta.url", JSON.stringify(url.href));
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: resolve, Blob, File, Error, AbortController, ...globals });
  return exports;
}
test("iPad桌面UA在Window识别的限制传给Worker，12MP锐化预览和处理在解码前拒绝", async (t) => {
  const setDevice = deviceEnvironment(t, { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari", platform: "MacIntel", maxTouchPoints: 5 });
  const resource = loadLocalModule("app/lib/resource-limits.ts"), requests = [];
  const client = effectEntrypoint("app/lib/image-photo-effects-client.ts", (id) => {
    if (id === "./resource-limits") return resource;
    if (id === "./worker-task") return { runWorkerTask(_factory, request) { requests.push(request); return Promise.resolve({}); } };
    throw new Error(`Unexpected import: ${id}`);
  });
  const image = new File([await sharp({ create: { width: 4000, height: 3000, channels: 4, background: "red" } }).png().toBuffer()], "12mp.png"), signal = new AbortController().signal;
  await client.readPhotoEffectSource(image, "sharpen", signal); await client.runPhotoEffect(image, defaultSharpen, signal);
  assert.equal(requests.length, 2); assert.ok(requests.every((request) => request.constrained === true));
  // WorkerNavigator need not expose platform/maxTouchPoints; retain the Window's stricter flag.
  setDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari" }); assert.equal(resource.isConstrainedDevice(), false);
  const saved = ["OffscreenCanvas", "createImageBitmap"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]); let decodes = 0;
  globalThis.OffscreenCanvas = class { constructor() { throw new Error("Unexpected canvas allocation"); } };
  globalThis.createImageBitmap = async () => { decodes++; throw new Error("Unexpected decode"); };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const messages = [], self = { postMessage(message) { messages.push(message); } };
  effectEntrypoint("app/workers/image-photo-effects.worker.ts", (id) => {
    if (id === "../lib/resource-limits") return resource;
    if (id === "../lib/image-photo-effects") return { preparePhotoEffectSource, processPhotoEffect };
    throw new Error(`Unexpected Worker import: ${id}`);
  }, { self });
  for (const request of requests) { messages.length = 0; await self.onmessage({ data: request }); assert.match(messages[0].error, /工作空间.*预算/); }
  assert.equal(decodes, 0);
  // AVIF does not expose dimensions through the shared lightweight header reader.
  // The same Window cap must be checked after decoding, closing the oversized bitmap.
  const avif = new File([await sharp({ create: { width: 2, height: 1, channels: 4, background: "red" } }).avif().toBuffer()], "late-dimensions.avif"); let closed = 0;
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() { closed++; } });
  await assert.rejects(preparePhotoEffectSource(avif, "sharpen", signal, true), /工作空间.*预算/);
  await assert.rejects(processPhotoEffect(avif, defaultSharpen, signal, undefined, true), /工作空间.*预算/);
  assert.equal(closed, 2);
});
test("Worker严格拒绝非法设备flag，false不能放宽本地Android/iPad检查", async (t) => {
  deviceEnvironment(t, { userAgent: "Android", deviceMemory: 4 });
  const resource = loadLocalModule("app/lib/resource-limits.ts"), messages = [], calls = [], self = { postMessage(message) { messages.push(message); } };
  effectEntrypoint("app/workers/image-photo-effects.worker.ts", (id) => {
    if (id === "../lib/resource-limits") return resource;
    if (id === "../lib/image-photo-effects") return { async preparePhotoEffectSource(_file, _kind, _signal, constrained) { calls.push(constrained); checkPhotoEffectWork(4000, 3000, "sharpen", constrained); }, async processPhotoEffect(_file, _options, _signal, _report, constrained) { calls.push(constrained); checkPhotoEffectWork(4000, 3000, "sharpen", constrained); } };
    throw new Error(`Unexpected Worker import: ${id}`);
  }, { self });
  const file = new File(["x"], "a.png");
  for (const flag of [undefined, null, 0, 1, "false", {}, []]) {
    messages.length = 0; await self.onmessage({ data: { action: "preview", file, kind: "sharpen", constrained: flag } }); assert.match(messages[0].error, /预算参数无效/); assert.equal(calls.length, 0);
  }
  for (const request of [{ action: "preview", file, kind: "sharpen", constrained: false }, { action: "process", file, options: defaultSharpen, constrained: false }]) {
    messages.length = 0; await self.onmessage({ data: request }); assert.match(messages[0].error, /工作空间.*预算/); assert.equal(calls.at(-1), true);
  }
  assert.throws(() => checkPhotoEffectWork(4000, 3000, "sharpen", false), /工作空间/);
  assert.throws(() => checkPhotoEffectWork(1, 1, "duotone", "false"), /预算参数无效/);
});

async function environment(t, work) {
  const names = ["OffscreenCanvas", "createImageBitmap", "ImageData"], saved = names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = []; let closed = 0, failEncode = false, onEncode = () => {};
  globalThis.ImageData = ImageData;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { const canvas = createCanvas(width, height); canvas.convertToBlob = async ({ type }) => { onEncode(); if (failEncode) throw new Error("encode failed"); return new Blob([canvas.toBuffer(type)], { type }); }; canvases.push(canvas); return canvas; }
  };
  globalThis.createImageBitmap = async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await work({ canvases, closed: () => closed, failEncoding: () => { failEncode = true; }, onEncoding: (fn) => { onEncode = fn; } });
}
async function png() { return new File([await sharp(Buffer.from([0, 0, 0, 255, 255, 255, 255, 128]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer()], "sample.png"); }
test("真实Canvas原尺寸PNG与缩略图像素、透明度一致，源bitmap和全部画布释放", async (t) => environment(t, async ({ canvases, closed }) => {
  const file = await png(), signal = new AbortController().signal, source = await preparePhotoEffectSource(file, "duotone", signal);
  assert.equal(source.width, 2); assert.equal(source.height, 1);
  const result = await processPhotoEffect(file, { ...defaultDuotone, shadow: "#000000", highlight: "#FFFFFF" }, signal), image = sharp(Buffer.from(await result.blob.arrayBuffer())), metadata = await image.metadata();
  assert.equal(metadata.width, 2); assert.equal(metadata.height, 1); assert.equal(result.width, 2); assert.equal(result.height, 1);
  assert.deepEqual([...await image.ensureAlpha().raw().toBuffer()], [0, 0, 0, 255, 255, 255, 255, 128]);
  assert.equal((await sharp(Buffer.from(await result.thumbnail.arrayBuffer())).metadata()).width, 2); assert.equal(closed(), 2);
  assert.ok(canvases.every((canvas) => canvas.width <= 1 && canvas.height <= 1));
}));
test("取消PNG编码与编码失败不泄露画布、不返回迟到结果", async (t) => environment(t, async ({ canvases, closed, onEncoding, failEncoding }) => {
  const controller = new AbortController(); onEncoding(() => controller.abort()); await assert.rejects(processPhotoEffect(await png(), defaultDuotone, controller.signal), { name: "AbortError" });
  onEncoding(() => {}); failEncoding(); await assert.rejects(processPhotoEffect(await png(), defaultSharpen, new AbortController().signal), /encode failed/);
  assert.equal(closed(), 2); assert.ok(canvases.every((canvas) => canvas.width <= 1 && canvas.height <= 1));
}));
test("专用Worker成功/取消/超时/消息错误清理一次，Blob移交不传输巨量像素，晚到结果无效", async () => {
  for (const mode of ["success", "cancel", "timeout", "message"]) {
    const app = workerClientHarness("app/lib/image-photo-effects-client.ts"), controller = new AbortController(), file = new File(["png"], "sample.png");
    const pending = app.exports.runPhotoEffect(file, defaultDuotone, controller.signal), worker = app.workers[0], late = worker.onmessage;
    assert.equal(worker.request.file, file); assert.equal(worker.request.action, "process"); assert.equal(worker.transfer.length, 0); assert.equal([...app.timers.values()][0].delay, 180000);
    if (mode === "success") { worker.emit({ result: { blob: new Blob(["result"]) } }); assert.equal((await pending).blob.size, 6); }
    else { if (mode === "cancel") controller.abort(); if (mode === "timeout") [...app.timers.values()][0].callback(); if (mode === "message") worker.onmessageerror(); await assert.rejects(pending); }
    late({ data: { result: "old" } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
  const app = workerClientHarness("app/lib/image-photo-effects-client.ts"), controller = new AbortController(), pending = app.exports.readPhotoEffectSource(new File(["x"], "a.png"), "sharpen", controller.signal);
  assert.equal(app.workers[0].request.action, "preview"); controller.abort(); await assert.rejects(pending);
});
