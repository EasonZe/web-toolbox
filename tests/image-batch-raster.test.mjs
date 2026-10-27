import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import ts from "typescript";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const nativeRequire = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRef = process.env.TOOLBOX_RASTER_BASELINE_REF;
if (baselineRef && !/^[a-f\d]{40}$/i.test(baselineRef)) throw new Error("TOOLBOX_RASTER_BASELINE_REF 必须是完整提交 SHA。");
function committedSource(kind) {
  if (!baselineRef) return null;
  try { return execFileSync("git", ["show", `${baselineRef}:app/components/${kind}.tsx`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { return null; } // Source archives may omit .git; raster checks still run.
}
const sources = Object.fromEntries(["image-compressor", "image-converter"].map((kind) => [kind, {
  current: readFileSync(new URL(`../app/components/${kind}.tsx`, import.meta.url), "utf8"),
  // Optional read-only comparison against an explicitly pinned algorithm. No history,
  // source file, dependency, browser, or deployment state is changed by this test.
  committed: committedSource(kind),
}]));

const width = 32, height = 24;
const rgba = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4;
  rgba[i] = (x * 37 + y * 13) % 256;
  rgba[i + 1] = (x * 17 + y * 31) % 256;
  rgba[i + 2] = (x * 23 + y * 11) % 256;
  rgba[i + 3] = x < 8 ? 0 : x < 16 ? 128 : 255;
}
const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
const jpeg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 89 }).toBuffer();
const webp = await sharp(png).webp({ quality: 89 }).toBuffer();
const fixtures = { "image/png": png, "image/jpeg": jpeg, "image/webp": webp };

function rasterAdapter() {
  let sequence = 0;
  const urls = new Map(), revoked = [], canvases = [], bitmaps = [], images = [];
  class LocalImage {
    onload = null;
    onerror = null;
    native = null;
    version = 0;
    constructor() { images.push(this); }
    get naturalWidth() { return this.native?.width ?? 0; }
    get naturalHeight() { return this.native?.height ?? 0; }
    get src() { return this.url ?? ""; }
    set src(value) {
      const version = ++this.version;
      this.url = value;
      if (!value) { this.native = null; return; }
      const blob = urls.get(value);
      Promise.resolve().then(async () => {
        if (!blob) throw new Error("Unknown local raster URL");
        const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
        if (version !== this.version) return;
        this.native = image; this.onload?.();
      }).catch(() => { if (version === this.version) this.onerror?.(); });
    }
  }
  function canvas() {
    const native = createCanvas(1, 1);
    const record = { native, logicalWidth: 300, logicalHeight: 150, resets: [], encodes: [] };
    const wrapper = {
      get width() { return record.logicalWidth; },
      set width(value) { record.logicalWidth = value; if (value === 0) record.resets.push("width"); native.width = Math.max(1, value); },
      get height() { return record.logicalHeight; },
      set height(value) { record.logicalHeight = value; if (value === 0) record.resets.push("height"); native.height = Math.max(1, value); },
      getContext(type, options) {
        const context = native.getContext(type, options);
        return new Proxy(context, {
          get(target, property) {
            if (property === "drawImage") return (source, ...args) => target.drawImage(source.native ?? source, ...args);
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) { return Reflect.set(target, property, value, target); },
        });
      },
      toBlob(callback, type, quality) {
        const encode = { type, quality, width: record.logicalWidth, height: record.logicalHeight, blobSize: 0 };
        record.encodes.push(encode);
        native.toBlob((blob) => { encode.blobSize = blob?.size ?? 0; callback(blob); }, type, quality);
      },
    };
    // napi Canvas interprets zero as a default size, unlike HTMLCanvasElement.
    // Keep the application's observable zero writes, but shrink native storage to
    // 1x1. This verifies cleanup intent, not real-browser backing-store memory.
    record.wrapper = wrapper; canvases.push(record); return wrapper;
  }
  const globals = {
    Blob, File, AbortController, AbortSignal, DOMException, console, setTimeout, clearTimeout,
    crypto: { randomUUID: () => `item-${++sequence}` }, Image: LocalImage,
    URL: {
      createObjectURL(blob) { const url = `blob:raster-${++sequence}`; urls.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); urls.delete(url); },
    },
    createImageBitmap: async (blob) => {
      const native = await loadImage(Buffer.from(await blob.arrayBuffer()));
      const record = { image: native, closed: 0 };
      native.close = () => { record.closed++; };
      bitmaps.push(record); return native;
    },
    document: { createElement: (tag) => tag === "canvas" ? canvas() : { click() {}, remove() {} }, body: { append() {} } },
    window: { setTimeout, clearTimeout },
  };
  return { globals, urls, revoked, canvases, bitmaps, images };
}

