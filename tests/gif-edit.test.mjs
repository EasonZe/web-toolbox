import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { makeGif } from "./helpers/ninth-fixtures.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";

const { editGifFrames, indexGifEditPixels } = loadLocalModule("app/lib/gif-edit.ts");
const { parseGifDelay, moveGifRow, validateGifEditOptions, checkGifEditWorkspace } = loadLocalModule("app/lib/gif-edit-options.ts");
const { extractGif, inspectGifBytes } = loadLocalModule("app/lib/gif-extract.ts");
const signal = () => new AbortController().signal;
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], yellow = [255, 255, 0, 255], clear = [0, 0, 0, 0];

function png(pixels, width = pixels.length / 4, height = 1) {
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return new Blob([canvas.toBuffer("image/png")], { type: "image/png" });
}
const raw = async (blob) => [...await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer()];
async function withRaster(work, mode = {}) {
  const names = ["OffscreenCanvas", "createImageBitmap", "ImageData", "navigator"], saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const canvases = [], bitmaps = [];
  class Canvas {
    constructor(width, height) { this.inner = createCanvas(width, height); this.w = width; this.h = height; canvases.push(this); }
    get width() { return this.w; } set width(value) { this.w = value; }
    get height() { return this.h; } set height(value) { this.h = value; }
    getContext() { return mode.noContext ? null : this.inner.getContext("2d"); }
    async convertToBlob() { return new Blob([this.inner.toBuffer("image/png")], { type: "image/png" }); }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: Canvas });
  Object.defineProperty(globalThis, "ImageData", { configurable: true, value: ImageData });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: mode.mobile ? "iPhone" : "Node", platform: "", maxTouchPoints: 0 } });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async (blob) => {
    if (mode.decodeFailure) throw new Error("invalid PNG");
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    const state = { closed: 0 }; bitmaps.push(state); image.close = () => state.closed++;
    mode.onDecode?.(); return image;
  } });
  try { await work({ canvases, bitmaps }); }
  finally { for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
}

async function extracted(bytes) {
  return extractGif(new File([bytes], "input.gif"), { start: 1, end: inspectGifBytes(bytes).frames.length, step: 1, background: "transparent" }, signal());
}
function loopCount(bytes) {
  const offset = Buffer.from(bytes).indexOf(Buffer.from("NETSCAPE2.0"));
  return offset < 0 ? null : bytes[offset + 13] | bytes[offset + 14] << 8;
}

test("GIF 编辑真实提取/重排/删除/重新编码后完整像素、透明区域与0ms延迟一致", async () => withRaster(async ({ canvases, bitmaps }) => {
  const source = await extracted(makeGif([{ pixels: [1, 1, 1], delay: 0 }, { pixels: [2], left: 1, dispose: 3, delay: 20 }, { pixels: [3], left: 2, dispose: 2, delay: 30 }, { pixels: [2], left: 0, delay: 0 }]));
  const frames = [source.images[3], source.images[1], source.images[2]].map((image, index) => ({ frame: image.frame, blob: image.blob, delay: [0, 70, 20][index] }));
  const result = await editGifFrames({ width: 3, height: 1, repeat: 0, frames }, signal());
  assert.equal(result.frames, 3); assert.equal(result.duration, 90); assert.equal(result.quantizedFrames, 0);
  const bytes = new Uint8Array(await result.blob.arrayBuffer()), info = inspectGifBytes(bytes);
  assert.deepEqual(info.frames.map((frame) => frame.delay), [0, 70, 20]);
  assert.deepEqual(info.frames.map((frame) => frame.disposal), [2, 2, 2]);
  assert.equal(loopCount(bytes), 0);
  const output = await extracted(bytes);
  assert.deepEqual(await raw(output.images[0].blob), [...green, ...red, ...clear]);
  assert.deepEqual(await raw(output.images[1].blob), [...red, ...green, ...red]);
  assert.deepEqual(await raw(output.images[2].blob), [...red, ...red, ...yellow]);
  assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  assert.ok(bitmaps.every((bitmap) => bitmap.closed === 1));
}));

test("GIF 全透明帧会清掉前一帧，不留下拖影；有限/无限/单次循环均真实写入", async () => withRaster(async () => {
  for (const repeat of [-1, 0, 7]) {
    const frames = [{ frame: 1, delay: 655350, blob: png([...red, ...red]) }, { frame: 2, delay: 0, blob: png([...clear, ...clear]) }, { frame: 3, delay: 10, blob: png([...clear, ...green]) }];
    const result = await editGifFrames({ width: 2, height: 1, repeat, frames }, signal());
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    assert.equal(loopCount(bytes), repeat < 0 ? null : repeat);
    const output = await extracted(bytes);
    assert.deepEqual(output.images.map((image) => image.delay), [655350, 0, 10]);
    assert.deepEqual(await raw(output.images[1].blob), [...clear, ...clear]);
    assert.deepEqual(await raw(output.images[2].blob), [...clear, ...green]);
  }
}));

