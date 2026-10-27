import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const handoff = loadLocalModule("app/lib/tool-handoff.ts"), pageTools = loadLocalModule("app/lib/pdf-page-tools.ts"), pages = loadLocalModule("app/lib/pdf-pages.ts"), imagePdf = loadLocalModule("app/lib/images-pdf.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function button(tree, label) { const value = allElements(tree, (node) => node.type === "button" && text(node) === label)[0]; assert.ok(value, label); return value; }
const element = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function task() {
  return { result: null, error: "", busy: false, progress: 0, status: "", reset() { this.result = null; this.error = ""; }, cancel() {}, setError(value) { this.error = value; },
    run(work) { this.reset(); this.busy = true; this.pending = (async () => { try { this.result = await work(new AbortController().signal, () => {}); return this.result; } catch (cause) { this.error = cause.message; } finally { this.busy = false; } })(); return this.pending; },
  };
}
async function png(width = 20, height = 40) { return new Blob([await sharp({ create: { width, height, channels: 4, background: "red" } }).png().toBuffer()], { type: "image/png" }); }
async function fixturePdf(label) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica); doc.addPage([600, 800]).drawText(label, { x: 100, y: 300, font, size: 12 });
  return new File([await doc.save()], `${label}.pdf`, { type: "application/pdf" });
}
async function pdfWorker(request, signal, report) {
  // Real Worker structured cloning recreates typed arrays in the receiving realm.
  if (request.action === "pdf-inspect") return pages.inspectPdf(new Uint8Array(request.data));
  if (request.action === "pdf-build") return pages.buildPdf(Array.from(request.sources, (bytes) => new Uint8Array(bytes)), request.choices);
  if (request.action === "pdf-split") return loadLocalModule("app/lib/local-archive.ts").packZip(await pages.splitPdf(Array.from(request.sources, (bytes) => new Uint8Array(bytes)), request.choices));
  if (request.action === "pdf-page-info") return pageTools.inspectPdfGeometry(request.file, signal);
  if (request.action === "pdf-crop") return pageTools.cropPdfPages(request.file, request.options, signal, report);
  if (request.action === "pdf-number") return pageTools.numberPdfPages(request.file, request.options, signal, report);
  if (request.action === "images-pdf") return imagePdf.buildImagesPdf(request.files, request.options, signal, report, async (file) => {
    const data = new Uint8Array(await file.arrayBuffer()), metadata = await sharp(data).metadata(); return { data, width: metadata.width, height: metadata.height, format: "png" };
  });
  throw new Error(request.action);
}
function workbench(path, name, props, options = {}) {
  const tasks = [task(), task(), task()], calls = []; let cursor = 0;
  const app = mountComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => tasks[cursor++], LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl: (blob) => blob ? "blob:test" : "" };
    if (id === "./tool-handoff") return { ResultContinue: "result-continue", ToolHandoffInput: "handoff-input" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./pdf-local-preview") return { PdfLocalPreview: "pdf-preview" };
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request, signal, report) => { calls.push(request); return (options.worker ?? pdfWorker)(request, signal, report); } };
    if (id === "../lib/video-capture") return { inspectCaptureVideo: async () => ({ width: 100, height: 100, duration: 2, canDecode: true }), captureVideo: async (_file, opts) => ({ blob: options.frame, name: opts.count === 1 ? "frame.png" : "frames.zip", count: opts.count, width: 20, height: 40 }) };
    if (id === "../lib/raster-preview") return { readRasterPreview: async (file) => ({ file, width: 20, height: 40, thumbnail: file }) };
    if (id === "./workbench-pagination") return { WorkbenchPagination: "pagination" };
    if (id === "./design-color-input") return { DesignColorInput: "color-input" };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { tasks, calls, unmount: app.unmount, render() { cursor = 0; return app.render(props); } };
}
function receiver(store) {
  return mountComponent("app/components/tool-handoff.tsx", "ToolHandoffInput", (id) => {
    if (id === "../lib/tool-handoff") return { ...handoff, subscribeHandoff: store.subscribe, handoffSnapshot: store.snapshot, peekHandoff: store.peek, discardHandoff: store.discard };
    if (id === "../lib/resource-limits") return loadLocalModule("app/lib/resource-limits.ts");
    if (id === "../lib/local-images") return loadLocalModule("app/lib/local-images.ts");
    if (id === "./local-workbench") return { LocalDownload: "download" };
  });
}
async function deliver(store, target, continuation, targetProps) {
  const files = continuation.getFiles(); store.offer(target, files, continuation.source);
  const ui = receiver(store); ui.render(targetProps); ui.flushEffects(); button(ui.render(targetProps), "接收文件").props.onClick(); await tick();
  // Target imports may perform real PDF parsing, so wait for the acknowledgement.
  for (let i = 0; i < 200 && store.snapshot(); i++) await tick();
  assert.equal(store.snapshot(), null, "target should acknowledge the original file batch"); ui.unmount(); return files;
}
const memoryStore = () => handoff.createToolHandoffStore({ schedule: () => 1, cancel: () => {} });

