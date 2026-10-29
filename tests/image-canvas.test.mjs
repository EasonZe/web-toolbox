import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { defaultImageCanvas, canvasAnchors, validateImageCanvas, canvasImagePlacement, prepareCanvasSource, createImageCanvas } = loadLocalModule("app/lib/image-canvas.ts");
const signal = () => new AbortController().signal;
const options = (values) => ({ ...defaultImageCanvas, ...values });

test("画布适配保持比例，九宫格定位正确，原尺寸模式拒绝意外裁图", () => {
  assert.deepEqual(canvasImagePlacement(100, 50, options({ width: 200, height: 200 })), { x: 0, y: 50, width: 200, height: 100, scale: 2 });
  assert.deepEqual(canvasImagePlacement(100, 50, options({ width: 200, height: 200, fit: "cover", anchor: "right" })), { x: -200, y: 0, width: 400, height: 200, scale: 4 });
  for (const anchor of canvasAnchors) {
    const p = canvasImagePlacement(100, 50, options({ width: 200, height: 200, anchor, fit: "original" }));
    assert.equal(p.width, 100); assert.equal(p.height, 50); assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 150);
  }
  assert.throws(() => canvasImagePlacement(200, 100, options({ width: 100, height: 100, fit: "original" })), /不小于原图/);
  for (const values of [{ width: 0 }, { height: 8193 }, { width: 1.5 }, { height: NaN }, { background: "red" }, { transparent: "true" }, { anchor: "diagonal" }, { fit: "stretch" }]) assert.throws(() => validateImageCanvas(options(values)));
  assert.throws(() => canvasImagePlacement(0, 5, defaultImageCanvas), /原图尺寸/);
  assert.deepEqual(canvasImagePlacement(1, 1, options({ width: 2, height: 2, fit: "original" })), { x: 0, y: 0, width: 1, height: 1, scale: 1 });
  assert.doesNotThrow(() => validateImageCanvas(options({ transparent: true, background: "#12" })));
});

