import type { loadPdf, renderPdfPage } from "./document-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

type PreviewEngine = { loadPdf: typeof loadPdf; renderPdfPage: typeof renderPdfPage };

/** One parsed document per input; only one page render can own the session. */
export function createPdfPreviewSession(file: Blob, loadEngine: () => Promise<PreviewEngine> = () => import("./document-pdf")) {
  const lifetime = new AbortController();
  let engine: Promise<PreviewEngine> | undefined, document: Promise<PDFDocumentProxy> | undefined;
  let active: AbortController | undefined, disposal: Promise<void> | undefined;
  function destroy(pdf: PDFDocumentProxy) {
    disposal ??= Promise.resolve().then(() => pdf.loadingTask.destroy()).catch(() => {});
    return disposal;
  }
  function load() {
    engine ??= loadEngine();
    document ??= engine.then(async (api) => {
      lifetime.signal.throwIfAborted();
      const pdf = await api.loadPdf(file, lifetime.signal);
      if (lifetime.signal.aborted) { await destroy(pdf); lifetime.signal.throwIfAborted(); }
      return pdf;
    });
    return document;
  }
  return {
    async render(page: number, signal: AbortSignal, scale = 1) {
      signal.throwIfAborted(); lifetime.signal.throwIfAborted();
      active?.abort();
      const controller = new AbortController(); active = controller;
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      try {
        const pdf = await load(), api = await engine!;
        controller.signal.throwIfAborted(); lifetime.signal.throwIfAborted();
        const result = await api.renderPdfPage(pdf, page, controller.signal, scale);
        controller.signal.throwIfAborted(); lifetime.signal.throwIfAborted();
        return result;
      } finally { signal.removeEventListener("abort", abort); if (active === controller) active = undefined; }
    },
    async dispose() {
      active?.abort(); lifetime.abort();
      if (document) await document.then(destroy, () => {});
    },
  };
}