test("真实 PDF：合并 → 确认导入裁切 → 加页码，字节衔接、页序与可见区域保持", async () => {
  const manager = workbench("pdf-page-manager", "PdfPageManager"), store = memoryStore();
  await element(manager.render(), "upload").props.onFiles([await fixturePdf("one"), await fixturePdf("two")]);
  assert.equal(manager.tasks[0].error, "");
  button(manager.render(), "合并 / 导出 PDF").props.onClick(); await manager.tasks[1].pending;
  const merged = manager.tasks[1].result.blob, next = element(manager.render(), "result-continue").props;
  const crop = workbench("pdf-page-tools", "PdfPageTools", { mode: "crop" });
  const imported = await deliver(store, "/pdf-cropper", next, element(crop.render(), "handoff-input").props);
  assert.deepEqual(new Uint8Array(await imported[0].arrayBuffer()), new Uint8Array(await merged.arrayBuffer())); assert.equal(crop.calls.length, 1); assert.equal(crop.calls[0].action, "pdf-page-info");
  assert.equal(crop.tasks[1].result, null, "receiving must not crop automatically");
  button(crop.render(), "裁剪并导出").props.onClick(); await crop.tasks[1].pending;
  const numbers = workbench("pdf-page-tools", "PdfPageTools", { mode: "numbers" });
  await deliver(store, "/pdf-page-numbers", element(crop.render(), "result-continue").props, element(numbers.render(), "handoff-input").props);
  assert.equal(numbers.tasks[1].result, null); button(numbers.render(), "添加页码并导出").props.onClick(); await numbers.tasks[1].pending;
  const output = numbers.tasks[1].result.blob, doc = await PDFDocument.load(await output.arrayBuffer()); assert.equal(doc.getPageCount(), 2);
  for (const page of doc.getPages()) assert.deepEqual(page.getCropBox(), { x: 30, y: 40, width: 540, height: 720 });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"), loaded = await pdfjs.getDocument({ data: new Uint8Array(await output.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise;
  try { for (const [index, label] of ["one", "two"].entries()) { const body = (await (await loaded.getPage(index + 1)).getTextContent()).items.map((item) => item.str).join(" "); assert.match(body, new RegExp(label)); assert.match(body, new RegExp(`${index + 1} / 2`)); } }
  finally { await loaded.loadingTask.destroy(); }
  manager.unmount(); crop.unmount(); numbers.unmount(); store.clear();
});

test("真实 PNG 批次接收按原序追加，不自动合成，导出 PDF 可继续裁切", async () => {
  const first = handoff.resultFile(await png(20, 40), "first.png"), second = handoff.resultFile(await png(60, 30), "second.png"), app = workbench("images-to-pdf", "ImagesToPdf"), store = memoryStore();
  await element(app.render(), "upload").props.onFiles([first]);
  await deliver(store, "/images-to-pdf", { source: "图片处理", getFiles: () => [second] }, element(app.render(), "handoff-input").props);
  assert.equal(app.calls.length, 0); assert.match(text(app.render()), /页面顺序 · 2 张/);
  allElements(app.render(), (node) => node.type === "select" && node.props.value === "jpeg")[0].props.onChange({ target: { value: "png" } });
  button(app.render(), "合成 PDF").props.onClick(); await app.tasks[0].pending;
  assert.deepEqual(Array.from(app.calls[0].files, (file) => file.name), ["first.png", "second.png"]);
  const doc = await PDFDocument.load(await app.tasks[0].result.arrayBuffer()); assert.equal(doc.getPageCount(), 2); assert.ok(doc.getPage(0).getHeight() > doc.getPage(0).getWidth()); assert.ok(doc.getPage(1).getWidth() > doc.getPage(1).getHeight());
  assert.deepEqual(Array.from(element(app.render(), "result-continue").props.targets), ["/pdf-page-numbers", "/pdf-cropper"]); app.unmount();
});

