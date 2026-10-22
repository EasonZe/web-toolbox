import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, degrees } from "pdf-lib";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const pdf = loadLocalModule("app/lib/pdf-pages.ts");
async function fixture(pages = 3) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300 + i, 400]).setRotation(degrees(90));
  return doc.save();
}
test("PDF 合并遵循全站 2000 页策略，不再意外卡在 300 页", async () => {
  const bytes = await fixture(1), choice = { source: 0, page: 0, rotation: 0 };
  assert.equal((await PDFDocument.load(await pdf.buildPdf([bytes], Array(301).fill(choice)))).getPageCount(), 301);
  await assert.rejects(pdf.buildPdf([bytes], Array(2001).fill(choice)), /2000/);
  assert.throws(() => pdf.parsePageSelection("1-2000,2001", 2001), /2000/);
  assert.throws(() => pdf.parsePageSelection("1-2001", 2001), /2000/);
});
test("PDF 拆分只解析使用的源一次，保留页序、原有旋转和文件名", async () => {
  const bytes = await fixture(), original = PDFDocument.load;
  let loads = 0;
  PDFDocument.load = function (...args) { loads++; return original.apply(this, args); };
  let result;
  try {
    result = await pdf.splitPdf([bytes, new Uint8Array([0])], [
      { source: 0, page: 2, rotation: 90 }, { source: 0, page: 0, rotation: -90 },
    ]);
    assert.equal(loads, 1, "未使用的源不能被加载，使用的源只加载一次");
  } finally { PDFDocument.load = original; }
  assert.deepEqual(result.map((entry) => entry.name), ["page-001.pdf", "page-002.pdf"]);
  const [a, b] = await Promise.all(result.map((entry) => PDFDocument.load(entry.data)));
  assert.equal(a.getPage(0).getWidth(), 302);
  assert.equal(a.getPage(0).getRotation().angle, 180);
  assert.equal(b.getPage(0).getRotation().angle, 0);
  assert.equal((await PDFDocument.load(bytes)).getPage(0).getRotation().angle, 90);
});
test("PDF 合并和拆分提前拒绝无效页码、来源、旋转和空结果", async () => {
  const bytes = await fixture();
  for (const fn of [pdf.buildPdf, pdf.splitPdf]) {
    await assert.rejects(fn([bytes], []), /2000/);
    for (const choice of [
      { source: .5, page: 0, rotation: 0 }, { source: 1, page: 0, rotation: 0 },
      { source: 0, page: 3, rotation: 0 }, { source: 0, page: -1, rotation: 0 },
      { source: 0, page: 0, rotation: 1 },
    ]) await assert.rejects(fn([bytes], [choice]), /无效/);
  }
});
