import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFNumber, StandardFonts, degrees } from "pdf-lib";
import { strToU8, unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { pptxParts, pptxFile } from "./helpers/seventh-fixtures.mjs";
const pdf = loadLocalModule("app/lib/pdf-page-tools.ts");
const { defaultPdfNumberOptions, defaultPdfCropOptions } = loadLocalModule("app/lib/pdf-page-options.ts");
const images = loadLocalModule("app/lib/image-color-replace.ts");
const office = loadLocalModule("app/lib/pptx-extract.ts");
const archive = loadLocalModule("app/lib/local-archive.ts");
const typing = loadLocalModule("app/lib/typing-test.ts");
const prompt = loadLocalModule("app/lib/teleprompter.ts");
const signal = () => new AbortController().signal;
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function fixturePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90, 180, 270]) {
    const page = doc.addPage([600, 800]); page.setMediaBox(10, 20, 600, 800); page.setCropBox(30, 50, 500, 700); page.setRotation(degrees(rotation));
    page.drawText(`Original ${rotation}`, { x: 100, y: 300, size: 12, font });
    page.drawText("Hidden original", { x: 15, y: 25, size: 8, font });
  }
  return new File([await doc.save()], "source.pdf");
}
const loadRendered = async (blob) => pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise;

test("PDF 几何覆盖非零原点、裁切交集、四种旋转与视觉坐标", async () => {
  const file = await fixturePdf(), geometries = await pdf.inspectPdfGeometry(file, signal());
  assert.equal(geometries.length, 4);
  for (const [index, g] of geometries.entries()) {
    assert.equal(g.rotation, index * 90); assert.equal(g.x, 30); assert.equal(g.y, 50);
    assert.equal(g.displayWidth, index % 2 ? 700 : 500); assert.equal(g.displayHeight, index % 2 ? 500 : 700);
    const expected = [{ x: 40, y: 730 }, { x: 50, y: 60 }, { x: 520, y: 70 }, { x: 510, y: 740 }][index];
    assert.deepEqual(pdf.visiblePdfPoint(g, 10, 20), expected);
    const box = pdf.croppedPdfBox(g, { top: 10, right: 20, bottom: 30, left: 5 });
    const expectedBox = [{ x: 55, y: 260, width: 375, height: 420 }, { x: 80, y: 85, width: 300, height: 525 }, { x: 130, y: 120, width: 375, height: 420 }, { x: 180, y: 190, width: 300, height: 525 }][index];
    for (const key of Object.keys(expectedBox)) assert.ok(Math.abs(box[key] - expectedBox[key]) < 0.0001, `${index * 90} ${key}: ${box[key]}`);
  }
  const doc = await PDFDocument.create(), page = doc.addPage([200, 200]); page.setCropBox(-10, -10, 100, 100);
  assert.deepEqual(pdf.pageGeometry(page), { x: 0, y: 0, width: 90, height: 90, rotation: 0, displayWidth: 90, displayHeight: 90 });
  page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2)); assert.throws(() => pdf.pageGeometry(page), /UserUnit/);
});

test("PDF 裁剪只改变选中页 CropBox，不删除原内容、不重排、保留 MediaBox", async () => {
  const file = await fixturePdf(), result = await pdf.cropPdfPages(file, { range: "4,2", margins: { top: 10, right: 20, bottom: 30, left: 5 } }, signal());
  assert.equal(result.changedPages, 2);
  const before = await PDFDocument.load(await file.arrayBuffer()), after = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(after.getPageCount(), 4);
  for (let i = 0; i < 4; i++) { assert.deepEqual(after.getPage(i).getMediaBox(), before.getPage(i).getMediaBox()); assert.equal(after.getPage(i).getRotation().angle, i * 90); }
  assert.deepEqual(after.getPage(0).getCropBox(), before.getPage(0).getCropBox());
  assert.deepEqual(after.getPage(1).getCropBox(), { x: 80, y: 85, width: 300, height: 525 });
  // Restore original visibility and verify text remains: crop is explicitly not redaction.
  for (const page of after.getPages()) page.setCropBox(10, 20, 600, 800);
  const restored = await loadRendered(new Blob([await after.save()]));
  try { assert.match((await (await restored.getPage(2)).getTextContent()).items.map((v) => v.str).join(" "), /Hidden original/); } finally { await restored.loadingTask.destroy(); }
});