test("PDF 拆分 ZIP、视频批量 ZIP 不提供图片或 PDF 继续处理，单张截图可转交", async () => {
  const manager = workbench("pdf-page-manager", "PdfPageManager"); await element(manager.render(), "upload").props.onFiles([await fixturePdf("one")]); assert.equal(manager.tasks[0].error, "");
  button(manager.render(), "逐页拆分（ZIP）").props.onClick(); await manager.tasks[1].pending; assert.equal(manager.tasks[1].result.blob.type, "application/zip"); assert.equal(element(manager.render(), "result-continue"), undefined);
  const frame = await png(), video = workbench("video-capture", "VideoCapture", undefined, { frame });
  await element(video.render(), "upload").props.onFiles([new File(["video"], "a.mp4")]); button(video.render(), "截取此时间画面").props.onClick(); await video.tasks[1].pending;
  const file = element(video.render(), "result-continue").props.getFiles()[0]; assert.equal(file.type, "image/png"); assert.equal(file.name, "frame.png"); assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await frame.arrayBuffer()));
  allElements(video.render(), (node) => node.type === "input" && node.props.max === 200)[0].props.onChange({ target: { value: "2" } });
  button(video.render(), "批量取帧").props.onClick(); await video.tasks[1].pending; assert.equal(element(video.render(), "result-continue"), undefined); manager.unmount(); video.unmount();
});

test("图片换色传递生成结果而非原图，改参数后继续处理入口随旧输出清除", async () => {
  const generated = await png(20, 40), app = workbench("image-color-replace", "ImageColorReplace", undefined, { worker: async () => ({ blob: generated, preview: generated, width: 20, height: 40, changed: 10 }) });
  await element(app.render(), "upload").props.onFiles([new File(["original"], "original.png", { type: "image/png" })]); button(app.render(), "开始替换").props.onClick(); await app.tasks[1].pending;
  const next = element(app.render(), "result-continue").props, file = next.getFiles()[0]; assert.equal(file.name, "color-replaced.png"); assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await generated.arrayBuffer()));
  element(app.render(), "color-input").props.onChange("#000000"); assert.equal(element(app.render(), "result-continue"), undefined); app.unmount();
});

test("图片转 PDF 接收仍执行原容量和格式检查，失败不添加部分文件", () => {
  const app = workbench("images-to-pdf", "ImagesToPdf"); let input = element(app.render(), "handoff-input").props;
  assert.equal(input.onFiles([new File(["image"], "ok.png")]), true); input = element(app.render(), "handoff-input").props;
  assert.equal(input.onFiles([new File(["image"], "extra.png"), new File(["svg"], "bad.svg")]), false); assert.match(text(app.render()), /页面顺序 · 1 张/);
  assert.equal(input.onFiles(Array(200).fill(new File(["image"], "too-many.png"))), false); assert.match(app.tasks[0].error, /数量|200/); app.unmount();
});

function pictureWorkbench(kind, encoded, manualImages = false) {
  let sequence = 0; const resources = new Map(), revoked = [], images = [];
  class FixtureImage {
    naturalWidth = 2; naturalHeight = 2;
    set src(value) { this.url = value; images.push(this); if (!manualImages) queueMicrotask(() => this.onload?.()); }
  }
  const app = mountComponent(`app/components/${kind}.tsx`, kind === "image-compressor" ? "ImageCompressor" : kind === "image-converter" ? "ImageConverter" : "ImageTextEditor", (id) => {
    if (id === "./file-drop-zone") return { FileDropZone: "drop-zone" };
    if (id === "./tool-handoff") return { ResultContinue: "result-continue", ToolHandoffInput: "handoff-input" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  }, {
    URL: { createObjectURL(blob) { const url = `blob:fixture-${++sequence}`; resources.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); resources.delete(url); } },
    crypto: { randomUUID: () => `id-${++sequence}` }, Image: FixtureImage,
    createImageBitmap: async () => ({ width: 2, height: 2, close() {} }),
    document: { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData() {} }), toBlob: (callback, type) => callback(encoded[type]) }) },
  });
  return { ...app, images, revoked, resources };
}

