import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { findDuplicateFiles, equalFileBytes } = loadLocalModule("app/lib/duplicate-files.ts");
const { validateDuplicateFiles } = loadLocalModule("app/lib/duplicate-file-options.ts");
const { createScannedPdf, renderScanPage } = loadLocalModule("app/lib/pdf-scan.ts");
const { defaultPdfScanOptions } = loadLocalModule("app/lib/pdf-scan-options.ts");
const { scanPixels } = loadLocalModule("app/lib/pdf-scan-pixels.ts");
const { hashChunkSize } = loadLocalModule("app/lib/file-hash-engine.ts");
const signal = () => new AbortController().signal;

test("重复文件按实际内容分组，改名可匹配，同名不同内容不能匹配", async () => {
  const files = [new File(["same"], "a.txt"), new File(["same"], "b.bin"), new File(["diff"], "a.txt"), new File(["x"], "unique"), new File([], "empty1"), new File([], "empty2")];
  const result = await findDuplicateFiles(files, signal());
  assert.equal(result.files, 6); assert.equal(result.hashed, 5); assert.equal(result.groups.length, 2); assert.equal(result.redundant, 2); assert.equal(result.redundantBytes, 4);
  assert.deepEqual(result.groups[0].files.map((file) => file.index), [0, 1]); assert.match(result.groups[0].sha256, /^[a-f\d]{64}$/);
  assert.equal(result.groups[1].size, 0); assert.equal(result.groups[0].files[0].path, "a.txt"); assert.equal(files[0].name, "a.txt"); assert.equal(await files[0].text(), "same");
});
test("文件大小先筛选，不读取只有一个同尺寸候选的文件", async () => {
  const file = (size) => ({ size, name: `file-${size}`, slice() { throw new Error("不应读取"); } });
  assert.deepEqual(await findDuplicateFiles([file(100), file(200)], signal()), { files: 2, hashed: 0, groups: [], redundant: 0, redundantBytes: 0 });
});
test("相同哈希仍逐字节核对，模拟碰撞不混组，保留目录内相对路径", async () => {
  const files = [new File(["aaa"], "one"), new File(["bbb"], "two"), new File(["aaa"], "three"), new File(["bbb"], "four")];
  Object.defineProperty(files[2], "webkitRelativePath", { value: "selected/sub/three" });
  const result = await findDuplicateFiles(files, signal(), undefined, async () => "0".repeat(64));
  assert.deepEqual(result.groups.map((group) => group.files.map((file) => file.index)), [[0, 2], [1, 3]]); assert.equal(result.groups[0].files[1].path, "selected/sub/three");
});
test("真实 SHA-256 与逐字节核对均只读取 2 MiB 切片，不整文件 arrayBuffer", async () => {
  const reads = [], bytes = new Uint8Array(hashChunkSize * 2 + 7).fill(41);
  const file = (name) => ({ name, size: bytes.length, lastModified: 0, arrayBuffer() { throw new Error("不应整文件读取"); }, slice(start, end) { reads.push(end - start); return new Blob([bytes.subarray(start, end)]); } });
  const result = await findDuplicateFiles([file("one"), file("two")], signal()); assert.equal(result.redundant, 1); assert.ok(reads.length >= 12); assert.ok(reads.every((size) => size <= hashChunkSize));
  let actualBytes = 0;
  const huge = (different) => ({ size: 20 * 1024 ** 3, slice(start, end) { const out = new Uint8Array(end - start); out[0] = different ? 1 : 0; actualBytes += out.length; return new Blob([out]); } });
  assert.equal(await equalFileBytes(huge(false), huge(true), signal()), false); assert.equal(actualBytes, hashChunkSize * 2, "20 GiB 虚拟源首次差异后立即停止，不是整文件磁盘测速");
});
test("重复文件读取失败、取消与输入边界明确，不返回半成品", async () => {
  for (const files of [[], [new File([], "one")], Array(2001).fill(new File([], "x"))]) assert.throws(() => validateDuplicateFiles(files), /2–2000/);
  assert.throws(() => validateDuplicateFiles([{ size: -1 }, { size: 1 }]), /大小/);
  const bad = { name: "bad", size: 1, slice() { return { arrayBuffer: async () => { throw new Error("read failed"); } }; } };
  await assert.rejects(findDuplicateFiles([bad, new File(["x"], "ok")], signal()), /read failed/);
  const controller = new AbortController(); await assert.rejects(findDuplicateFiles([new File(["a"], "a"), new File(["a"], "b")], controller.signal, () => controller.abort()), /Abort|abort/i);
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(equalFileBytes(new Blob(), new Blob(), cancelled.signal));
  await assert.rejects(findDuplicateFiles([new File([], "a"), new File([], "b")], signal(), undefined, async () => "invalid"), /SHA-256/);
});
test("扫描像素灰度、黑白、透明白底与原彩的数学结果正确", () => {
  const source = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0];
  assert.deepEqual([...scanPixels(new Uint8ClampedArray(source), "grayscale", 160)], [76, 76, 76, 255, 150, 150, 150, 255, 29, 29, 29, 255, 255, 255, 255, 255]);
  assert.deepEqual([...scanPixels(new Uint8ClampedArray(source), "threshold", 100)], [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  assert.deepEqual([...scanPixels(new Uint8ClampedArray(source), "color", 160)], source);
  for (const [pixels, mode, threshold] of [[new Uint8ClampedArray(3), "grayscale", 160], [new Uint8ClampedArray(4), "unknown", 160], [new Uint8ClampedArray(4), "grayscale", 256]]) assert.throws(() => scanPixels(pixels, mode, threshold), /参数/);
});

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const load = async (file) => pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise;
async function fixturePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([100, 120]); first.drawRectangle({ x: 0, y: 0, width: 100, height: 120, color: rgb(1, 0, 0) }); first.drawText("Source text", { x: 10, y: 90, font, size: 9 });
  const second = doc.addPage([80, 140]); second.drawRectangle({ x: 0, y: 0, width: 80, height: 140, color: rgb(0, 0, 1) }); second.setRotation(degrees(90));
  const third = doc.addPage([210, 100]); third.drawRectangle({ x: 0, y: 0, width: 210, height: 100, color: rgb(0, 1, 0) }); third.setCropBox(10, 20, 120, 70);
  doc.setTitle("Private original title"); doc.addJavaScript("never-run", 'app.alert("must not execute")');
  return new File([await doc.save()], "source.pdf", { type: "application/pdf" });
}
async function canvasRuntime(run) {
  const saved = ["document", "ImageData"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = [];
  class Canvas {
    constructor() { this.inner = createCanvas(1, 1); this.w = this.h = 1; canvases.push(this); }
    get width() { return this.w; } set width(v) { this.w = v; this.inner.width = Math.max(1, v); }
    get height() { return this.h; } set height(v) { this.h = v; this.inner.height = Math.max(1, v); }
    getContext() { const ctx = this.inner.getContext("2d"), original = ctx.drawImage.bind(ctx); ctx.drawImage = (image, ...args) => original(image.inner ?? image, ...args); return ctx; }
    toBlob(callback, type = "image/png", quality = 1) { void this.inner.encode(type === "image/jpeg" ? "jpeg" : "png", Math.round(quality * 100)).then((bytes) => callback(new Blob([bytes], { type }))); }
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new Canvas() } }); Object.defineProperty(globalThis, "ImageData", { configurable: true, value: ImageData });
  try { await run(canvases); } finally { for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
const renderer = (page, options, signal, preview) => renderScanPage(page, options, signal, preview, async (pixels, mode, threshold, signal) => { signal.throwIfAborted(); return scanPixels(pixels, mode, threshold); });
test("真实 PDF.js/Canvas/PDF-lib 生成图片型 PDF，页序、旋转、CropBox 与纸张尺寸保持可见结果", async () => canvasRuntime(async (canvases) => {
  const file = await fixturePdf(), original = new Uint8Array(await file.arrayBuffer());
  const result = await createScannedPdf(file, { ...defaultPdfScanOptions, range: "2,3,1", dpi: 72, format: "png", mode: "color" }, signal(), undefined, load, renderer);
  assert.equal(result.pages, 3); assert.deepEqual(result.sourcePages, [2, 3, 1]); assert.ok(result.preview);
  const doc = await PDFDocument.load(await result.blob.arrayBuffer()); assert.deepEqual(doc.getPages().map((page) => page.getSize()), [{ width: 140, height: 80 }, { width: 120, height: 70 }, { width: 100, height: 120 }]); assert.equal(doc.catalog.has(PDFName.of("Names")), false); assert.notEqual(doc.getTitle(), "Private original title");
  const output = await load(result.blob);
  try { for (let index = 1; index <= 3; index++) { const page = await output.getPage(index); assert.equal((await page.getTextContent()).items.length, 0); assert.equal((await page.getAnnotations()).length, 0); page.cleanup(); } } finally { await output.loadingTask.destroy(); }
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), original); assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
}));
test("扫描 PNG/JPEG 的实际预览像素符合灰度与阈值，输出尺寸由 DPI 决定", async () => canvasRuntime(async () => {
  const file = await fixturePdf();
  for (const [mode, format, range, expected] of [["grayscale", "png", "2", 29], ["grayscale", "jpeg", "2", 29], ["threshold", "png", "3", 255], ["threshold", "png", "2", 0]]) {
    const result = await createScannedPdf(file, { ...defaultPdfScanOptions, range, dpi: 144, format, mode, threshold: 100 }, signal(), undefined, load, renderer);
    const { data, info } = await sharp(Buffer.from(await result.preview.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, range === "2" ? 280 : 240); assert.ok(Math.abs(data[0] - expected) <= 2); assert.equal(data[0], data[1]); assert.equal(data[1], data[2]); assert.equal(data[3], 255);
    const output = await load(result.blob); try { const page = await output.getPage(1); assert.equal((await page.getTextContent()).items.length, 0); page.cleanup(); } finally { await output.loadingTask.destroy(); }
  }
}));
test("PDF 转扫描件无效参数/范围/渲染失败/取消/预算均有清理且不返回部分文件", async () => {
  const file = new File(["pdf"], "source.pdf");
  for (const patch of [{ dpi: 0 }, { mode: "other" }, { threshold: 256 }, { quality: NaN }, { format: "webp" }, { range: "x".repeat(10001) }]) await assert.rejects(createScannedPdf(file, { ...defaultPdfScanOptions, ...patch }, signal()), /设置/);
  for (const mode of ["range", "render", "cancel", "budget", "format"]) {
    let destroyed = 0, cleaned = 0; const controller = new AbortController();
    const page = { getViewport: () => ({ width: 100, height: 100 }), cleanup: () => cleaned++ };
    const loader = async () => ({ numPages: 2, loadingTask: { async destroy() { destroyed++; } }, async getPage() { return page; } });
    const render = async () => {
      if (mode === "render") throw new Error("render failed");
      if (mode === "cancel") controller.abort(new Error("用户取消"));
      return { blob: mode === "budget" ? { type: "image/jpeg", size: 300 * 1024 ** 2 } : new Blob(["not encoded"], { type: "image/png" }) };
    };
    await assert.rejects(createScannedPdf(file, { ...defaultPdfScanOptions, range: mode === "range" ? "3" : "1-2" }, controller.signal, undefined, loader, render), /范围|render failed|用户取消|预算|格式/);
    assert.ok(destroyed >= 1); assert.equal(cleaned, mode === "range" ? 0 : 1);
  }
});
test("扫描过滤异步失败或取消时释放真实画布，原 PDF 图片导出无过滤器仍可用", async () => canvasRuntime(async (canvases) => {
  const pdf = await load(await fixturePdf()), page = await pdf.getPage(1);
  try {
    await assert.rejects(renderScanPage(page, { ...defaultPdfScanOptions, dpi: 72 }, signal(), true, async () => { throw new Error("filter failed"); }), /filter failed/);
    const controller = new AbortController(); await assert.rejects(renderScanPage(page, { ...defaultPdfScanOptions, dpi: 72 }, controller.signal, true, async (pixels) => { controller.abort(); return pixels; }));
    assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  } finally { page.cleanup(); await pdf.loadingTask.destroy(); }
}));