function resolveLocal(id) {
  if (id === "./file-drop-zone") return { FileDropZone: "drop-zone" };
  if (id === "./tool-handoff") return { ResultContinue: "result-continue", ToolHandoffInput: "handoff-input" };
  if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
}

function algorithm(kind, revision, adapter, { format = "image/png", quality = 73, background = "#34a8d9" } = {}) {
  let source = sources[kind][revision];
  if (kind === "image-compressor") source += "\nexports.testAlgorithm = compressImage;";
  else source = source.replace("async function convertItem(", "exports.testAlgorithm = convertItem;\n  async function convertItem(");
  const scope = { exports: {}, ...adapter.globals };
  scope.require = (id) => {
    if (id === "react") return {
      useState(initial) { return [initial === "image/jpeg" ? format : initial === 90 ? quality : initial === "#ffffff" ? background : initial, () => {}]; },
      useRef: (initial) => ({ current: initial }), useEffect() {}, useMemo: (work) => work(),
    };
    if (id === "next/link") return { __esModule: true, default: "a" };
    return resolveLocal(id) ?? nativeRequire(id);
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, scope);
  if (kind === "image-converter") scope.exports.default();
  assert.equal(typeof scope.exports.testAlgorithm, "function");
  return scope.exports.testAlgorithm;
}

async function readRaster(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { bytes, metadata: await sharp(bytes).metadata(), ...(await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })) };
}

function assertDimensions(raster, format) {
  assert.equal(raster.metadata.width, width); assert.equal(raster.metadata.height, height);
  assert.equal(raster.metadata.format, format === "image/jpeg" ? "jpeg" : format.slice(6));
}

function assertCanvasCleanup(adapter) {
  assert.ok(adapter.canvases.length > 0);
  for (const canvas of adapter.canvases) {
    assert.deepEqual(canvas.resets, ["width", "height"]);
    assert.equal(canvas.wrapper.width, 0); assert.equal(canvas.wrapper.height, 0);
    assert.equal(canvas.native.width, 1); assert.equal(canvas.native.height, 1);
  }
  for (const bitmap of adapter.bitmaps) assert.equal(bitmap.closed, 1);
}

test("真实 PNG/JPEG/WebP 压缩在质量1/73/100保留尺寸和格式，有Git基线时逐字节对照", async (context) => {
  for (const format of Object.keys(fixtures)) for (const quality of [1, 73, 100]) {
    const file = new File([fixtures[format]], `source.${format.slice(6)}`, { type: format });
    const current = rasterAdapter(), previous = rasterAdapter();
    const result = await algorithm("image-compressor", "current", current)(file, quality, new AbortController().signal);
    const old = sources["image-compressor"].committed ? await algorithm("image-compressor", "committed", previous)(file, quality) : null;
    const raster = await readRaster(result.blob);
    assertDimensions(raster, format);
    assert.ok(result.blob.size <= file.size);
    if (old) {
      assert.equal(result.usedOriginal, old.usedOriginal);
      assert.deepEqual(raster.bytes, Buffer.from(await old.blob.arrayBuffer()), `${format} quality=${quality}`);
    }
    if (format !== "image/jpeg") {
      assert.equal(raster.data[3], 0);
      assert.equal(raster.data[(width - 1) * 4 + 3], 255);
    }
    assertCanvasCleanup(current);
  }
  context.diagnostic(sources["image-compressor"].committed ? `9 个压缩组合均与 ${baselineRef} 的算法输出逐字节一致。` : "未设置或未取得固定 Git 基线；只执行真实 raster 校验，没有声称完成前后等值比较。");
});

test("PNG 压缩实际执行质量量化，保持半透明像素，质量100保留不透明像素原色", async () => {
  for (const quality of [1, 73, 100]) {
    const adapter = rasterAdapter(), file = new File([png], "alpha.png", { type: "image/png" });
    const result = await algorithm("image-compressor", "current", adapter)(file, quality, new AbortController().signal);
    assert.equal(result.usedOriginal, false, "the uncompressed PNG fixture should exercise encoding rather than fallback");
    const raster = await readRaster(result.blob), colorTable = loadLocalModule("app/lib/image-compression-quality.ts").pngColorTable(quality);
    assert.equal(raster.data[12 * 4 + 3], 128);
    const index = (8 * width + 24) * 4;
    assert.deepEqual([...raster.data.subarray(index, index + 3)], [...rgba.subarray(index, index + 3)].map((value) => colorTable[value]));
    assertCanvasCleanup(adapter);
  }
});

