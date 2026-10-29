import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, StandardFonts, degrees, PDFName, PDFDict } from "pdf-lib";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { watermarkPdf } = loadLocalModule("app/lib/pdf-watermark.ts");
const { defaultPdfWatermark: defaults, validatePdfWatermark, planPdfWatermarks, watermarkBaseline } = loadLocalModule("app/lib/pdf-watermark-options.ts");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const signal = () => new AbortController().signal;
const fontSource = async () => new Uint8Array(await readFile(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url)));
const readPdf = async (blob) => pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise;
async function fixture() {
  const doc = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const page = doc.addPage([600, 800]); page.setMediaBox(10, 20, 600, 800); page.setCropBox(30, 50, 500, 700); page.setRotation(degrees(rotation));
    page.drawText(`Original ${rotation}`, { x: 100, y: 300, size: 12 });
  }
  return new File([await doc.save()], "source.pdf");
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test("水印单个/网格/交错排列完整落在可见页面，保留边界定位与间隔", () => {
  const options = { ...defaults, text: "test", angle: 0, layout: "single" };
  assert.deepEqual(planPdfWatermarks(500, 700, 100, 40, { ...options, x: 0, y: 100 }), [{ x: 50, y: 680 }]);
  const grid = planPdfWatermarks(500, 700, 100, 40, { ...options, layout: "grid", gapX: 0, gapY: 0 });
  assert.equal(grid.length, 85);
  const staggered = planPdfWatermarks(500, 700, 100, 40, { ...options, layout: "staggered", gapX: 0, gapY: 0 });
  assert.equal(staggered.length, 77); assert.equal(staggered[5].x - grid[5].x, 50);
  for (const angle of [-90, -35, 0, 35, 90]) for (const layout of ["single", "grid", "staggered"]) {
    const radians = angle * Math.PI / 180, halfW = (Math.abs(100 * Math.cos(radians)) + Math.abs(40 * Math.sin(radians))) / 2, halfH = (Math.abs(100 * Math.sin(radians)) + Math.abs(40 * Math.cos(radians))) / 2;
    for (const { x, y } of planPdfWatermarks(500, 700, 100, 40, { ...options, layout, angle })) assert.ok(x >= halfW && x <= 500 - halfW && y >= halfH && y <= 700 - halfH);
  }
  assert.deepEqual(watermarkBaseline(100, 100, 80, 30, 40, 0), { u: 60, v: 110 });
});

test("水印拒绝非法参数、超长或换行文字、放不下的字号与过密运算", () => {
  for (const value of [{ text: "" }, { text: " \t" }, { text: "a\nb" }, { text: "x".repeat(121) }, { size: NaN }, { angle: 91 }, { opacity: -1 }, { layout: "bad" }, { x: 101 }, { gapX: -1 }, { color: "red" }, { range: "x".repeat(10001) }]) assert.throws(() => validatePdfWatermark({ ...defaults, ...value }));
  assert.throws(() => planPdfWatermarks(5, 5, 100, 40, defaults), /放不下/);
  assert.throws(() => planPdfWatermarks(1000, 1000, 10, 10, { ...defaults, layout: "grid", angle: 0, gapX: 0, gapY: 0 }), /密集/);
});

test("真实 PDF 四种旋转及 CropBox 非零原点后，水印仍视觉居中且方向一致", async () => {
  const file = await fixture(), options = { ...defaults, text: "WATERMARK", size: 32, angle: 35 };
  const result = await watermarkPdf(file, options, signal()); assert.equal(result.changedPages, 4); assert.equal(result.stamps, 4);
  const actual = await PDFDocument.load(await result.blob.arrayBuffer()), original = await PDFDocument.load(await file.arrayBuffer()), font = await actual.embedFont(StandardFonts.Helvetica);
  const width = [...options.text].reduce((sum, char) => sum + font.widthOfTextAtSize(char, options.size), 0), height = font.heightAtSize(options.size), ascent = font.heightAtSize(options.size, { descender: false });
  const parsed = await readPdf(result.blob);
  try {
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(actual.getPage(i).getCropBox(), original.getPage(i).getCropBox());
      assert.deepEqual(actual.getPage(i).getMediaBox(), original.getPage(i).getMediaBox()); assert.equal(actual.getPage(i).getRotation().angle, i * 90);
      const page = await parsed.getPage(i + 1), viewport = page.getViewport({ scale: 1 }), items = (await page.getTextContent()).items;
      assert.ok(items.some((item) => item.str === `Original ${i * 90}`));
      const mark = items.find((item) => item.str === options.text); assert.ok(mark);
      const [x, y] = viewport.convertToViewportPoint(mark.transform[4], mark.transform[5]), radians = options.angle * Math.PI / 180, middle = ascent - height / 2;
      near(x + Math.cos(radians) * width / 2 - Math.sin(radians) * middle, viewport.width / 2);
      near(y - Math.sin(radians) * width / 2 - Math.cos(radians) * middle, viewport.height / 2);
      const [dx, dy] = viewport.convertToViewportPoint(mark.transform[4] + mark.transform[0], mark.transform[5] + mark.transform[1]);
      near(Math.atan2(-(dy - y), dx - x) * 180 / Math.PI, options.angle);
    }
  } finally { await parsed.loadingTask.destroy(); }
});

