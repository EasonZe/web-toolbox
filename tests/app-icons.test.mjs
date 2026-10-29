import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { strFromU8, unzipSync } from "fflate";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { mountComponent } from "./helpers/hook-runtime.mjs";
const { defaultAppIcons, planAppIcons, appIconPlacement, appIconNeedsUpscale, appIconManifest, renderAppIcons } = loadLocalModule("app/lib/app-icons.ts");
const options = (patch = {}) => ({ ...defaultAppIcons, platforms: [...defaultAppIcons.platforms], ...patch });
const signal = () => new AbortController().signal;
async function environment(t, work) {
  const saved = ["document", "createImageBitmap", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = [];
  let decoded = 0, closed = 0, encode;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Node raster adapter" } });
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); const canvas = createCanvas(1, 1); canvas.toBlob = (callback, mime) => { if (encode) return encode(callback, mime, canvas); callback(new Blob([canvas.toBuffer(mime)], { type: mime })); }; canvases.push(canvas); return canvas; } };
  globalThis.createImageBitmap = async (file) => { decoded++; const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return work({ canvases, decoded: () => decoded, closed: () => closed, onEncode(fn) { encode = fn; } });
}
async function source(width = 20, height = 10) {
  return new File([await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()], "source.png", { type: "image/png" });
}
async function pixels(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer()), metadata = await sharp(bytes).metadata(), { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(metadata.format, "png");
  return { width: info.width, height: info.height, hasAlpha: metadata.hasAlpha, at: (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)], allOpaque: () => data.every((value, index) => index % 4 !== 3 || value === 255) };
}