test("GIF 编辑精确颜色映射与保留透明槽；超255不透明色才量化并标明", async () => withRaster(async () => {
  const exact = indexGifEditPixels(new Uint8ClampedArray([1, 2, 3, 255, 12, 34, 56, 255, 1, 2, 3, 0]));
  assert.equal(exact.quantized, false); assert.deepEqual([...exact.index], [1, 2, 0]); assert.deepEqual(exact.palette.slice(1), [[1, 2, 3], [12, 34, 56]]);
  const pixels = Array.from({ length: 300 }, (_, i) => [i % 256, Math.floor(i / 256) * 255, i * 11 % 256, 255]).flat();
  const mapped = indexGifEditPixels(new Uint8ClampedArray(pixels));
  assert.equal(mapped.quantized, true); assert.ok(mapped.palette.length <= 256); assert.ok(mapped.index.every((value) => value > 0));
  const result = await editGifFrames({ width: 300, height: 1, repeat: -1, frames: [{ frame: 1, delay: 0, blob: png(pixels) }] }, signal());
  assert.equal(result.quantizedFrames, 1); assert.equal(inspectGifBytes(new Uint8Array(await result.blob.arrayBuffer())).width, 300);
  assert.throws(() => indexGifEditPixels(new Uint8ClampedArray([1, 2, 3, 128])), /半透明/);
  assert.throws(() => indexGifEditPixels(new Uint8ClampedArray()), /像素数据/);
}));

test("GIF 延迟拒绝静默取整和16位溢出，帧移动不改原数组", () => {
  for (const text of ["0", "10", "655350"]) assert.equal(parseGifDelay(text), Number(text));
  for (const text of ["", " ", "1", "-10", "1.5", "NaN", "Infinity", "655360"]) assert.throws(() => parseGifDelay(text), /延迟/);
  const rows = [{ frame: 1, delay: "0", included: true }, { frame: 2, delay: "20", included: false }, { frame: 3, delay: "30", included: true }];
  assert.deepEqual(moveGifRow(rows, 1, 1).map((row) => row.frame), [1, 3, 2]);
  assert.deepEqual(rows.map((row) => row.frame), [1, 2, 3]);
  assert.equal(moveGifRow(rows, 0, -1), rows); assert.equal(moveGifRow(rows, 2, 1), rows);
});

test("GIF 编辑源、尺寸、帧数、循环和设备工作预算在像素分配前验证", () => {
  const frame = { frame: 1, delay: 0, blob: png(red) }, base = { width: 1, height: 1, repeat: 0, frames: [frame] };
  assert.ok(validateGifEditOptions(base) > 0);
  for (const patch of [{ width: 0 }, { height: 8193 }, { repeat: -2 }, { repeat: 65536 }, { repeat: 1.5 }, { frames: [] }, { frames: Array(201).fill(frame) }, { frames: [frame, frame] }, { frames: [{ ...frame, blob: new Blob(["x"], { type: "image/jpeg" }) }] }, { frames: [{ ...frame, delay: 1 }] }]) assert.throws(() => validateGifEditOptions({ ...base, ...patch }));
  assert.throws(() => checkGifEditWorkspace(8192, 8192, 0, 0), /工作空间/);
  assert.throws(() => checkGifEditWorkspace(1, 1, 0, NaN), /工作空间/);
});

test("GIF 编辑取消/解码失败/画布失败释放资源，不返回半成品", async () => {
  const options = { width: 1, height: 1, repeat: -1, frames: [{ frame: 1, delay: 0, blob: png(red) }, { frame: 2, delay: 0, blob: png(green) }] };
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(editGifFrames(options, aborted.signal));
  for (const mode of [{ decodeFailure: true }, { noContext: true }]) await withRaster(async ({ canvases, bitmaps }) => {
    await assert.rejects(editGifFrames(options, signal())); assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)); assert.ok(bitmaps.every((bitmap) => bitmap.closed === 1));
  }, mode);
  const duringDecode = new AbortController();
  await withRaster(async ({ canvases, bitmaps }) => {
    await assert.rejects(editGifFrames(options, duringDecode.signal), { name: "AbortError" });
    assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)); assert.ok(bitmaps.every((bitmap) => bitmap.closed === 1));
  }, { onDecode: () => duringDecode.abort() });
  await withRaster(async ({ canvases, bitmaps }) => {
    const controller = new AbortController(); await assert.rejects(editGifFrames(options, controller.signal, () => controller.abort()));
    assert.equal(bitmaps.length, 1); assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    await assert.rejects(editGifFrames({ ...options, width: 2 }, signal()), /尺寸/);
  });
});

test("GIF 编辑专属后台客户端取消/超时/失败终止一次，迟到消息不会提交", async () => {
  for (const mode of ["cancel", "timeout", "error", "messageerror", "complete"]) {
    const app = workerClientHarness("app/lib/gif-edit-worker-client.ts"), controller = new AbortController(), progress = [];
    const pending = app.exports.runGifEdit({ frames: [] }, controller.signal, (value) => progress.push(value));
    const worker = app.workers[0], late = worker.onmessage; assert.equal([...app.timers.values()][0].delay, 900000);
    worker.emit({ progress: 30, status: "encoding" }); assert.deepEqual(progress, [30]);
    if (mode === "cancel") controller.abort();
    else if (mode === "timeout") [...app.timers.values()][0].callback();
    else if (mode === "error") worker.onerror({ preventDefault() {} });
    else if (mode === "messageerror") worker.onmessageerror();
    else worker.emit({ result: "done" });
    if (mode === "complete") assert.equal(await pending, "done"); else await assert.rejects(pending);
    late({ data: { result: "late" } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
});
