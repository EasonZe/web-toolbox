import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createCanvas } from "@napi-rs/canvas";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const { watermarkPdf } = loadLocalModule("app/lib/pdf-watermark.ts");
const { defaultPdfWatermark } = loadLocalModule("app/lib/pdf-watermark-options.ts");
const { numberPdfPages } = loadLocalModule("app/lib/pdf-page-tools.ts");
const { defaultPdfNumberOptions } = loadLocalModule("app/lib/pdf-page-options.ts");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const fontBytes = new Uint8Array(await readFile(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url)));
const fontSource = async () => fontBytes;
const width = 600, height = 200, size = 40;

async function blankPdf() {
  const pdf = await PDFDocument.create(); pdf.addPage([width, height]);
  return new File([await pdf.save()], "source.pdf", { type: "application/pdf" });
}

/** Native Canvas platform adapter, not browser QA. No system-font fallback is allowed. */
async function raster(blob) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  let canvas;
  try {
    const pdf = await task.promise, page = await pdf.getPage(1), viewport = page.getViewport({ scale: 1 });
    assert.equal(viewport.width, width); assert.equal(viewport.height, height);
    canvas = createCanvas(width, height); const context = canvas.getContext("2d");
    await page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
    const pixels = context.getImageData(0, 0, width, height).data.slice(); page.cleanup(); return pixels;
  } finally { if (canvas) canvas.width = canvas.height = 1; await task.destroy(); }
}

/** Independent manual geometry: no production planner, baseline helper or subset flag. */
async function referencePdf(text, kind, subset = false) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset }), page = pdf.addPage([width, height]);
  const textWidth = font.widthOfTextAtSize(text, size), textHeight = font.heightAtSize(size), ascent = font.heightAtSize(size, { descender: false });
  const x = (width - textWidth) / 2;
  const y = kind === "watermark" ? height / 2 - ascent + textHeight / 2 : 10 * 72 / 25.4 + textHeight - ascent;
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0), opacity: 1 });
  const waterStart = x + font.widthOfTextAtSize("测试 AV ", size), waterEnd = waterStart + font.widthOfTextAtSize("水", size);
  return { blob: new Blob([await pdf.save()], { type: "application/pdf" }), waterStart, waterEnd };
}

function differentPixels(first, second) {
  assert.equal(first.length, second.length); let different = 0;
  for (let i = 0; i < first.length; i += 4) if (first[i] !== second[i] || first[i + 1] !== second[i + 1] || first[i + 2] !== second[i + 2] || first[i + 3] !== second[i + 3]) different++;
  return different;
}
function waterInk(pixels, reference) {
  let ink = 0;
  for (let y = 0; y < height; y++) for (let x = Math.ceil(reference.waterStart); x < Math.ceil(reference.waterEnd); x++) if (pixels[(y * width + x) * 4] < 200) ink++;
  return ink;
}

test("中文PDF水印真实字形与完整字体参考逐像素一致，回归能检出旧CFF子集缺字", { timeout: 30000 }, async (t) => {
  const text = "测试 AV 水印", file = await blankPdf();
  const output = await watermarkPdf(file, { ...defaultPdfWatermark, text, size, angle: 0, x: 50, y: 50, opacity: 100, color: "#000000" }, new AbortController().signal, () => {}, fontSource);
  const correct = await referencePdf(text, "watermark"), broken = await referencePdf(text, "watermark", true);
  const actualPixels = await raster(output.blob), correctPixels = await raster(correct.blob), brokenPixels = await raster(broken.blob);
  assert.equal(differentPixels(actualPixels, correctPixels), 0, "实际PDF水印字形必须与独立完整字体参考相同，不能仅提取到文字却没有轮廓");
  assert.ok(waterInk(actualPixels, correct) > 100, "水字区域必须有可见轮廓");
  assert.ok(differentPixels(brokenPixels, correctPixels) > 100, "旧subset:true fixture必须实际损坏，证明回归可检出缺字");
  assert.equal(waterInk(brokenPixels, broken), 0, "旧CFF子集的水字轮廓缺失，不能用文本提取测试代替栅格检查");
  assert.ok(output.blob.size > 0 && output.blob.size < 8 * 1024 * 1024, "完整字体输出仍应在8MiB内，不要求损坏子集的小体积");
  t.diagnostic(`中文水印输出 ${output.blob.size} bytes；完整字体参考 ${correct.blob.size} bytes；旧子集 ${broken.blob.size} bytes；水字墨迹 ${waterInk(actualPixels, correct)} px。`);
});

test("中文PDF页码混合模板保留水字轮廓，与独立完整字体参考逐像素一致", { timeout: 30000 }, async (t) => {
  const text = "测试 AV 水印 1", output = await numberPdfPages(await blankPdf(), { ...defaultPdfNumberOptions, template: "测试 AV 水印 {n}", start: 1, position: "bottom-center", size, margin: 10, opacity: 100, color: "#000000" }, new AbortController().signal, () => {}, fontSource);
  const correct = await referencePdf(text, "number"), actualPixels = await raster(output.blob), correctPixels = await raster(correct.blob);
  assert.equal(differentPixels(actualPixels, correctPixels), 0, "实际中文页码必须与独立完整字体参考相同");
  assert.ok(waterInk(actualPixels, correct) > 100, "页码模板中的水字不能丢失");
  assert.equal(output.changedPages, 1); assert.ok(output.blob.size > 0 && output.blob.size < 8 * 1024 * 1024);
  t.diagnostic(`中文页码输出 ${output.blob.size} bytes；水字墨迹 ${waterInk(actualPixels, correct)} px。`);
});
