import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { convertYaml } = loadLocalModule("app/lib/yaml-conversion.ts");
const { inspectContrast, contrastRatio, contrastHex } = loadLocalModule("app/lib/color-contrast.ts");
const { gridSplitPlan } = loadLocalModule("app/lib/image-grid-plan.ts");
const { defaultGridSplitOptions } = loadLocalModule("app/lib/image-grid-options.ts");
const { splitImageGrid } = loadLocalModule("app/lib/image-grid.ts");
const { LocalZipWriter } = loadLocalModule("app/lib/local-zip-writer.ts");
const { exportPdf, renderExportPage, pdfExportDimensions } = loadLocalModule("app/lib/pdf-export.ts");
const { defaultPdfExportOptions } = loadLocalModule("app/lib/pdf-export-options.ts");
const { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");

test("YAML 依赖精确锁定，原始 ISC 许可证随生产构建分发", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")); assert.equal(pkg.dependencies.yaml, "2.9.1");
  assert.equal(await readFile(new URL("../dist/client/vendor-licenses/yaml.txt", import.meta.url), "utf8"), await readFile(new URL("../node_modules/yaml/LICENSE", import.meta.url), "utf8"));
});

test("YAML / JSON 转换保留中文、数组、布尔值、引号编号和多行字符串", () => {
  const value = { name: "工具箱😀", id: "001", truth: true, missing: null, text: "第一行\n第二行", list: [1, "yes", false] };
  const yaml = convertYaml(JSON.stringify(value), "json-to-yaml", 4);
  assert.deepEqual(JSON.parse(convertYaml(yaml, "yaml-to-json", 2)), value);
  assert.equal(JSON.parse(convertYaml("yes: yes\nno: no\ndate: 2026-10-23", "yaml-to-json", 2)).yes, "yes");
  assert.equal(JSON.parse(convertYaml("date: 2026-10-23", "yaml-to-json", 2)).date, "2026-10-23");
  assert.equal(JSON.parse(convertYaml("key: 123", "yaml-to-json", 2)).key, 123);
});
test("YAML 重复键、未知标签、多文档、循环/爆炸别名、非有限和超安全整数明确拒绝", () => {
  for (const text of ["a: 1\na: 2", "x: !evil code", "---\nx: 1\n---\ny: 2", "a: &a [*a]", "x: .inf", "x: .nan", "x: 9007199254740993123", "%YAML 1.1\n---\nx: yes", "? [1, 2]\n: value"]) assert.throws(() => convertYaml(text, "yaml-to-json", 2), undefined, text);
  const bomb = ["a: &a [x,x,x,x,x,x,x,x,x,x]", ...["b", "c", "d", "e"].map((key, i) => `${key}: &${key} [${Array(10).fill(`*${"abcd"[i]}`).join(",")}]`)].join("\n");
  assert.throws(() => convertYaml(bomb, "yaml-to-json", 2), /别名|节点/);
  assert.match(convertYaml("a: &a [1, 2]\nb: *a", "yaml-to-json", 2), /"b"/);
});
test("严格 JSON 不接受重复键、注释、尾逗号、危险数值和过深嵌套，错误包含行列", () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,}', '{/*comment*/"a":1}', '{"a":1e999}', '{"id":9007199254740993123}', "[".repeat(102) + "0" + "]".repeat(102)]) assert.throws(() => convertYaml(text, "json-to-yaml", 2));
  assert.throws(() => convertYaml('{\n"a":}', "json-to-yaml", 2), /第 2 行/);
  assert.throws(() => convertYaml("x".repeat(toolLimits.text.jsonChars + 1), "yaml-to-json", 2), /500 万/);
  const data = JSON.parse(convertYaml('__proto__: safe\nconstructor: safe\nprototype: safe', "yaml-to-json", 2));
  assert.equal(Object.getPrototypeOf(data), Object.prototype); assert.equal(Object.hasOwn(data, "__proto__"), true); assert.equal(data.__proto__, "safe");
});
test("WCAG 黑白、相同色、透明叠加和常用灰色的比值正确", () => {
  assert.equal(contrastHex(" abc "), "#AABBCC");
  assert.equal(inspectContrast("#000", "#fff", 100).ratio, 21);
  assert.equal(inspectContrast("#fff", "#000", 100).ratio, 21);
  assert.equal(inspectContrast("#abc", "#abc", 100).ratio, 1);
  assert.equal(inspectContrast("#000", "#fff", 0).ratio, 1);
  const gray = inspectContrast("#777777", "#fff", 100); assert.ok(gray.ratio > 4.47 && gray.ratio < 4.49); assert.equal(gray.checks[0].pass, false);
  assert.ok(inspectContrast("#000", "#fff", 50).ratio < 4.5);
  assert.match(inspectContrast("#f00", "#fff", 50).css, /255 0 0 \/ 0.5/);
});
test("对比度按未四舍五入阈值判定，非法输入不产生误导结果", () => {
  const gray = 1.055 * (1.05 / 4.4996 - 0.05) ** (1 / 2.4) - 0.055;
  const result = inspectContrast("#000", "#fff", (1 - gray) * 100);
  assert.equal(result.ratio.toFixed(3), "4.500"); assert.equal(result.checks[0].pass, false);
  for (const text of ["red", "#ff", "#gggggg", "#12345678", "url(x)"]) assert.throws(() => inspectContrast(text, "#fff", 100));
  assert.throws(() => inspectContrast("#000", "#fff", NaN)); assert.throws(() => contrastRatio([0, 0, 2], [1, 1, 1]));
});
test("网格覆盖完整原图且没有缝隙或重复，非整除边缘保留", () => {
  const plan = gridSplitPlan(10, 7, { ...defaultGridSplitOptions, mode: "original" });
  const seen = new Uint8Array(70);
  for (const tile of plan.tiles) for (let y = tile.y; y < tile.y + tile.height; y++) for (let x = tile.x; x < tile.x + tile.width; x++) seen[y * 10 + x]++;
  assert.ok([...seen].every((n) => n === 1)); assert.equal(plan.tiles.at(-1).name, "r03-c03.png");
  assert.deepEqual(plan.tiles.slice(0, 3).map((tile) => tile.width), [3, 3, 4]);
  assert.equal(gridSplitPlan(10, 6, defaultGridSplitOptions).width, 6);
  const padded = gridSplitPlan(6, 10, { ...defaultGridSplitOptions, mode: "square-pad" }); assert.equal(padded.width, 10); assert.equal(padded.offsetX, 2);
});
test("网格拒绝空格、过多格、过大画布及异常参数", () => {
  for (const next of [{ rows: 0 }, { columns: 21 }, { rows: 20, columns: 20 }, { quality: NaN }, { mode: "unknown" }]) assert.throws(() => gridSplitPlan(100, 100, { ...defaultGridSplitOptions, ...next }));
  assert.throws(() => gridSplitPlan(2, 2, defaultGridSplitOptions), /非空/);
  assert.throws(() => gridSplitPlan(20000, 1000, { ...defaultGridSplitOptions, rows: 1, columns: 1, mode: "original" }), /8192/);
});
function canvasRuntime() {
  const saved = Object.fromEntries(["OffscreenCanvas", "createImageBitmap", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const canvases = []; let closed = 0;
  class Canvas {
    constructor(width = 1, height = 1) { this.inner = createCanvas(Math.max(1, width), Math.max(1, height)); this.w = width; this.h = height; canvases.push(this); }
    get width() { return this.w; } set width(value) { this.w = value; this.inner.width = Math.max(1, value); }
    get height() { return this.h; } set height(value) { this.h = value; this.inner.height = Math.max(1, value); }
    getContext() { const context = this.inner.getContext("2d"), original = context.drawImage.bind(context); context.drawImage = (image, ...args) => original(image.inner ?? image, ...args); return context; }
    async convertToBlob({ type, quality }) { return new Blob([await this.inner.encode(type === "image/jpeg" ? "jpeg" : "png", Math.round((quality ?? 1) * 100))], { type }); }
    toBlob(callback, type = "image/png", quality = 1) { void this.convertToBlob({ type, quality }).then(callback); }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: Canvas });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new Canvas() } });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async (blob) => { const image = await loadImage(Buffer.from(await blob.arrayBuffer())); image.close = () => closed++; return image; } });
  return { canvases, closed: () => closed, restore() { for (const [key, value] of Object.entries(saved)) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } } };
}
test("真实像素切分 ZIP 可重建原图、保留透明度，画布和位图释放", async () => {
  const runtime = canvasRuntime();
  try {
    const pixels = Buffer.alloc(10 * 7 * 4); for (let i = 0; i < 70; i++) { pixels[i * 4] = i * 3; pixels[i * 4 + 1] = 80; pixels[i * 4 + 2] = 160; pixels[i * 4 + 3] = 255; } pixels[3] = 0;
    const original = await sharp(pixels, { raw: { width: 10, height: 7, channels: 4 } }).png().toBuffer();
    const output = await splitImageGrid(new File([original], "grid.png"), { ...defaultGridSplitOptions, mode: "original" }, new AbortController().signal);
    const zip = unzipSync(new Uint8Array(await output.arrayBuffer())), manifest = JSON.parse(new TextDecoder().decode(zip["grid.json"]));
    assert.equal(manifest.tiles.length, 9); assert.equal(Object.keys(zip).length, 10);
    for (const tile of manifest.tiles) {
      const decoded = await sharp(zip[tile.name]).ensureAlpha().raw().toBuffer();
      for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
        const source = ((y + tile.y) * 10 + x + tile.x) * 4, target = (y * tile.width + x) * 4;
        assert.equal(decoded[target + 3], pixels[source + 3]);
        if (pixels[source + 3]) assert.deepEqual(decoded.subarray(target, target + 4), pixels.subarray(source, source + 4));
      }
    }
    assert.equal(runtime.closed(), 1); assert.ok(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  } finally { runtime.restore(); }
});
test("网格补边 PNG 透明 / JPEG 白色，取消时不返回不完整 ZIP", async () => {
  const runtime = canvasRuntime();
  try {
    const png = await sharp({ create: { width: 4, height: 24, channels: 4, background: "red" } }).png().toBuffer(), file = new File([png], "t.png");
    for (const format of ["png", "jpeg"]) {
      const blob = await splitImageGrid(file, { ...defaultGridSplitOptions, mode: "square-pad", rows: 1, columns: 1, format, quality: 1 }, new AbortController().signal);
      const zip = unzipSync(new Uint8Array(await blob.arrayBuffer())), data = await sharp(zip[`r01-c01.${format === "png" ? "png" : "jpg"}`]).ensureAlpha().raw().toBuffer();
      assert.equal(data[3], format === "png" ? 0 : 255); if (format === "jpeg") assert.ok(data[0] > 245 && data[1] > 245 && data[2] > 245);
    }
    const stop = new AbortController(); await assert.rejects(splitImageGrid(file, { ...defaultGridSplitOptions, rows: 2, columns: 2 }, stop.signal, () => stop.abort(new Error("用户取消"))), /用户取消/);
    assert.equal(runtime.closed(), 3);
  } finally { runtime.restore(); }
});
test("顺序 ZIP 验证路径、大小预算与取消，成功条目可完整解压", async () => {
  const writer = new LocalZipWriter(2000), signal = new AbortController().signal;
  try { await writer.add("中文.txt", new Blob(["测试"]), signal); const out = writer.finish(); assert.equal(new TextDecoder().decode(unzipSync(new Uint8Array(await out.arrayBuffer()))["中文.txt"]), "测试"); } finally { writer.dispose(); }
  const small = new LocalZipWriter(20);
  try { await assert.rejects(small.add("../bad", new Blob(["x"]), signal), /不安全/); await assert.rejects(small.add("file.txt", new Blob(["x".repeat(21)]), signal), /预算/); } finally { small.dispose(); }
});
test("PDF 导出尺寸按 DPI 计算，超预算明确拒绝而不是自动缩小", () => {
  assert.deepEqual(pdfExportDimensions(612, 792, 144), { width: 1224, height: 1584 });
  assert.throws(() => pdfExportDimensions(2000, 2000, 300, true), /预算/);
  assert.throws(() => pdfExportDimensions(10, 10, 96), /无效/);
});
async function realPdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) { const page = doc.addPage([100 + i * 10, 120]); page.drawRectangle({ x: 0, y: 0, width: 40, height: 40, color: rgb(i === 0 ? 1 : 0, 0, i === 0 ? 0 : 1) }); if (i !== 1) page.drawText(`Page ${i + 1}`, { x: 5, y: 80, size: 10, font }); }
  return new File([await doc.save()], "fixture.pdf", { type: "application/pdf" });
}
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function pdfLoader(file) { return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise; }
test("实际 PDF.js 提取页面文字、遵守页码顺序并报告扫描空页", async () => {
  const result = await exportPdf(await realPdf(), { ...defaultPdfExportOptions, mode: "text", range: "3,1,2" }, new AbortController().signal, undefined, pdfLoader);
  assert.ok(result.text.indexOf("第 3 页") < result.text.indexOf("第 1 页")); assert.match(result.text, /Page 3/); assert.match(result.text, /Page 1/);
  assert.deepEqual(result.emptyPages, [2]); assert.equal(await result.blob.text(), result.text); assert.equal(result.pages, 3);
});
test("实际 PDF.js 绘制真实 PNG，单张/ZIP 的尺寸、编号与颜色正确", async () => {
  const runtime = canvasRuntime();
  try {
    const file = await realPdf();
    const single = await exportPdf(file, { ...defaultPdfExportOptions, range: "1", dpi: 72 }, new AbortController().signal, undefined, pdfLoader, renderExportPage);
    assert.equal(single.extension, "png"); assert.ok(single.preview);
    const image = await sharp(Buffer.from(await single.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); assert.equal(image.info.width, 100); assert.equal(image.info.height, 120);
    const pos = ((120 - 10) * 100 + 10) * 4; assert.deepEqual([...image.data.subarray(pos, pos + 4)], [255, 0, 0, 255]);
    const multi = await exportPdf(file, { ...defaultPdfExportOptions, range: "3,2", dpi: 72 }, new AbortController().signal, undefined, pdfLoader, renderExportPage);
    assert.equal(multi.extension, "zip"); const zip = unzipSync(new Uint8Array(await multi.blob.arrayBuffer()));
    assert.ok(zip["0001-page-3.png"]); assert.ok(zip["0002-page-2.png"]); assert.deepEqual(JSON.parse(new TextDecoder().decode(zip["pages.json"])).pages, [3, 2]);
    assert.ok(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  } finally { runtime.restore(); }
});
test("PDF 无效范围、渲染失败和处理中取消会清理页面及输入，不返回部分输出", async () => {
  for (const mode of ["range", "render", "cancel"]) {
    let destroyed = 0, cleaned = 0; const controller = new AbortController();
    const page = { getViewport: () => ({ width: 100, height: 100 }), cleanup: () => cleaned++ };
    const load = async () => ({ numPages: 2, loadingTask: { async destroy() { destroyed++; } }, async getPage() { return page; } });
    const render = async () => { if (mode === "cancel") controller.abort(new Error("用户取消")); else throw new Error("渲染失败"); return { blob: new Blob(["x"]) }; };
    await assert.rejects(exportPdf(new File(["pdf"], "x.pdf"), { ...defaultPdfExportOptions, range: mode === "range" ? "3" : "1-2" }, controller.signal, undefined, load, render), /范围|渲染失败|用户取消/);
    assert.ok(destroyed >= 1); assert.equal(cleaned, mode === "range" ? 0 : 1);
  }
});