test("真实小 PNG 编码更大时返回原 File，不增大文件或改变字节", async () => {
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 4, background: "red" } }).png({ compressionLevel: 9 }).toBuffer();
  const file = new File([tiny], "tiny.png", { type: "image/png" }), adapter = rasterAdapter();
  const result = await algorithm("image-compressor", "current", adapter)(file, 100, new AbortController().signal);
  assert.ok(adapter.canvases[0].encodes[0].blobSize >= file.size, "the native encoder must actually produce a larger candidate");
  assert.equal(result.usedOriginal, true);
  assert.equal(result.blob, file);
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), tiny);
  assertCanvasCleanup(adapter);
});

test("真实图片转换保留 PNG/WebP 透明度与 JPEG 背景，有Git基线时逐字节对照", async (context) => {
  const cases = [
    ["image/png", "image/png", 73], ["image/png", "image/png", 100],
    ["image/png", "image/jpeg", 73], ["image/png", "image/jpeg", 100],
    ["image/jpeg", "image/png", 100], ["image/webp", "image/webp", 73], ["image/png", "image/webp", 100],
  ];
  for (const [input, format, quality] of cases) {
    const current = rasterAdapter(), previous = rasterAdapter();
    const file = new File([fixtures[input]], `source.${input.slice(6)}`, { type: input });
    const run = async (revision, adapter) => {
      const previewUrl = adapter.globals.URL.createObjectURL(file);
      return algorithm("image-converter", revision, adapter, { format, quality })({ file, previewUrl, width, height }, new AbortController().signal);
    };
    const blob = await run("current", current), old = sources["image-converter"].committed ? await run("committed", previous) : null, raster = await readRaster(blob);
    assertDimensions(raster, format);
    if (old) assert.deepEqual(raster.bytes, Buffer.from(await old.arrayBuffer()), `${input} -> ${format} quality=${quality}`);
    if (input !== "image/jpeg" && format !== "image/jpeg") {
      assert.equal(raster.data[3], 0); assert.equal(raster.data[12 * 4 + 3], 128);
    }
    if (format === "image/jpeg") {
      const corner = (width + 1) * 4;
      for (const [channel, expected] of [[0, 52], [1, 168], [2, 217]]) assert.ok(Math.abs(raster.data[corner + channel] - expected) <= 8);
      assert.equal(raster.data[corner + 3], 255);
    }
    assertCanvasCleanup(current);
    assert.ok(current.images.every((image) => image.src === ""), "the decoding Image releases its source after conversion");
  }
  context.diagnostic(sources["image-converter"].committed ? `7 个转换组合均与 ${baselineRef} 的算法输出逐字节一致。` : "未设置或未取得固定 Git 基线；只执行真实 raster 校验，没有声称完成前后等值比较。");
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
}

for (const kind of ["image-compressor", "image-converter"]) test(`${kind}真实绘制后的结果 URL 在卸载时释放，导出的 Blob 仍可读取`, async () => {
  const adapter = rasterAdapter();
  const ui = mountComponent(`app/components/${kind}.tsx`, kind === "image-compressor" ? "ImageCompressor" : "ImageConverter", resolveLocal, adapter.globals);
  const render = () => { ui.render(); ui.flushEffects(); return ui.render(); };
  render();
  await find(render(), (node) => node.type === "drop-zone").props.onFiles([new File([png], "real.png", { type: "image/png" })]);
  const runClass = kind === "image-compressor" ? "convert-button image-compressor-run" : "convert-button image-converter-download";
  await find(render(), (node) => node.props?.className === runClass).props.onClick();
  const next = find(render(), (node) => node.type === "result-continue");
  assert.equal(next.props.count, 1);
  const result = next.props.getFiles()[0], decoded = await readRaster(result);
  assertDimensions(decoded, kind === "image-compressor" ? "image/png" : "image/jpeg");
  assert.equal(adapter.urls.size, 2, "one input preview and one generated result are owned by the tool");
  ui.unmount(); assert.equal(adapter.urls.size, 0); assert.equal(adapter.revoked.length, 2);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), decoded.bytes, "handoff Files remain valid after URL ownership is released");
  assertCanvasCleanup(adapter);
});