test("PDF 页码按输入页序连续编号，四种旋转后基线水平且位置在可见底部", async () => {
  const file = await fixturePdf(), result = await pdf.numberPdfPages(file, { ...defaultPdfNumberOptions, range: "4,2,1,3", start: 7, template: "N{n} P{page}/{total}" }, signal());
  assert.equal(result.changedPages, 4);
  const parsed = await loadRendered(result.blob), expected = ["N9 P1/4", "N8 P2/4", "N10 P3/4", "N7 P4/4"];
  try {
    for (let i = 0; i < 4; i++) {
      const page = await parsed.getPage(i + 1), viewport = page.getViewport({ scale: 1 }), content = await page.getTextContent(), item = content.items.find((v) => v.str === expected[i]);
      assert.ok(item, expected[i]); assert.ok(content.items.some((v) => v.str === `Original ${i * 90}`));
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      assert.ok(x > 10 && x < viewport.width - 10); assert.ok(y > viewport.height - 50 && y < viewport.height - 20);
      const [dx, dy] = viewport.convertToViewportPoint(item.transform[4] + item.transform[0], item.transform[5] + item.transform[1]);
      assert.ok(dx > x); assert.ok(Math.abs(dy - y) < 0.001, `rotation ${i * 90} must read horizontally`);
    }
  } finally { await parsed.loadingTask.destroy(); }
});

test("中文页码真实嵌入字体子集，可被 PDF.js 提取，未选页不加字", async () => {
  const fontBytes = new Uint8Array(await readFile(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url)));
  let requests = 0;
  const result = await pdf.numberPdfPages(await fixturePdf(), { ...defaultPdfNumberOptions, range: "2", template: "第 {n} 页，共 {total} 页" }, signal(), undefined, async () => { requests++; return fontBytes; });
  assert.equal(requests, 1); assert.ok(result.blob.size < fontBytes.length / 2, "must subset the 8 MB CJK font");
  const parsed = await loadRendered(result.blob);
  try {
    const page = await parsed.getPage(2); assert.match((await page.getTextContent()).items.map((v) => v.str).join(""), /第 1 页，共 1 页/); assert.doesNotMatch((await (await parsed.getPage(1)).getTextContent()).items.map((v) => v.str).join(""), /第/);
    const viewport = page.getViewport({ scale: 1 }), canvas = createCanvas(viewport.width, viewport.height), context = canvas.getContext("2d");
    await page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
    const pixels = context.getImageData(0, viewport.height - 50, viewport.width, 40).data; let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150) dark++;
    assert.ok(dark > 150, `CJK label must actually rasterize, not merely have a ToUnicode map (${dark})`);
  } finally { await parsed.loadingTask.destroy(); }
  await assert.rejects(pdf.numberPdfPages(await fixturePdf(), { ...defaultPdfNumberOptions, template: "😀{n}" }, signal(), undefined, async () => fontBytes), /不支持/);
});

test("PDF 拒绝坏文件、非法范围、放不下的页码、未知模板与取消", async () => {
  const file = await fixturePdf();
  for (const next of [{ start: 0 }, { start: 1.5 }, { opacity: NaN }, { margin: 0 }, { size: 49 }, { position: "center" }, { range: "5" }, { template: "{unknown}" }, { template: "hello\n" }, { template: "W".repeat(120), size: 48 }]) await assert.rejects(pdf.numberPdfPages(file, { ...defaultPdfNumberOptions, ...next }, signal()));
  for (const margins of [{ top: 50, bottom: 50, left: 0, right: 0 }, { top: -1, bottom: 0, left: 0, right: 0 }, { top: NaN, bottom: 0, left: 0, right: 0 }]) await assert.rejects(pdf.cropPdfPages(file, { ...defaultPdfCropOptions, margins }, signal()));
  await assert.rejects(pdf.inspectPdfGeometry(new File(["bad"], "bad.pdf"), signal()), /无法读取/);
  await assert.rejects(pdf.inspectPdfGeometry(new File([], "empty.pdf"), signal()), /非空/);
  const canceled = new AbortController(); canceled.abort(); await assert.rejects(pdf.inspectPdfGeometry(file, canceled.signal), { name: "AbortError" });
  const late = new AbortController(); await assert.rejects(pdf.numberPdfPages(file, defaultPdfNumberOptions, late.signal, () => late.abort()), { name: "AbortError" });
});

