import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const { createScannedPdf, pdfScanStorage, checkPdfScanWorkspace } = loadLocalModule("app/lib/pdf-scan.ts");
const { defaultPdfScanOptions } = loadLocalModule("app/lib/pdf-scan-options.ts");
const { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");
const source = new File(["loader fixture"], "source.pdf");
const options = { ...defaultPdfScanOptions, dpi: 72, mode: "color", format: "png" };

function captureOutput(t, transform = () => {}) {
  const original = PDFDocument.create;
  let output;
  PDFDocument.create = async (...args) => {
    output = await original.apply(PDFDocument, args);
    transform(output);
    return output;
  };
  t.after(() => { PDFDocument.create = original; });
  return () => output;
}
function loaderFixture(pages = 4) {
  let cleaned = 0, destroyed = 0;
  return {
    load: async () => ({
      numPages: pages,
      loadingTask: { async destroy() { destroyed++; } },
      async getPage(number) {
        return { number, getViewport: () => ({ width: 1024, height: 1024 }), cleanup() { cleaned++; } };
      },
    }),
    get cleaned() { return cleaned; },
    get destroyed() { return destroyed; },
  };
}
function rawChannels(output) {
  // Test-only observation of PDF-lib's actual retained decoded PNG buffers.
  return output.images.reduce((sum, image) => sum + (image.embedder?.image?.rgbChannel?.byteLength ?? 0), 0);
}
const whitePng = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();

test("低体积 PNG 的真实 PDF-lib 解压缓存可复现，显式 embed 释放通道但保留 PDF 图像流", async () => {
  const output = await PDFDocument.create();
  for (let index = 0; index < 4; index++) {
    const image = await output.embedPng(whitePng);
    output.addPage([1024, 1024]).drawImage(image, { x: 0, y: 0, width: 1024, height: 1024 });
  }
  assert.ok(whitePng.length < 6000);
  assert.equal(rawChannels(output), 4 * 1024 * 1024 * 3);
  for (const image of output.images) await image.embed();
  assert.equal(rawChannels(output), 0);
  const storage = pdfScanStorage(output);
  assert.ok(storage.bufferBytes > 0, "释放 RGB 并不代表输出文档没有保留二进制");
  assert.ok(storage.bufferBytes < 100_000);
  assert.ok(storage.objectReserveBytes > 0);
  assert.equal((await PDFDocument.load(await output.save())).getPageCount(), 4);
});

test("扫描逐页完成嵌入，下一页不再引用先前 RGB，页序尺寸与完整 PDF 保持", async (t) => {
  const output = captureOutput(t), loader = loaderFixture(), rendered = [];
  const result = await createScannedPdf(source, { ...options, range: "4,2,1" }, new AbortController().signal, undefined, loader.load, async (page) => {
    assert.equal(rawChannels(output()), 0, "开始下一页前，之前的解压通道必须已释放");
    assert.ok(output().images.every((image) => image.embedder === undefined));
    rendered.push(page.number);
    return { blob: new Blob([whitePng], { type: "image/png" }) };
  });
  assert.deepEqual(rendered, [4, 2, 1]);
  assert.deepEqual(result.sourcePages, [4, 2, 1]);
  assert.equal(result.pages, 3);
  assert.equal(rawChannels(output()), 0);
  const document = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.deepEqual(document.getPages().map((page) => page.getSize()), Array(3).fill({ width: 1024, height: 1024 }));
  assert.equal(loader.cleaned, 3);
  assert.equal(loader.destroyed, 1);
});

test("工作空间核对真实 backing buffer 大小，重用视图不重计，并预留序列化空间", async () => {
  const output = await PDFDocument.create(), backing = new Uint8Array(64 * 1024);
  output.context.register(output.context.stream(backing.subarray(0, 8)));
  output.context.register(output.context.stream(backing.subarray(8, 16)));
  const storage = pdfScanStorage(output);
  assert.equal(storage.bufferBytes, backing.buffer.byteLength, "小视图仍持有完整缓冲，不只计算视图长度");
  assert.ok(storage.serializedBytes > 1024);
  const desktop = toolLimits.pdfExport.bytes, mobile = desktop / 2;
  assert.doesNotThrow(() => checkPdfScanWorkspace(desktop - 1, 1, false));
  assert.throws(() => checkPdfScanWorkspace(desktop - 1, 2, false), /工作空间/);
  assert.doesNotThrow(() => checkPdfScanWorkspace(mobile - 1, 1, true));
  assert.throws(() => checkPdfScanWorkspace(mobile - 1, 2, true), /工作空间/);
  // Input PNG budget alone cannot account for live document and writer copies.
  assert.throws(() => checkPdfScanWorkspace(desktop / 2, desktop / 2 + storage.serializedBytes * 2, false), /工作空间/);
  for (const value of [NaN, Infinity, -1, 0.5]) assert.throws(() => checkPdfScanWorkspace(value, 0, false), /工作空间/);
});

test("嵌入后的取消不返回半成品，已释放当前 PNG 通道并清理源页面和文档", async (t) => {
  const controller = new AbortController(), loader = loaderFixture();
  const output = captureOutput(t, (document) => {
    const embedPng = document.embedPng.bind(document);
    document.embedPng = async (...args) => {
      const image = await embedPng(...args), embed = image.embed.bind(image);
      image.embed = async () => { await embed(); controller.abort(new Error("测试取消")); };
      return image;
    };
  });
  await assert.rejects(createScannedPdf(source, options, controller.signal, undefined, loader.load, async () => ({ blob: new Blob([whitePng], { type: "image/png" }) })), /测试取消/);
  assert.equal(rawChannels(output()), 0);
  assert.equal(loader.cleaned, 1);
  assert.ok(loader.destroyed >= 1);
});
