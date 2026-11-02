import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const lib = loadLocalModule("app/lib/image-vectorizer.ts"), opts = loadLocalModule("app/lib/image-vectorizer-options.ts"), options = { ...opts.defaultImageVectorizer, fitting: 0.1, speckles: 0 };
const signal = () => new AbortController().signal;
function pixels(width, height, color) { const out = new Uint8ClampedArray(width * height * 4); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(color(x, y), (y * width + x) * 4); return out; }
async function raster(result) { return sharp(Buffer.from(await result.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
function at(image, x, y) { return [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)]; }
function near(actual, expected, tolerance = 3) { actual.forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) <= tolerance, `${actual} vs ${expected}`)); }
test("真实 ImageTracer 生成彩色 path，Sharp 栅格化后色块中心正确，输出不含栅格或外链", async () => {
  const source = pixels(48, 40, (x, y) => x < 24 ? [240, 32, 18, 255] : y < 20 ? [18, 180, 65, 255] : [20, 50, 225, 255]), saved = source.slice();
  const result = await lib.traceVectorizerPixels(source, 48, 40, { ...options, colors: 3 }), image = await raster(result), text = await result.blob.text();
  assert.deepEqual(source, saved); assert.equal(result.paths, 3); assert.equal(image.info.width, 48); assert.equal(image.info.height, 40);
  near(at(image, 10, 20), [240, 32, 18, 255]); near(at(image, 35, 10), [18, 180, 65, 255]); near(at(image, 35, 30), [20, 50, 225, 255]);
  assert.match(text, /<path /); assert.doesNotMatch(text, /<image|data:|https?:\/\/(?!www\.w3\.org)|script|foreignObject|href=/i);
  const repeat = await lib.traceVectorizerPixels(source, 48, 40, { ...options, colors: 3 }); assert.equal(await repeat.blob.text(), text);
});
test("透明背景和透明洞保持空白，隐藏 RGB 不染色，半透明中心保留量化 alpha", async () => {
  const source = pixels(48, 48, (x, y) => x < 5 || x >= 43 || y < 5 || y >= 43 || x >= 17 && x < 31 && y >= 17 && y < 31 ? [99, 200, 40, 0] : [230, 45, 80, 128]);
  const result = await lib.traceVectorizerPixels(source, 48, 48, { ...options, colors: 2 }), image = await raster(result);
  assert.equal(at(image, 1, 1)[3], 0); assert.equal(at(image, 24, 24)[3], 0); near(at(image, 10, 10), [230, 45, 80, 128], 4); assert.match(await result.blob.text(), /<clipPath id="alpha">/);
});
test("不透明白底模式按 alpha 合成，不输出透明裁切或假透明度", async () => {
  const source = pixels(32, 24, (x) => x < 16 ? [200, 40, 10, 128] : [255, 0, 0, 0]), result = await lib.traceVectorizerPixels(source, 32, 24, { ...options, colors: 2, background: "white" }), image = await raster(result);
  near(at(image, 6, 12), [227, 147, 132, 255]); near(at(image, 26, 12), [255, 255, 255, 255]); assert.doesNotMatch(await result.blob.text(), /clipPath/);
});
test("明确缩放尺寸，窄图不放大；移动端拒绝2048预算，不暗降质量", () => {
  assert.deepEqual(opts.vectorizerDimensions(4000, 2000, 1024), { width: 1024, height: 512, scale: 0.256 }); assert.deepEqual(opts.vectorizerDimensions(1, 4, 512), { width: 1, height: 4, scale: 1 });
  assert.throws(() => lib.checkImageVectorizerWork(2048, 2048, 2048, 2048, true), /预算/); assert.ok(lib.checkImageVectorizerWork(2048, 2048, 1024, 1024, true)); assert.ok(lib.checkImageVectorizerWork(2048, 2048, 2048, 2048, false));
  for (const dims of [[0, 1, 1, 1], [8193, 1, 512, 1], [1, 1, 2, 1], [NaN, 1, 1, 1]]) assert.throws(() => lib.checkImageVectorizerWork(...dims));
});
test("非法选项、像素数据、全透明、复杂细纹和取消在追踪前明确拒绝", async () => {
  for (const bad of [null, {}, { ...options, edge: 768 }, { ...options, colors: 1 }, { ...options, colors: 32.5 }, { ...options, fitting: NaN }, { ...options, speckles: -1 }, { ...options, background: "black" }]) assert.throws(() => opts.validateImageVectorizer(bad));
  await assert.rejects(lib.traceVectorizerPixels(new Uint8ClampedArray(4), 2, 2, options), /像素/); await assert.rejects(lib.traceVectorizerPixels(new Uint8ClampedArray(64), 4, 4, options), /完全透明/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(lib.traceVectorizerPixels(new Uint8ClampedArray(64), 4, 4, options, controller.signal), { name: "AbortError" });
  const complex = pixels(700, 700, (x, y) => (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]); await assert.rejects(lib.traceVectorizerPixels(complex, 700, 700, { ...options, edge: 1024 }), /边缘过于复杂/);
  const interrupted = new AbortController(); await assert.rejects(lib.traceVectorizerPixels(pixels(8, 8, () => [20, 30, 40, 255]), 8, 8, options, interrupted.signal, () => interrupted.abort()), { name: "AbortError" });
});
test("SVG XML 白名单拒绝脚本、外部资源、实体、事件和超预算输出", () => {
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="1" height="1">${body}</svg>`, path = '<path fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="0" opacity="1" d="M 0 0 L 1 0 L 1 1 Z "/>';
  assert.equal(lib.readSafeVectorPaths(svg(path)).length, 1);
  for (const bad of [svg("<script/>"), svg('<image href="data:image/png;base64,a"/>'), svg("<foreignObject/>"), svg(path.replace('d="', 'onload="alert(1)" d="')), svg(path.replace('rgb(0,0,0)', 'url(https://example.com/a)')), svg(path.replace("M 0 0", "M NaN 0")), svg(path.replace('opacity="1"', 'opacity="2"')), svg(path.replace('stroke-width="0"', 'stroke-width="1"')), `<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///secret">]>${svg(path)}`, `<?xml-stylesheet href="https://example.com/a"?>${svg(path)}`, svg("<path/>")]) assert.throws(() => lib.readSafeVectorPaths(bad), /不安全|无效/);
  assert.throws(() => lib.readSafeVectorPaths(" ".repeat(opts.vectorizerLimits.bytes + 1)), /8 MiB/);
});
test("真实 ImageTracer 棋盘格触发路径预算，不输出超复杂SVG", async () => {
  const source = pixels(210, 210, (x, y) => (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
  await assert.rejects(lib.traceVectorizerPixels(source, 210, 210, { ...options, colors: 2 }), /描摹路径过多/);
});

async function environment(t, work) {
  const keys = ["OffscreenCanvas", "createImageBitmap"], saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = []; let closed = 0, fail = false, failCanvas = false, encoding = () => {};
  globalThis.OffscreenCanvas = class { constructor(width, height) { if (failCanvas) throw new Error("canvas unavailable"); const canvas = createCanvas(width, height); canvas.convertToBlob = async ({ type }) => { encoding(); if (fail) throw new Error("encode failed"); return new Blob([canvas.toBuffer(type)], { type }); }; canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await work({ canvases, closed: () => closed, failEncoding: () => { fail = true; }, failCanvas: () => { failCanvas = true; }, onEncoding: (fn) => { encoding = fn; } });
}
async function png(width = 800, height = 400) { return new File([await sharp({ create: { width, height, channels: 4, background: { r: 40, g: 80, b: 190, alpha: 0.5 } } }).png().toBuffer()], "sample.png", { type: "image/png" }); }
test("NativeCanvas 完整读图、显式缩放和真实SVG栅格结果，释放全部bitmap和canvas", async (t) => environment(t, async ({ canvases, closed }) => {
  const file = await png(), before = await lib.prepareImageVectorizerSource(file, signal()), result = await lib.processImageVectorizer(file, options, signal()), image = await raster(result), thumbnail = await sharp(Buffer.from(await before.thumbnail.arrayBuffer())).metadata();
  assert.equal(before.width, 800); assert.equal(thumbnail.width, 512); assert.equal(thumbnail.height, 256); assert.equal(result.width, 512); assert.equal(result.height, 256); assert.equal(result.scale, 0.64); assert.equal(result.sourceWidth, 800); near(at(image, 200, 100), [40, 80, 190, 128], 4);
  assert.equal(closed(), 2); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));
test("静态输入防护拒绝SVG/GIF/APNG与动画WebP，编码失败和取消也释放预览资源", async (t) => environment(t, async ({ canvases, closed, failEncoding, onEncoding }) => {
  for (const file of [new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "bad.svg"), new File(["GIF89a"], "bad.gif")]) await assert.rejects(lib.prepareImageVectorizerSource(file, signal()), /不支持|格式/);
  const raw = new Uint8Array(await (await png(2, 2)).arrayBuffer()), apng = new Uint8Array(raw.length + 20); apng.set(raw.subarray(0, 33)); apng.set([0, 0, 0, 8, 97, 99, 84, 76], 33); apng.set(raw.subarray(33), 53); await assert.rejects(lib.prepareImageVectorizerSource(new File([apng], "a.png"), signal()), /APNG/);
  const webp = new Uint8Array(30); webp.set(Buffer.from("RIFF")); webp.set(Buffer.from("WEBPVP8X"), 8); webp[20] = 2; await assert.rejects(lib.prepareImageVectorizerSource(new File([webp], "a.webp"), signal()), /动画 WebP/);
  const controller = new AbortController(); onEncoding(() => controller.abort()); await assert.rejects(lib.prepareImageVectorizerSource(await png(4, 4), controller.signal), { name: "AbortError" });
  onEncoding(() => {}); failEncoding(); await assert.rejects(lib.prepareImageVectorizerSource(await png(4, 4), signal()), /encode failed/); assert.equal(closed(), 2); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));
test("画布构造失败时预览与生成仍关闭已解码bitmap", async (t) => environment(t, async ({ closed, failCanvas }) => {
  failCanvas(); const file = await png(4, 4); await assert.rejects(lib.prepareImageVectorizerSource(file, signal()), /canvas unavailable/); await assert.rejects(lib.processImageVectorizer(file, options, signal()), /canvas unavailable/); assert.equal(closed(), 2);
}));
test("Worker client 成功、取消、超时、错误和损坏消息均终止一次，迟到消息无效", async () => {
  for (const mode of ["result", "abort", "timeout", "error", "malformed", "decode"]) {
    const harness = workerClientHarness("app/lib/image-vectorizer-client.ts"), controller = new AbortController(), promise = harness.exports.runImageVectorizer(new File(["x"], "a.png"), options, controller.signal), worker = harness.workers[0], late = worker.onmessage;
    assert.equal(worker.request.constrained, false); assert.equal(worker.request.action, "process"); worker.emit({ progress: 50, status: "trace" }); assert.equal(worker.terminations, 0);
    if (mode === "result") worker.emit({ result: { blob: new Blob(["svg"]) } }); else if (mode === "abort") controller.abort(); else if (mode === "timeout") [...harness.timers.values()][0].callback(); else if (mode === "error") worker.emit({ error: "bad image" }); else if (mode === "decode") worker.onmessageerror(); else worker.emit({ result: {}, error: "bad" });
    if (mode === "result") assert.ok((await promise).blob); else await assert.rejects(promise);
    assert.equal(worker.terminations, 1); assert.equal(harness.timers.size, 0); late({ data: { result: { blob: new Blob(["late"]) } } }); assert.equal(worker.terminations, 1);
  }
});
test("预取消不创建Worker，消息发送失败释放Worker与计时器", async () => {
  const cancelled = workerClientHarness("app/lib/image-vectorizer-client.ts"), controller = new AbortController(); controller.abort(); assert.throws(() => cancelled.exports.readImageVectorizerSource(new File(["x"], "a.png"), controller.signal)); assert.equal(cancelled.workers.length, 0);
  const broken = workerClientHarness("app/lib/image-vectorizer-client.ts", { failPost: true }); await assert.rejects(broken.exports.readImageVectorizerSource(new File(["x"], "a.png"), signal()), /cannot send/); assert.equal(broken.workers[0].terminations, 1); assert.equal(broken.timers.size, 0);
});
test("Worker 拒绝非法请求与缺失预算，不把失败误报为成功", async () => {
  const output = [], scope = { exports: {}, Blob, AbortController, Error, self: { postMessage: (value) => output.push(value) }, require(id) { if (id === "../lib/image-vectorizer") return { prepareImageVectorizerSource: async () => ({ width: 1 }), processImageVectorizer: async () => { throw new Error("bad pixels"); } }; if (id === "../lib/resource-limits") return { isConstrainedDevice: () => false }; throw new Error(id); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/workers/image-vectorizer.worker.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  for (const data of [null, {}, { action: "preview", file: new Blob() }, { action: "process", file: new Blob(), constrained: "false" }, { action: "other", file: new Blob(), constrained: false }]) { await scope.self.onmessage({ data }); assert.match(output.at(-1).error, /请求|参数/); }
  await scope.self.onmessage({ data: { action: "process", file: new Blob(), constrained: false } }); assert.equal(output.at(-1).error, "bad pixels");
  await scope.self.onmessage({ data: { action: "preview", file: new Blob(), constrained: false } }); assert.equal(output.at(-1).result.width, 1);
});