async function withCanvas(t, work) {
  const descriptors = ["document", "createImageBitmap", "navigator"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]), canvases = []; let closed = 0, decoded = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "desktop" } });
  globalThis.document = { createElement() { const canvas = createCanvas(1, 1); canvas.toBlob = (callback, mime) => callback(new Blob([canvas.toBuffer(mime)], { type: mime })); canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { decoded++; const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  await work({ canvases, closed: () => closed, decoded: () => decoded });
}
async function readPixels(blob) {
  const { data, info } = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, at(x, y) { return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]; } };
}
async function redFile() { return new File([await sharp({ create: { width: 4, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()], "red.png"); }

test("纯色与透明PNG实际像素正确，预览不偷偷改变下载尺寸", async (t) => withCanvas(t, async ({ canvases, decoded }) => {
  const blue = await createImageCanvas(null, options({ width: 8, height: 6, background: "#0000ff" }), signal()), pixels = await readPixels(blue.blob);
  assert.equal(pixels.width, 8); assert.equal(pixels.height, 6); assert.deepEqual(pixels.at(0, 0), [0, 0, 255, 255]); assert.equal(blue.placement, null);
  const empty = await createImageCanvas(null, options({ width: 3, height: 2, transparent: true }), signal());
  assert.equal((await readPixels(empty.blob)).at(1, 1)[3], 0); assert.equal(decoded(), 0); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));

test("原尺寸扩边、完整适配和填满裁切正确，不改变源文件，缩略图和资源均清理", async (t) => withCanvas(t, async ({ canvases, closed }) => {
  const file = await redFile(), before = await file.arrayBuffer();
  const source = await prepareCanvasSource(file, signal()); assert.equal(source.width, 4); assert.equal(source.height, 2); assert.equal(source.file, file);
  const extension = await createImageCanvas(file, options({ width: 8, height: 6, fit: "original", anchor: "bottom-right", background: "#0000ff" }), signal()), image = await readPixels(extension.blob);
  assert.deepEqual(image.at(0, 0), [0, 0, 255, 255]); assert.deepEqual(image.at(7, 5), [255, 0, 0, 255]); assert.deepEqual(image.at(4, 4), [255, 0, 0, 255]);
  const contain = await readPixels((await createImageCanvas(file, options({ width: 8, height: 8, fit: "contain", transparent: true }), signal())).blob);
  assert.equal(contain.at(0, 0)[3], 0); assert.deepEqual(contain.at(4, 4), [255, 0, 0, 255]);
  const cover = await readPixels((await createImageCanvas(file, options({ width: 8, height: 8, fit: "cover", transparent: true }), signal())).blob);
  assert.deepEqual(cover.at(0, 0), [255, 0, 0, 255]); assert.deepEqual(cover.at(7, 7), [255, 0, 0, 255]);
  assert.deepEqual(await file.arrayBuffer(), before); assert.equal(closed(), 4); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));

test("透明源像素正确叠加底色，透明模式保留alpha", async (t) => withCanvas(t, async () => {
  const file = new File([await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()], "half.png");
  const opaque = await readPixels((await createImageCanvas(file, options({ width: 2, height: 2, fit: "original", background: "#0000ff" }), signal())).blob);
  const pixel = opaque.at(0, 0); assert.ok(pixel[0] >= 126 && pixel[0] <= 129); assert.ok(pixel[2] >= 126 && pixel[2] <= 129); assert.equal(pixel[3], 255);
  const alpha = (await readPixels((await createImageCanvas(file, options({ width: 2, height: 2, fit: "original", transparent: true }), signal())).blob)).at(0, 0)[3]; assert.ok(alpha >= 127 && alpha <= 128);
}));

test("原尺寸奇数扩边不把1个不透明像素摊成4个半透明像素", async (t) => withCanvas(t, async () => {
  const file = new File([await sharp({ create: { width: 1, height: 1, channels: 4, background: "red" } }).png().toBuffer()], "one.png");
  const image = await readPixels((await createImageCanvas(file, options({ width: 2, height: 2, fit: "original", transparent: true }), signal())).blob);
  assert.deepEqual(image.at(0, 0), [255, 0, 0, 255]); assert.equal(image.at(1, 0)[3], 0); assert.equal(image.at(0, 1)[3], 0); assert.equal(image.at(1, 1)[3], 0);
}));

test("带EXIF方向的JPEG按浏览器纠正后的尺寸放置，不被原始文件头误拒绝", async (t) => withCanvas(t, async () => {
  const bytes = await sharp({ create: { width: 4, height: 2, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const file = new File([bytes], "rotated.jpg"), create = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async (input) => create(new File([await sharp(Buffer.from(await input.arrayBuffer())).rotate().png().toBuffer()], "oriented.png"));
  const source = await prepareCanvasSource(file, signal()); assert.equal(source.width, 2); assert.equal(source.height, 4);
  const output = await createImageCanvas(file, options({ width: 2, height: 4, fit: "original" }), signal());
  assert.equal(output.width, 2); assert.equal(output.height, 4); assert.equal(output.placement.scale, 1);
}));

test("大画布按设备工作空间预检；取消和编码异常不泄漏bitmap或画布", async (t) => withCanvas(t, async ({ canvases, decoded, closed }) => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone" } });
  await assert.rejects(createImageCanvas(null, options({ width: 8192, height: 8192 }), signal()), /预算/); assert.equal(canvases.length, 0);
  const controller = new AbortController(); controller.abort(); await assert.rejects(createImageCanvas(null, defaultImageCanvas, controller.signal), { name: "AbortError" }); assert.equal(decoded(), 0);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "desktop" } });
  const encode = document.createElement; document.createElement = () => { const canvas = encode(); canvas.toBlob = (callback) => callback(null); return canvas; };
  await assert.rejects(createImageCanvas(await redFile(), options({ width: 8, height: 6 }), signal()), /PNG 编码失败/); assert.equal(closed(), 1); assert.ok(canvases.every((canvas) => canvas.width === 1));
  const active = new AbortController(); document.createElement = () => { const canvas = encode(), toBlob = canvas.toBlob; canvas.toBlob = (...args) => { active.abort(); toBlob(...args); }; return canvas; };
  await assert.rejects(createImageCanvas(await redFile(), options({ width: 8, height: 6 }), active.signal), { name: "AbortError" }); assert.equal(closed(), 2);
}));
