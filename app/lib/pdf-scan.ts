import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PDFDocument, PDFStream } from "pdf-lib";
import { validateDocumentFile } from "./document-conversion";
import { parsePageSelection } from "./pdf-selection";
import { pdfExportDimensions, renderExportPage } from "./pdf-export";
import { isConstrainedDevice, toolLimits } from "./resource-limits";
import type { PdfScanOptions } from "./pdf-scan-options";
export type PdfScanResult = { blob: Blob; preview?: Blob; pages: number; sourcePages: number[] };
type Loader = (file: Blob, signal: AbortSignal) => Promise<PDFDocumentProxy>;
type Renderer = (page: PDFPageProxy, options: PdfScanOptions, signal: AbortSignal, preview: boolean) => Promise<{ blob: Blob; preview?: Blob }>;
type PixelFilter = (pixels: Uint8ClampedArray, mode: PdfScanOptions["mode"], threshold: number, signal: AbortSignal) => Promise<Uint8ClampedArray<ArrayBuffer>>;

// Binary backing buffers are measurable. The per-object reserve and transient
// multipliers are work allowances, not a measurement/guarantee of browser heap.
export function pdfScanStorage(document: Pick<PDFDocument, "context">) {
  const buffers = new Set<ArrayBufferLike>();
  const objects = document.context.enumerateIndirectObjects();
  let serializedBytes = 1024;
  for (const [ref, object] of objects) {
    serializedBytes += ref.sizeInBytes() + object.sizeInBytes() + 32;
    if (object instanceof PDFStream) buffers.add(object.getContents().buffer);
  }
  const bufferBytes = [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  return { bufferBytes, objectReserveBytes: objects.length * 1024, serializedBytes };
}
export function checkPdfScanWorkspace(retainedBytes: number, transientBytes: number, constrained = isConstrainedDevice()) {
  if (![retainedBytes, transientBytes].every((value) => Number.isSafeInteger(value) && value >= 0) || retainedBytes + transientBytes > toolLimits.pdfExport.bytes / (constrained ? 2 : 1)) {
    throw new Error("PDF 封装工作空间超过当前设备预算，请降低 DPI、改用 JPEG 或缩小页码范围。");
  }
}
function retainedScanBytes(storage: ReturnType<typeof pdfScanStorage>) {
  return storage.bufferBytes + storage.objectReserveBytes;
}
export function renderScanPage(page: PDFPageProxy, options: PdfScanOptions, signal: AbortSignal, preview: boolean, filter: PixelFilter = async (pixels, mode, threshold, signal) => (await import("./raster-worker-client")).runRasterWorker({ action: "scan", pixels, mode, threshold }, signal)) {
  return renderExportPage(page, { ...options, mode: "images" }, signal, preview, options.mode === "color" ? undefined : async (context, width, height) => {
    const image = context.getImageData(0, 0, width, height), pixels = await filter(image.data, options.mode, options.threshold, signal); signal.throwIfAborted();
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
  });
}
export async function createScannedPdf(file: File, options: PdfScanOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}, load: Loader = async (file, signal) => (await import("./document-pdf")).loadPdf(file, signal), render: Renderer = renderScanPage): Promise<PdfScanResult> {
  signal.throwIfAborted(); validateDocumentFile(file, "pdf-to-word");
  if (options.range.length > 10000 || ![72, 144, 216, 300].includes(options.dpi) || !["color", "grayscale", "threshold"].includes(options.mode) || !Number.isInteger(options.threshold) || options.threshold < 0 || options.threshold > 255 || !["png", "jpeg"].includes(options.format) || !Number.isFinite(options.quality) || options.quality < 0.5 || options.quality > 1) throw new Error("扫描件设置无效。");
  report(1, "正在加载 PDF…"); const pdf = await load(file, signal);
  const abort = () => { void pdf.loadingTask.destroy().catch(() => {}); }; signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted(); if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > toolLimits.pdf.sourcePages) throw new Error("PDF 须包含 1–1000 页。");
    const pages = options.range.trim() ? parsePageSelection(options.range, pdf.numPages) : Array.from({ length: pdf.numPages }, (_, i) => i);
    const output = await PDFDocument.create(); let preview: Blob | undefined, encodedBytes = 0;
    const budget = toolLimits.pdfExport.bytes / (isConstrainedDevice() ? 4 : 2);
    for (let i = 0; i < pages.length; i++) {
      signal.throwIfAborted(); const page = await pdf.getPage(pages[i] + 1);
      try {
        const base = page.getViewport({ scale: 1 }), dimensions = pdfExportDimensions(base.width, base.height, options.dpi);
        const storage = pdfScanStorage(output), pixelBytes = dimensions.width * dimensions.height * 12;
        checkPdfScanWorkspace(retainedScanBytes(storage), pixelBytes);
        report(3 + i / pages.length * 90, `正在生成第 ${pages[i] + 1} 页（${i + 1} / ${pages.length}）`);
        const rendered = await render(page, options, signal, i === 0); signal.throwIfAborted();
        if (rendered.blob.type !== `image/${options.format}`) throw new Error("页面图片编码格式与设置不一致。");
        encodedBytes += rendered.blob.size;
        if (encodedBytes > budget) throw new Error("页面图片总量超过当前设备预算，请降低 DPI、改用 JPEG 或缩小页码范围。");
        // A small PNG can expand to a large RGB channel; compressed input size
        // alone must not be treated as the document's retained memory budget.
        checkPdfScanWorkspace(retainedScanBytes(storage), pixelBytes + rendered.blob.size * 2);
        const data = await rendered.blob.arrayBuffer(); signal.throwIfAborted();
        const image = options.format === "jpeg" ? await output.embedJpg(data) : await output.embedPng(data); signal.throwIfAborted();
        output.addPage([base.width, base.height]).drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
        // PDF-lib otherwise retains every decoded PNG until the final save().
        await image.embed(); signal.throwIfAborted();
        checkPdfScanWorkspace(retainedScanBytes(pdfScanStorage(output)), 0);
        preview ??= rendered.preview;
      } finally { page.cleanup(); }
    }
    signal.throwIfAborted();
    const storage = pdfScanStorage(output);
    // Account for the still-live document streams, serialization and Blob copy.
    checkPdfScanWorkspace(retainedScanBytes(storage), storage.serializedBytes * 2);
    report(96, "正在封装图片型 PDF…"); const bytes = await output.save({ useObjectStreams: true }); signal.throwIfAborted();
    if (bytes.byteLength > budget) throw new Error("生成 PDF 超过当前设备输出预算，请缩小页码范围。");
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), preview, pages: pages.length, sourcePages: pages.map((index) => index + 1) };
  } finally { signal.removeEventListener("abort", abort); await pdf.loadingTask.destroy(); }
}