test("颜色替换精确/容差/柔化/强度可控，保留透明度且不修改源像素", () => {
  const input = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0, 250, 250, 250, 255]), snapshot = input.slice();
  const options = { ...images.defaultColorReplaceOptions, tolerance: 0, to: "#000000" }, exact = images.replaceColorPixels(input, 4, 1, options);
  assert.equal(exact.changed, 2); assert.deepEqual([...exact.pixels.slice(0, 12)], [0, 0, 0, 255, 0, 0, 0, 128, 255, 255, 255, 0]); assert.deepEqual(input, snapshot);
  assert.equal(images.replaceColorPixels(input, 4, 1, { ...options, tolerance: 10, softness: 0 }).changed, 3);
  assert.equal(images.replaceColorPixels(input, 4, 1, { ...options, strength: 0 }).changed, 0);
  assert.deepEqual([...images.replaceColorPixels(input, 4, 1, { ...options, strength: 50 }).pixels.slice(0, 4)], [128, 128, 128, 255]);
  const soft = images.replaceColorPixels(new Uint8ClampedArray([230, 230, 230, 255]), 1, 1, { ...options, tolerance: 10, softness: 100 });
  assert.ok(soft.pixels[0] > 200 && soft.pixels[0] < 230);
  for (const next of [{ tolerance: -1 }, { softness: NaN }, { strength: 101 }, { from: "url(evil)" }]) assert.throws(() => images.replaceColorPixels(input, 4, 1, { ...options, ...next }));
  assert.throws(() => images.replaceColorPixels(input, 1, 1, options));
});

function rasterRuntime() {
  const keys = ["OffscreenCanvas", "createImageBitmap", "ImageData"], saved = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key)), canvases = []; let closed = 0;
  class Canvas {
    constructor(w, h) { this.inner = createCanvas(w, h); this.w = w; this.h = h; canvases.push(this); }
    get width() { return this.w; } set width(v) { this.w = v; this.inner.width = Math.max(1, v); }
    get height() { return this.h; } set height(v) { this.h = v; this.inner.height = Math.max(1, v); }
    getContext() { const ctx = this.inner.getContext("2d"), draw = ctx.drawImage.bind(ctx); ctx.drawImage = (img, ...rest) => draw(img.inner ?? img, ...rest); return ctx; }
    async convertToBlob() { return new Blob([await this.inner.encode("png")], { type: "image/png" }); }
  }
  for (const [key, value] of [["OffscreenCanvas", Canvas], ["ImageData", ImageData], ["createImageBitmap", async (blob) => { const image = await loadImage(Buffer.from(await blob.arrayBuffer())); image.close = () => closed++; return image; }]]) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { canvases, closed: () => closed, restore() { keys.forEach((key, i) => saved[i] ? Object.defineProperty(globalThis, key, saved[i]) : delete globalThis[key]); } };
}

