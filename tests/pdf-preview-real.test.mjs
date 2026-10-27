import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { renderPdfPage } = loadLocalModule("app/lib/document-pdf.ts");
const { createPdfPreviewSession } = loadLocalModule("app/lib/pdf-preview-session.ts");

for (const scale of [1, 0.7]) test(`真实三页 PDF（${scale} 倍）前后输出一致，解析及销毁三次降为一次`, async () => {
  const source = await PDFDocument.create();
  for (let i = 0; i < 3; i++) source.addPage([100 + i * 20, 160]).drawRectangle({ x: 0, y: 0, width: 100, height: 160, color: rgb(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0) });
  const file = new Blob([await source.save()]), descriptor = Object.getOwnPropertyDescriptor(globalThis, "document"), canvases = [];
  class Canvas {
    constructor() { this.inner = createCanvas(1, 1); this.w = 0; this.h = 0; canvases.push(this); }
    get width() { return this.w; } set width(n) { this.w = n; this.inner.width = Math.max(1, n); }
    get height() { return this.h; } set height(n) { this.h = n; this.inner.height = Math.max(1, n); }
    getContext() { return this.inner.getContext("2d"); }
    toBlob(callback) { void this.inner.encode("png").then((bytes) => callback(new Blob([bytes], { type: "image/png" }))); }
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new Canvas() } });
  const counters = { baseline: { loads: 0, destroys: 0 }, session: { loads: 0, destroys: 0 } };
  async function load(counter) {
    counter.loads++;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true, isEvalSupported: false }).promise;
    const destroy = doc.loadingTask.destroy.bind(doc.loadingTask); doc.loadingTask.destroy = async () => { counter.destroys++; return destroy(); }; return doc;
  }
  let session;
  try {
    const before = [], after = [], signal = new AbortController().signal;
    for (let page = 1; page <= 3; page++) {
      const pdf = await load(counters.baseline);
      try { before.push(await renderPdfPage(pdf, page, signal, scale)); } finally { await pdf.loadingTask.destroy(); }
    }
    session = createPdfPreviewSession(file, async () => ({ loadPdf: () => load(counters.session), renderPdfPage }));
    for (let page = 1; page <= 3; page++) after.push(await session.render(page, signal, scale));
    assert.deepEqual(counters.baseline, { loads: 3, destroys: 3 }); assert.deepEqual(counters.session, { loads: 1, destroys: 0 });
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(Buffer.from(await before[i].blob.arrayBuffer()), Buffer.from(await after[i].blob.arrayBuffer()));
      const image = await loadImage(Buffer.from(await after[i].blob.arrayBuffer())); assert.equal(image.width, Math.ceil((100 + i * 20) * scale)); assert.equal(image.height, Math.ceil(160 * scale));
      const canvas = createCanvas(image.width, image.height), context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      assert.deepEqual([...context.getImageData(10, 10, 1, 1).data], [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]][i]);
    }
    assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    await session.dispose(); assert.equal(counters.session.destroys, 1);
  } finally {
    await session?.dispose(); if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else delete globalThis.document;
  }
});