test("应用图标尺寸、路径与平台集合明确，名称和参数拒绝非法值", () => {
  const all = planAppIcons(options());
  assert.deepEqual(all.map((item) => item.size), [192, 512, 180, 1024, 48, 72, 96, 144, 192]);
  assert.equal(new Set(all.map((item) => item.path)).size, 9);
  assert.equal(all.filter((item) => item.opaque).length, 2);
  assert.deepEqual(planAppIcons(options({ platforms: ["android"] })).map((item) => item.path), ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"].map((value) => `android/res/mipmap-${value}/ic_launcher.png`));
  for (const patch of [{ platforms: [] }, { platforms: ["web", "web"] }, { platforms: ["ios"] }, { fit: "stretch" }, { padding: NaN }, { padding: -1 }, { padding: 36 }, { transparent: 1 }, { background: "red" }, { name: " " }, { name: "x".repeat(81) }, { name: "a\nb" }]) assert.throws(() => planAppIcons(options(patch)), /平台|无效|名称/);
});

test("图标完整适配与裁切保持比例，内边距为每侧百分比", () => {
  assert.deepEqual(appIconPlacement(200, 100, 100, options({ padding: 10 })), { x: 10, y: 30, width: 80, height: 40, inset: 10, edge: 80 });
  assert.deepEqual(appIconPlacement(200, 100, 100, options({ padding: 10, fit: "cover" })), { x: -30, y: 10, width: 160, height: 80, inset: 10, edge: 80 });
  assert.equal(appIconNeedsUpscale(2000, 50, options({ platforms: ["web"] })), false);
  assert.equal(appIconNeedsUpscale(2000, 50, options({ platforms: ["web"], fit: "cover" })), true);
  for (const dimensions of [[0, 10, 100], [10, 0, 100], [10, 10, 1025], [1.5, 10, 100], [10001, 10000, 100]]) assert.throws(() => appIconPlacement(...dimensions, options()), /尺寸/);
});

test("Web 清单使用相对 icons 路径和 purpose:any，不猜站点路径或冒称 maskable", () => {
  const manifest = JSON.parse(appIconManifest(options({ name: ' 图标 "测试" ' })));
  assert.equal(manifest.name, '图标 "测试"');
  assert.deepEqual(manifest.icons, [192, 512].map((size) => ({ src: `icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })));
  assert.equal(manifest.start_url, undefined); assert.equal(manifest.scope, undefined);
});

test("真实 Canvas 仅解码一次生成9张PNG，透明源Web保留透明、Apple全像素不透明，ZIP路径与清单一致", async (t) => environment(t, async ({ decoded, closed, canvases }) => {
  const result = await renderAppIcons(await source(), options({ transparent: true, background: "#00ff00" }), signal());
  assert.equal(result.icons.length, 9); assert.equal(result.enlarged, true);
  const archive = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
  assert.equal(Object.keys(archive).length, 11);
  for (const icon of result.icons) {
    const image = await pixels(icon.blob);
    assert.deepEqual([image.width, image.height], [icon.size, icon.size]);
    assert.deepEqual(archive[icon.path], new Uint8Array(await icon.blob.arrayBuffer()));
    if (icon.platform === "apple") { assert.equal(image.allOpaque(), true); assert.equal(image.hasAlpha, false); assert.deepEqual(image.at(0, 0), [0, 255, 0, 255]); }
    else { assert.equal(image.at(0, 0)[3], 0); assert.equal(image.at(Math.floor(icon.size / 2), Math.floor(icon.size / 2))[3], 128); }
  }
  const manifest = JSON.parse(strFromU8(archive["web/manifest.webmanifest"]));
  for (const icon of manifest.icons) assert.ok(archive[`web/${icon.src}`]);
  assert.match(strFromU8(archive["README.txt"]), /不是 adaptive|不包含 adaptive/);
  assert.match(strFromU8(archive["README.txt"]), /不代表已满足全部 App Store/);
  assert.equal(decoded(), 1); assert.equal(closed(), 1);
  assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));

test("cover仍保留内边距，非透明模式合成底色，单平台ZIP不夹带其他平台资源", async (t) => environment(t, async () => {
  const result = await renderAppIcons(await source(), options({ platforms: ["web"], fit: "cover", padding: 25, background: "#0000ff" }), signal());
  const image = await pixels(result.icons[0].blob);
  assert.equal(image.allOpaque(), true); assert.deepEqual(image.at(0, 96), [0, 0, 255, 255]);
  assert.ok(image.at(96, 96)[0] >= 126 && image.at(96, 96)[0] <= 129);
  assert.deepEqual(image.at(47, 96), [0, 0, 255, 255]);
  const archive = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
  assert.ok(Object.keys(archive).every((path) => path === "README.txt" || path.startsWith("web/")));
  const android = await renderAppIcons(await source(), options({ platforms: ["android"] }), signal());
  const androidArchive = unzipSync(new Uint8Array(await android.zip.arrayBuffer()));
  assert.equal(Object.keys(androidArchive).length, 6); assert.equal(androidArchive["web/manifest.webmanifest"], undefined);
}));

test("生成途中取消和PNG编码错误不产生ZIP，释放源bitmap与画布", async (t) => environment(t, async ({ decoded, closed, canvases, onEncode }) => {
  const file = await source(), controller = new AbortController();
  await assert.rejects(renderAppIcons(file, options(), controller.signal, () => controller.abort()), { name: "AbortError" });
  onEncode((callback) => callback(null));
  await assert.rejects(renderAppIcons(file, options(), signal()), /编码失败/);
  onEncode((callback) => callback(new Blob(["wrong"], { type: "image/jpeg" })));
  await assert.rejects(renderAppIcons(file, options(), signal()), /格式无效/);
  assert.equal(decoded(), 3); assert.equal(closed(), 3); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
}));

test("APNG、动画WebP、GIF与SVG在解码前拒绝，不静默丢帧", async (t) => environment(t, async ({ decoded }) => {
  const bytes = Buffer.from(await (await source()).arrayBuffer()), actl = Buffer.alloc(20); actl.writeUInt32BE(8, 0); actl.write("acTL", 4);
  await assert.rejects(renderAppIcons(new File([bytes.subarray(0, 33), actl, bytes.subarray(33)], "a.png"), options(), signal()), /APNG/);
  const webp = Buffer.alloc(30); webp.write("RIFF", 0); webp.write("WEBPVP8X", 8); webp[20] = 2;
  await assert.rejects(renderAppIcons(new File([webp], "a.webp"), options(), signal()), /动画 WebP/);
  for (const [name, contents] of [["a.gif", "GIF89a"], ["a.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>']]) await assert.rejects(renderAppIcons(new File([contents], name), options(), signal()));
  assert.equal(decoded(), 0);
}));

test("真实useLocalTask卸载取消正在编码的图标，迟到编码回调释放图片资源且不恢复结果", async (t) => environment(t, async ({ closed, canvases, onEncode }) => {
  let finishEncoding, started;
  const encoding = new Promise((resolve) => { started = resolve; });
  onEncode((callback, mime, canvas) => { finishEncoding = () => callback(new Blob([canvas.toBuffer(mime)], { type: mime })); started(); });
  const app = mountComponent("app/components/local-workbench.tsx", "useLocalTask", (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined);
  const task = app.render(); app.flushEffects();
  const file = await source(), pending = task.run((signal) => renderAppIcons(file, options({ platforms: ["web"] }), signal));
  await encoding; app.unmount(); assert.equal(await pending, undefined);
  finishEncoding(); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(closed(), 1); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
  assert.equal(app.render().result, null);
}));

test("Apple RGB PNG编码器拒绝透明像素和非法尺寸，并能在处理扫描行时取消", async (t) => environment(t, async () => {
  const { opaqueAppIconPng } = loadLocalModule("app/lib/app-icons-png.ts"), canvas = createCanvas(256, 256), context = canvas.getContext("2d");
  await assert.rejects(opaqueAppIconPng(context, 256, signal()), /未完全合成/);
  await assert.rejects(opaqueAppIconPng(context, 1025, signal()), /尺寸无效/);
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, 256, 256);
  const controller = new AbortController(), pending = opaqueAppIconPng(context, 256, controller.signal); controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
}));
