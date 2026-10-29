import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { defaultRoundedImage, planRoundedImage, renderRoundedImage } = loadLocalModule("app/lib/image-rounded.ts");
const defaults = (options = {}) => ({ ...defaultRoundedImage, corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }, ...options });
const signal = () => new AbortController().signal;
async function environment(t, work) {
  const saved = ["document", "createImageBitmap", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = []; let closed = 0, decoded = 0, encode;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Node raster adapter" } });
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); const canvas = createCanvas(1, 1); canvas.toBlob = (callback, mime) => { if (encode) return encode(callback, mime, canvas); callback(new Blob([canvas.toBuffer(mime)], { type: mime })); }; canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { decoded++; const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return work({ canvases, closed: () => closed, decoded: () => decoded, onEncode: (fn) => { encode = fn; } });
}
async function source(width = 20, height = 16, hole = true) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!hole || x < width / 2 - 1 || x > width / 2 + 1 || y < height / 2 - 1 || y > height / 2 + 1) pixels.set([255, 0, 0, 255], (y * width + x) * 4);
  return new File([await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer()], "source.png", { type: "image/png" });
}
async function raster(result) {
  const bytes = Buffer.from(await result.blob.arrayBuffer()), metadata = await sharp(bytes).metadata(), { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(metadata.format, "png"); assert.equal(info.width, result.width); assert.equal(info.height, result.height);
  return { info, at: (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)] };
}
test("圆角规划验证四角、百分比/像素和内外尺寸，不给动态内存预算另加硬像素限", () => {
  const options = defaults({ radiusUnit: "percent", corners: { topLeft: 50, topRight: 25, bottomRight: 10, bottomLeft: 0 } });
  assert.deepEqual(planRoundedImage(40, 20, options).corners, { topLeft: 10, topRight: 5, bottomRight: 2, bottomLeft: 0 });
  assert.equal(planRoundedImage(40, 20, defaults({ border: "outside", borderWidth: 5 })).width, 50);
  assert.equal(planRoundedImage(40, 20, defaults({ border: "inside", borderWidth: 5 })).width, 40);
  assert.equal(planRoundedImage(8000, 8000, defaults()).width, 8000);
  for (const patch of [{ border: "x" }, { borderWidth: NaN }, { borderWidth: 2.5 }, { borderColor: "red" }, { radiusUnit: "x" }, { corners: { topLeft: 51, topRight: 0, bottomRight: 0, bottomLeft: 0 } }, { border: "inside", borderWidth: 11 }]) assert.throws(() => planRoundedImage(40, 20, defaults(patch)), /无效|百分比|一半/);
  assert.throws(() => planRoundedImage(8192, 20, defaults({ border: "outside", borderWidth: 1 })), /8192/);
  assert.throws(() => planRoundedImage(40, 20, defaults({ radiusUnit: "pixels", corners: { topLeft: 11, topRight: 0, bottomRight: 0, bottomLeft: 0 } })), /一半/);
});
test("真实 Canvas 四角独立圆角保留像素尺寸和 PNG 透明通道，所有资源清理", async (t) => environment(t, async ({ canvases, closed }) => {
  const result = await renderRoundedImage(await source(), defaults({ radiusUnit: "pixels", corners: { topLeft: 0, topRight: 8, bottomRight: 0, bottomLeft: 8 } }), signal()), image = await raster(result);
  assert.deepEqual(image.at(0, 0), [255, 0, 0, 255]); assert.equal(image.at(19, 0)[3], 0); assert.deepEqual(image.at(19, 15), [255, 0, 0, 255]); assert.equal(image.at(0, 15)[3], 0);
  assert.equal(image.at(10, 8)[3], 0, "transparent source center is not filled"); assert.deepEqual([result.width, result.height], [20, 16]);
  assert.equal(closed(), 1); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));
test("真实内框覆盖内侧像素，外框扩展2倍宽度且不在透明原图内垫底", async (t) => environment(t, async () => {
  const file = await source(), inside = await raster(await renderRoundedImage(file, defaults({ border: "inside", borderWidth: 2, borderColor: "#0000ff" }), signal()));
  assert.deepEqual([inside.info.width, inside.info.height], [20, 16]); assert.deepEqual(inside.at(0, 8), [0, 0, 255, 255]); assert.deepEqual(inside.at(2, 8), [255, 0, 0, 255]); assert.equal(inside.at(10, 8)[3], 0);
  const outside = await raster(await renderRoundedImage(file, defaults({ border: "outside", borderWidth: 2, borderColor: "#0000ff" }), signal()));
  assert.deepEqual([outside.info.width, outside.info.height], [24, 20]); assert.deepEqual(outside.at(0, 8), [0, 0, 255, 255]); assert.deepEqual(outside.at(2, 8), [255, 0, 0, 255]); assert.equal(outside.at(12, 10)[3], 0);
  const half = new File([await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 20, g: 100, b: 180, alpha: 0.5 } } }).png().toBuffer()], "half.png");
  const alpha = await raster(await renderRoundedImage(half, defaults({ border: "outside", borderWidth: 2, borderColor: "#0000ff" }), signal()));
  assert.equal(alpha.at(8, 8)[3], 128, "outside frame must not make a semitransparent source opaque");
}));
test("真实圆形遮罩保留非方图画布、圆外透明；圆形内外边框不拉伸来源", async (t) => environment(t, async () => {
  const file = await source(30, 20, false), plain = await raster(await renderRoundedImage(file, defaults({ shape: "circle" }), signal()));
  assert.deepEqual([plain.info.width, plain.info.height], [30, 20]); assert.equal(plain.at(0, 10)[3], 0); assert.deepEqual(plain.at(15, 10), [255, 0, 0, 255]);
  for (const border of ["inside", "outside"]) {
    const image = await raster(await renderRoundedImage(file, defaults({ shape: "circle", border, borderWidth: 2, borderColor: "#0000ff" }), signal()));
    const offset = border === "outside" ? 2 : 0;
    assert.deepEqual(image.at(15 + offset, border === "outside" ? 1 : 1), [0, 0, 255, 255]); assert.deepEqual(image.at(15 + offset, 10 + offset), [255, 0, 0, 255]); assert.equal(image.at(0, 0)[3], 0);
  }
}));
test("取消编码和编码异常都拒绝结果并关闭源bitmap与输出Canvas", async (t) => environment(t, async ({ onEncode, canvases, closed }) => {
  const file = await source(), controller = new AbortController();
  onEncode((callback, mime, canvas) => { controller.abort(); callback(new Blob([canvas.toBuffer(mime)], { type: mime })); });
  await assert.rejects(renderRoundedImage(file, defaults(), controller.signal), { name: "AbortError" });
  onEncode((callback) => callback(null)); await assert.rejects(renderRoundedImage(file, defaults(), signal()), /编码失败/);
  onEncode(() => { throw new Error("native encode failed"); }); await assert.rejects(renderRoundedImage(file, defaults(), signal()), /native encode failed/);
  assert.equal(closed(), 3); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));
test("APNG、动画 WebP、GIF/SVG 在解码前拒绝，不静默只导出第一帧", async (t) => environment(t, async ({ decoded }) => {
  const bytes = Buffer.from(await (await source()).arrayBuffer()), actl = Buffer.alloc(20); actl.writeUInt32BE(8, 0); actl.write("acTL", 4);
  const apng = new File([bytes.subarray(0, 33), actl, bytes.subarray(33)], "a.png");
  await assert.rejects(renderRoundedImage(apng, defaults(), signal()), /APNG/);
  const webp = Buffer.alloc(30); webp.write("RIFF", 0); webp.write("WEBPVP8X", 8); webp[20] = 2;
  await assert.rejects(renderRoundedImage(new File([webp], "a.webp"), defaults(), signal()), /动画 WebP/);
  for (const [name, contents] of [["a.gif", "GIF89a"], ["a.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>']]) await assert.rejects(renderRoundedImage(new File([contents], name), defaults(), signal()));
  assert.equal(decoded(), 0);
}));
test("手机按源/输出联合缓冲预算保护，不将16MP/32MP当成固定上限；外框超边长预先拒绝", async (t) => environment(t, async ({ decoded }) => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Android" } });
  assert.equal(planRoundedImage(6000, 6000, defaults()).width, 6000);
  assert.throws(() => planRoundedImage(7000, 7000, defaults()), /工作空间/);
  const data = Buffer.from(await (await source()).arrayBuffer()); data.writeUInt32BE(8192, 16);
  await assert.rejects(renderRoundedImage(new File([data], "large.png"), defaults({ border: "outside", borderWidth: 1 }), signal()), /8192/);
  assert.equal(decoded(), 0);
}));
