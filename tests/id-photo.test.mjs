import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const { defaultIdPhoto, defaultIdPaper, mmToPixels, idPhotoSize, idPhotoCrop, idPaperLayout, makeIdPhoto, makeIdPhotoSheet } = loadLocalModule("app/lib/id-photo.ts");

test("证件照 mm/DPI、裁切焦点与放大关系精确，不歪曲宽高比", () => {
  assert.equal(mmToPixels(25.4, 300), 300); assert.deepEqual(idPhotoSize(defaultIdPhoto), { width: 295, height: 413 });
  const options = { ...defaultIdPhoto, widthMm: 25, heightMm: 25, zoom: 2, focusX: 100, focusY: 0 };
  assert.deepEqual(idPhotoCrop(400, 200, options), { x: 300, y: 0, width: 100, height: 100 });
  for (const invalid of [{ widthMm: 0 }, { heightMm: NaN }, { dpi: 0 }, { dpi: 300.1 }, { zoom: 0 }, { focusY: 101 }, { background: "red" }, { format: "webp" }]) assert.throws(() => idPhotoSize({ ...defaultIdPhoto, ...invalid }), /无效|预算/);
  assert.throws(() => idPhotoSize({ ...defaultIdPhoto, widthMm: 200, heightMm: 200, dpi: 1200 }), /预算/);
});
test("相纸排版不裁掉额外张数，每张位于边距内且不重叠", () => {
  const result = idPaperLayout(defaultIdPhoto, defaultIdPaper); assert.equal(result.positions.length, 8); assert.ok(result.capacity >= 8);
  for (const p of result.positions) { assert.ok(p.x >= mmToPixels(5, 300)); assert.ok(p.y >= mmToPixels(5, 300)); assert.ok(p.x + result.photo.width <= result.width - mmToPixels(5, 300)); assert.ok(p.y + result.photo.height <= result.height - mmToPixels(5, 300)); }
  for (let i = 0; i < result.positions.length; i++) for (let j = i + 1; j < result.positions.length; j++) {
    const a = result.positions[i], b = result.positions[j]; assert.ok(Math.abs(a.x - b.x) >= result.photo.width + result.gap || Math.abs(a.y - b.y) >= result.photo.height + result.gap);
  }
  for (const invalid of [{ copies: 201 }, { copies: 1.5 }, { copies: result.capacity + 1 }, { widthMm: 20, heightMm: 20 }, { gapMm: -1 }, { marginMm: 51 }]) assert.throws(() => idPaperLayout(defaultIdPhoto, { ...defaultIdPaper, ...invalid }), /无效|最多|预算/);
});
async function canvasEnvironment(t, work) {
  const saved = ["document", "createImageBitmap"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = []; let closed = 0;
  globalThis.document = { createElement() { const canvas = createCanvas(1, 1); canvas.toBlob = (callback, mime) => callback(new Blob([canvas.toBuffer(mime)], { type: mime })); canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  await work({ canvases, closed: () => closed });
}
async function source() {
  const pixels = new Uint8Array(10 * 10 * 4); for (let i = 0; i < 100; i++) if (i % 10 < 5) pixels.set([255, 0, 0, 255], i * 4);
  return new File([await sharp(pixels, { raw: { width: 10, height: 10, channels: 4 } }).png().toBuffer()], "portrait.png");
}
test("真实 Canvas 单张 PNG/JPEG 与相纸像素、底色和 DPI 元数据一致，资源释放", async (t) => canvasEnvironment(t, async ({ canvases, closed }) => {
  const file = await source(), options = { ...defaultIdPhoto, widthMm: 25.4, heightMm: 25.4, dpi: 100, background: "#0000ff" };
  for (const format of ["png", "jpeg"]) {
    const result = await makeIdPhoto(file, { ...options, format }, new AbortController().signal), bytes = Buffer.from(await result.blob.arrayBuffer()), image = sharp(bytes), metadata = await image.metadata();
    assert.equal(metadata.width, 100); assert.equal(metadata.height, 100); assert.equal(metadata.density, 100); assert.equal(metadata.format, format);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    const red = at(10, 50), blue = at(90, 50); assert.ok(red[0] > 245 && red[1] < 10 && red[2] < 10); assert.ok(blue[2] > 245 && blue[0] < 10 && blue[1] < 10);
  }
  const paper = { widthMm: 100, heightMm: 60, marginMm: 5, gapMm: 3, copies: 2, guides: true }, layout = idPaperLayout(options, paper), result = await makeIdPhotoSheet(file, options, paper, new AbortController().signal);
  const bytes = Buffer.from(await result.blob.arrayBuffer()), metadata = await sharp(bytes).metadata(); assert.equal(metadata.width, layout.width); assert.equal(metadata.height, layout.height); assert.equal(metadata.density, 100); assert.equal(result.copies, 2);
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); assert.deepEqual([...data.subarray(0, 4)], [255, 255, 255, 255]);
  for (const p of layout.positions) { const offset = ((p.y + 50) * layout.width + p.x + 10) * 4; assert.deepEqual([...data.subarray(offset, offset + 4)], [255, 0, 0, 255]); }
  assert.equal(closed(), 4); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));
test("取消照片编码不返回结果，当前 bitmap 和画布仍清理", async (t) => canvasEnvironment(t, async ({ canvases, closed }) => {
  const controller = new AbortController(), original = document.createElement;
  document.createElement = () => { const canvas = original(); const encode = canvas.toBlob; canvas.toBlob = (...args) => { controller.abort(); encode(...args); }; return canvas; };
  await assert.rejects(makeIdPhoto(await source(), defaultIdPhoto, controller.signal), { name: "AbortError" });
  assert.equal(closed(), 1); assert.equal(canvases[0].width, 1);
}));
test("人像线程只在显式调用时启动，取消与超时清理，不遗留后台任务", async () => {
  const app = workerClientHarness("app/lib/id-photo-matte-client.ts"); assert.equal(app.workers.length, 0);
  const controller = new AbortController(), pending = app.exports.runPortraitMatte(new Blob(["png"], { type: "image/png" }), controller.signal, () => {}), worker = app.workers[0], late = worker.onmessage;
  assert.equal([...app.timers.values()][0].delay, 600000); controller.abort(); await assert.rejects(pending); late({ data: { result: new Blob() } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
});