test("Helvetica AV 字偶距不使实际水印偏心或超出页面", async () => {
  const doc = await PDFDocument.create(); doc.addPage([500, 200]); const file = new File([await doc.save()], "kern.pdf");
  for (const x of [0, 50, 100]) {
    const result = await watermarkPdf(file, { ...defaults, text: "AVAVAV", size: 120, angle: 0, x }, signal()), parsed = await readPdf(result.blob);
    try {
      const items = (await (await parsed.getPage(1)).getTextContent()).items, mark = items.find((item) => item.str === "AVAVAV");
      assert.ok(mark); near(mark.transform[4], (500 - mark.width) * x / 100); assert.ok(mark.transform[4] >= -0.001 && mark.transform[4] + mark.width <= 500.001);
    } finally { await parsed.loadingTask.destroy(); }
  }
});

test("真实 PDF 网格/平铺仅修改选定页面，颜色及不透明度进入输出状态", async () => {
  const file = await fixture();
  for (const layout of ["grid", "staggered"]) {
    const result = await watermarkPdf(file, { ...defaults, text: "DRAFT", range: "4,2", layout, color: "#ff0000", opacity: 23 }, signal()), parsed = await readPdf(result.blob), output = await PDFDocument.load(await result.blob.arrayBuffer());
    let count = 0;
    try {
      for (let i = 0; i < 4; i++) {
        const marks = (await (await parsed.getPage(i + 1)).getTextContent()).items.filter((item) => item.str === "DRAFT");
        if (i % 2 === 0) assert.equal(marks.length, 0); else { assert.ok(marks.length > 1); count += marks.length; }
      }
      assert.equal(count, result.stamps); assert.equal(result.changedPages, 2);
      const states = output.getPage(1).node.Resources().lookup(PDFName.of("ExtGState"), PDFDict);
      assert.ok(states.values().some((ref) => output.context.lookup(ref, PDFDict).get(PDFName.of("ca")).asNumber() === 0.23));
    } finally { await parsed.loadingTask.destroy(); }
  }
});

test("中文与混合文字使用真实嵌入字体，字形可提取且边缘位置正确", async () => {
  const file = await fixture(), result = await watermarkPdf(file, { ...defaults, text: "测试 AV 水印", range: "1", angle: 0, x: 100, size: 40 }, signal(), () => {}, fontSource), parsed = await readPdf(result.blob);
  try {
    const page = await parsed.getPage(1), items = (await page.getTextContent()).items, marks = items.filter((item) => item.str.includes("水印"));
    assert.equal(marks.length, 1); const [x] = page.getViewport({ scale: 1 }).convertToViewportPoint(marks[0].transform[4], marks[0].transform[5]); near(x + marks[0].width, 500);
  } finally { await parsed.loadingTask.destroy(); }
  await assert.rejects(watermarkPdf(file, { ...defaults, text: "😀" }, signal(), () => {}, fontSource), /不支持/);
});

test("无效页码、损坏文件、取消与封装途中终止不返回半成品", async () => {
  const file = await fixture();
  await assert.rejects(watermarkPdf(file, { ...defaults, range: "5" }, signal()), /范围/);
  await assert.rejects(watermarkPdf(file, { ...defaults, range: "1,1" }, signal()), /重复/);
  await assert.rejects(watermarkPdf(file, { ...defaults, range: ",,," }, signal()), /有效页面/);
  await assert.rejects(watermarkPdf(new File(["bad"], "bad.pdf"), { ...defaults, text: "DRAFT" }, signal()), /损坏/);
  const canceled = new AbortController(); canceled.abort(); await assert.rejects(watermarkPdf(file, defaults, canceled.signal), { name: "AbortError" });
  const during = new AbortController(); await assert.rejects(watermarkPdf(file, { ...defaults, text: "DRAFT" }, during.signal, (progress) => { if (progress >= 30) during.abort(); }), { name: "AbortError" });
  const finish = new AbortController(); await assert.rejects(watermarkPdf(file, { ...defaults, text: "DRAFT" }, finish.signal, (progress) => { if (progress === 92) finish.abort(); }), { name: "AbortError" });
});
