import type { PDFDocumentProxy } from "pdfjs-dist";
import { maxPdfPages } from "./document-conversion";

export async function loadPdf(file: Blob, signal: AbortSignal): Promise<PDFDocumentProxy> {
  signal.throwIfAborted();
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", useSystemFonts: true });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    signal.throwIfAborted();
    if (pdf.numPages > maxPdfPages) throw new Error(`最多支持${maxPdfPages}页PDF，请拆分后再试。`);
    return pdf;
  } catch (cause) {
    await task.destroy();
    if (cause instanceof Error && cause.name === "PasswordException") throw new Error("文件受密码保护，请先在PDF阅读器中解锁后再转换。");
    if (cause instanceof Error && cause.name === "InvalidPDFException") throw new Error("PDF无法读取，文件可能损坏或不是有效的PDF。");
    throw cause;
  } finally { signal.removeEventListener("abort", abort); }
}

export async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, signal: AbortSignal, scale = 1.4) {
  signal.throwIfAborted();
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(scale, Math.sqrt(4_000_000 / (base.width * base.height))) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法绘制PDF预览。");
  const task = page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" });
  const abort = () => task.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    await task.promise;
    signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("页面渲染失败。")), "image/png"));
    return { blob, width: base.width, height: base.height };
  } finally {
    signal.removeEventListener("abort", abort);
    canvas.width = 0; canvas.height = 0;
    page.cleanup();
  }
}