test("真实 PNG 取色/导出保留原尺寸、半透明像素及原色坐标，资源全部释放", async () => {
  const runtime = rasterRuntime();
  try {
    const original = await sharp(Buffer.from([255, 255, 255, 255, 0, 0, 255, 128, 0, 0, 0, 0, 255, 0, 0, 255]), { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer(), file = new File([original], "colors.png");
    assert.deepEqual(await images.sampleImageColor(file, 1, 0, signal()), { hex: "#0000FF", alpha: 128, x: 1, y: 0 });
    await assert.rejects(images.sampleImageColor(file, 0, 1, signal()), /完全透明/); await assert.rejects(images.sampleImageColor(file, 2, 0, signal()), /超出/);
    const result = await images.replaceImageColor(file, { ...images.defaultColorReplaceOptions, from: "#FFFFFF", to: "#00FF00", tolerance: 0 }, signal());
    const decoded = await sharp(Buffer.from(await result.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 2); assert.equal(decoded.info.height, 2); assert.equal(result.changed, 1);
    assert.deepEqual([...decoded.data.slice(0, 8)], [0, 255, 0, 255, 0, 0, 255, 128]); assert.equal(decoded.data[11], 0);
    assert.equal(runtime.closed(), 4); assert.ok(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    const canceled = new AbortController(); canceled.abort(); await assert.rejects(images.replaceImageColor(file, images.defaultColorReplaceOptions, canceled.signal), { name: "AbortError" });
  } finally { runtime.restore(); }
  await assert.rejects(images.sampleImageColor(new File(["x"], "x.png"), 0, 0, signal()), /后台画布/);
});

test("PPTX 按 sldId 关系顺序提取中英文/CDATA/换行和空白页，支持严格命名空间", async () => {
  for (const strict of [false, true]) {
    const result = await office.extractPptx(pptxFile(pptxParts(strict)), signal());
    assert.equal(result.slides, 2); assert.equal(result.emptySlides, 1); assert.equal(result.images.length, 2);
    assert.match(result.text, /第 1 页（ppt\/slides\/slide9.xml）/); assert.match(result.text, /中文 & first\n<not HTML>\n表格/); assert.doesNotMatch(result.text, /notes not body/);
    const zip = unzipSync(new Uint8Array(await result.blob.arrayBuffer())), manifest = JSON.parse(new TextDecoder().decode(zip["manifest.json"]));
    assert.deepEqual(manifest.slides, ["ppt/slides/slide9.xml", "ppt/slides/slide1.xml"]); assert.equal(manifest.emptySlides, 1);
    assert.equal(new TextDecoder().decode(zip["slides.txt"]), result.text); assert.equal(await result.textBlob.text(), result.text);
    assert.deepEqual(zip["images/photo.png"], pptxParts()["ppt/media/photo.png"]);
    const svg = result.images.find((v) => v.name === "images/master.svg"); assert.equal(svg.blob.type, "application/octet-stream"); assert.match(await svg.blob.text(), /neverExecute/);
  }
});

test("PPTX 不发起网络请求：外部幻灯片、伪根元素、宏内容类型与缺失关系明确报错", async () => {
  const mutations = [
    (parts) => { parts["ppt/_rels/presentation.xml.rels"] = strToU8(new TextDecoder().decode(parts["ppt/_rels/presentation.xml.rels"]).replace('Target="slides/slide9.xml"', 'TargetMode="External" Target="https://example.invalid/slide.xml"')); },
    (parts) => { parts["ppt/_rels/presentation.xml.rels"] = strToU8(new TextDecoder().decode(parts["ppt/_rels/presentation.xml.rels"]).replace('Id="rB"', 'Id="rA"')); },
    (parts) => { parts["ppt/presentation.xml"] = strToU8('<bad xmlns="invalid"/>'); },
    (parts) => { parts["[Content_Types].xml"] = strToU8(new TextDecoder().decode(parts["[Content_Types].xml"]).replace("presentationml.presentation.main+xml", "presentationml.macroEnabled.main+xml")); },
    (parts) => { delete parts["ppt/slides/slide9.xml"]; },
    (parts) => { parts["ppt/slides/slide9.xml"] = strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>'); },
  ];
  const saved = globalThis.fetch; globalThis.fetch = () => { throw new Error("must not fetch"); };
  try { for (const mutate of mutations) { const parts = pptxParts(); mutate(parts); await assert.rejects(office.extractPptx(pptxFile(parts), signal()), /关系|根元素|标准 PPTX|缺失/); } } finally { globalThis.fetch = saved; }
  await assert.rejects(office.extractPptx(new File(["x"], "old.ppt"), signal()), /pptx/);
});

test("XML 拒绝 DTD/XXE、未声明实体、破损/过深/过大文档与无效编码", () => {
  for (const xml of ['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]><x>&e;</x>', "<x>&unknown;</x>", "<x><bad></x>", "<x>".repeat(102) + "</x>".repeat(102), '<?xml version="1.0" encoding="GBK"?><x/>']) assert.throws(() => office.readOfficeXml(strToU8(xml), {}, signal()), /DTD|实体|解析|安全预算|UTF/);
  assert.throws(() => office.readOfficeXml(new Uint8Array(16 * 1048576 + 1), {}, signal()), /16 MiB/);
  assert.throws(() => office.readOfficeXml(new Uint8Array([60, 120, 62, 0xff, 60, 47, 120, 62]), {}, signal()), /编码/);
  let text = ""; const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<?xml version="1.0" encoding="UTF-16"?><x>中文</x>', "utf16le")]);
  office.readOfficeXml(utf16, { text: (part) => text += part }, signal()); assert.equal(text, "中文");
  const canceled = new AbortController(); canceled.abort(); assert.throws(() => office.readOfficeXml(strToU8("<x/>"), {}, canceled.signal), { name: "AbortError" });
});

test("包内路径只允许安全相对/根路径，多条目解压保持 CRC 校验并拒绝缺失/目录", () => {
  assert.equal(office.resolveOfficePart("ppt/presentation.xml", "slides/slide%201.xml"), "ppt/slides/slide 1.xml");
  assert.equal(office.resolveOfficePart("ppt/presentation.xml", "../docProps/core.xml"), "docProps/core.xml");
  for (const target of ["../../bad", "https://evil/a", "//evil/a", "%2f%2fevil/a", "a%5cb", "bad?x", "bad#x", "%ZZ"]) assert.throws(() => office.resolveOfficePart("ppt/presentation.xml", target));
  const data = zipSync({ "a.txt": strToU8("hello"), "b.txt": strToU8("second"), "folder/": new Uint8Array() }, { level: 0 });
  assert.deepEqual(Object.keys(archive.extractZipEntries(data, new Set(["a.txt", "b.txt"]))), ["a.txt", "b.txt"]);
  assert.throws(() => archive.extractZipEntries(data, new Set(["missing"])), /不存在/); assert.throws(() => archive.extractZipEntries(data, new Set(["folder/"])), /目录/);
  const corrupt = data.slice(), entry = archive.inspectZip(data)[0], view = new DataView(corrupt.buffer), payload = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true); corrupt[payload] ^= 1;
  assert.throws(() => archive.extractZipEntries(corrupt, new Set(["a.txt"])), /校验/);
});

test("PPTX 中途取消不返回半成品 ZIP；无图片的演示仍导出正文与清单", async () => {
  const parts = pptxParts(); delete parts["ppt/media/photo.png"]; delete parts["ppt/media/master.svg"];
  const result = await office.extractPptx(pptxFile(parts), signal()); assert.equal(result.images.length, 0); assert.equal(Object.keys(unzipSync(new Uint8Array(await result.blob.arrayBuffer()))).length, 2);
  const canceled = new AbortController(); await assert.rejects(office.extractPptx(pptxFile(), canceled.signal, (progress) => { if (progress >= 15) canceled.abort(); }), { name: "AbortError" });
});

test("打字按字素计数与 NFC/换行规范化，退格修正准确率，空输入不计时", () => {
  assert.deepEqual(typing.typingUnits("e\u0301👨‍👩‍👧‍👦\r\n中"), ["é", "👨‍👩‍👧‍👦", "\n", "中"]);
  assert.deepEqual(typing.createTypingState("a\r\nb").target, ["a", "\n", "b"]);
  let state = typing.createTypingState("é中文😀"); state = typing.commitTyped(state, "", 100); assert.equal(state.startedAt, null);
  state = typing.commitTyped(state, "e\u0301中错", 1000); assert.equal(state.phase, "running");
  const metrics = typing.typingMetrics(state, 31000); assert.equal(metrics.correct, 2); assert.equal(metrics.wrong, 1); assert.equal(metrics.cpm, 4); assert.equal(metrics.wpm, 0.8);
  state = typing.commitTyped(state, "é中", 32000); assert.equal(typing.typingMetrics(state, 32000).accuracy, 100);
  state = typing.commitTyped(state, "", 33000); assert.equal(state.startedAt, 1000); assert.equal(state.phase, "running");
  state = typing.commitTyped(state, "é中文😀", 34000); assert.equal(state.phase, "finished"); assert.equal(typing.typingMetrics(state, 99000).elapsed, 33);
});

test("打字到时固定截止时间、不接收迟到输入，完成长度与错误、无穷速度和无效时钟有界", () => {
  const state = typing.commitTyped(typing.createTypingState("abcd", 30), "ab", 1000), timed = typing.commitTyped(state, "abcd", 31001);
  assert.equal(timed.phase, "finished"); assert.equal(timed.typed, "ab"); assert.equal(timed.finishedAt, 31000); assert.equal(typing.typingMetrics(timed, 90000).remaining, 0);
  const wrong = typing.commitTyped(typing.createTypingState("abc"), "xyzextra", 1000); assert.equal(wrong.phase, "finished"); assert.equal(typing.typingMetrics(wrong, 1000).cpm, 0); assert.equal(typing.typingMetrics(wrong, 1000).wrong, 8);
  for (const [target, duration] of [[" ", 60], ["a\tb", 60], ["a".repeat(5001), 60], ["abc", 0]]) assert.throws(() => typing.createTypingState(target, duration));
  assert.throws(() => typing.commitTyped(state, "a".repeat(5001), 1001), /超/); assert.throws(() => typing.advanceTyping(state, 999), /时钟/); assert.throws(() => typing.advanceTyping(state, NaN), /时钟/);
});

test("提词器按实际帧间隔滚动，限制后台追赶，停止与结束均不接受迟到帧", () => {
  assert.equal(prompt.promptPosition(10, 50, 40, 100), 12); assert.equal(prompt.promptPosition(10, 10000, 40, 100), 14);
  assert.equal(prompt.promptPosition(99, 100, 40, 100), 100); assert.throws(() => prompt.promptPosition(0, -1, 40, 100));
  let position = 0, callback, id = 0, canceled = 0, ended = 0;
  const options = { speed: 40, read: () => ({ position, maximum: 10 }), write: (p) => position = p, end: () => ended++, schedule: (cb) => { callback = cb; return ++id; }, cancel: () => canceled++, now: () => 1000 };
  const stop = prompt.startPromptScroll(options); callback(1050); assert.equal(position, 2); const late = callback; stop(); stop(); late(1100); assert.equal(position, 2); assert.equal(canceled, 1); assert.equal(ended, 0);
  position = 9; const completed = prompt.startPromptScroll(options); callback(1100); assert.equal(position, 10); assert.equal(ended, 1); callback(1200); completed(); assert.equal(ended, 1);
});

test("新增依赖原始声明与许可证随构建分发，不以项目 MIT 替代上游归属", async () => {
  const root = new URL("../", import.meta.url), read = (path) => readFile(new URL(path, root), "utf8");
  assert.equal(await read("dist/client/vendor-licenses/saxes.txt"), await read("licenses/saxes-6.0.0-LICENSE.txt"));
  assert.equal(await read("dist/client/vendor-licenses/xmlchars.txt"), await read("node_modules/xmlchars/LICENSE"));
  assert.equal(await read("dist/client/vendor-licenses/pdf-lib-fontkit-README.md"), await read("node_modules/@pdf-lib/fontkit/README.md"));
  assert.equal(await read("dist/client/vendor-licenses/pdf-lib-fontkit-original.txt"), await read("node_modules/@pdf-lib/fontkit/dist/fontkit.es.js"));
  assert.equal(await read("dist/client/vendor-licenses/pdf-lib-fontkit-pako.txt"), await read("node_modules/@pdf-lib/fontkit/node_modules/pako/LICENSE"));
  assert.equal(JSON.parse(await read("dist/client/vendor-licenses/pdf-lib-fontkit-package.json")).license, "MIT");
  assert.match(await read("dist/client/vendor-licenses/pdf-lib-fontkit-NOTICE.md"), /does not include a standalone LICENSE/);
});