test("图片压缩 / 转换的继续处理保留全部完成结果的原序、文件名与输出字节", async () => {
  const encoded = { "image/png": await png(2, 2), "image/jpeg": new Blob([await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).jpeg().toBuffer()], { type: "image/jpeg" }) };
  for (const kind of ["image-compressor", "image-converter"]) {
    const app = pictureWorkbench(kind, encoded); app.render(); app.flushEffects();
    const inputs = ["second.png", "first.png"].map((name) => new File([encoded["image/png"], "x".repeat(1000)], name, { type: "image/png" }));
    await element(app.render(), "drop-zone").props.onFiles(inputs); app.render(); app.flushEffects();
    await button(app.render(), kind === "image-compressor" ? "开始压缩" : "开始批量转换").props.onClick();
    const next = element(app.render(), "result-continue").props; assert.equal(next.count, 2); assert.equal(next.disabled, false);
    const files = next.getFiles(), expectedType = kind === "image-compressor" ? "image/png" : "image/jpeg";
    assert.deepEqual(Array.from(files, (file) => file.name), kind === "image-compressor" ? ["second-compressed.png", "first-compressed.png"] : ["second.jpg", "first.jpg"]);
    for (const file of files) { assert.equal(file.type, expectedType); assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await encoded[expectedType].arrayBuffer())); }
    const store = memoryStore(); store.offer("/images-to-pdf", files, next.source); app.render(); app.flushEffects(); app.unmount();
    assert.ok(app.revoked.length >= 4); assert.equal(store.snapshot().files[0], files[0]); assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()), new Uint8Array(await encoded[expectedType].arrayBuffer())); store.clear();
  }
});

test("图片压缩接收按批次校验，不因部分成功留下可重复导入的半批文件", async () => {
  const app = pictureWorkbench("image-compressor", {}); app.render(); app.flushEffects();
  const file = handoff.resultFile(await png(), "one.png"); let input = element(app.render(), "handoff-input").props;
  assert.equal(input.behavior, "append"); assert.equal(input.onFiles([file]), true);
  input = element(app.render(), "handoff-input").props; assert.equal(input.onFiles([file, new File(["svg"], "bad.svg", { type: "image/svg+xml" })]), false); assert.match(text(app.render()), /已选择 1 张/);
  assert.equal(input.onFiles(Array(200).fill(file)), false); assert.match(text(app.render()), /已选择 1 张/); app.unmount();
});

test("图片加文字确认后才替换输入；不支持的图片和旧加载错误不冒充成功", async () => {
  const app = pictureWorkbench("image-text-editor", {}, true), file = handoff.resultFile(await png(), "good.png"); app.render(); app.flushEffects();
  let incoming = element(app.render(), "handoff-input").props; assert.equal(incoming.behavior, "replace"); assert.equal(app.images.length, 0);
  assert.equal(await incoming.onFiles([new File(["svg"], "bad.svg", { type: "image/svg+xml" })]), false); assert.equal(app.images.length, 0);
  const first = incoming.onFiles([file]); app.images[0].onload(); assert.equal(await first, true); assert.match(text(app.render()), /good.png/);
  incoming = element(app.render(), "handoff-input").props; const old = incoming.onFiles([handoff.resultFile(await png(), "older.png")]); const oldImage = app.images.at(-1);
  const latest = incoming.onFiles([handoff.resultFile(await png(), "latest.png")]); app.images.at(-1).onload(); assert.equal(await latest, true);
  oldImage.onerror(); assert.equal(await old, false); assert.match(text(app.render()), /latest.png/); assert.doesNotMatch(text(app.render()), /无法读取这张图片/); app.unmount();
});
