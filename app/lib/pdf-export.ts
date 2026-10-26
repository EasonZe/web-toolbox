import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PdfExportOptions } from "./pdf-export-options";
import { validateDocumentFile, groupPdfText } from "./document-conversion";
import { parsePageSelection } from "./pdf-selection";
import { LocalZipWriter } from "./local-zip-writer";
import { toolLimits, isConstrainedDevice } from "./resource-limits";
export type PdfExportResult = { blob: Blob; preview?: Blob; text?: string; pages: number; emptyPages: number[]; extension: string };
type Loader = (file: Blob, signal: AbortSignal) => Promise<PDFDocumentProxy>;
type Render = (page: PDFPageProxy, options: PdfExportOptions, signal: AbortSignal, preview: boolean) => Promise<{ blob: Blob; preview?: Blob }>;
export function pdfExportDimensions(width: number, height: number, dpi: number, constrained = isConstrainedDevice()) {
  if (![width, height].every((v) => Number.isFinite(v) && v > 0) || ![72, 144, 216, 300].includes(dpi)) throw new Error("PDF 页面尺寸或 DPI 无效。");
  const output = { width: Math.ceil(width * dpi / 72), height: Math.ceil(height * dpi / 72) };
  if (output.width > toolLimits.raster.edge || output.height > toolLimits.raster.edge || output.width * output.height > (constrained ? toolLimits.pdfExport.mobilePixels : toolLimits.pdfExport.desktopPixels)) throw new Error("此页在所选 DPI 下超过画布预算，请降低 DPI；不会静默降低导出清晰度。");
  return output;
}
export async function renderExportPage(page: PDFPageProxy, options: PdfExportOptions, signal: AbortSignal, includePreview = true) {
  const base = page.getViewport({ scale: 1 }), dimensions = pdfExportDimensions(base.width, base.height, options.dpi);
  const viewport = page.getViewport({ scale: options.dpi / 72 });
  const canvas = document.createElement("canvas"); canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) { canvas.width = canvas.height = 0; throw new Error("当前浏览器不支持 PDF 图片绘制。"); }
  let task: ReturnType<PDFPageProxy["render"]> | undefined;
  const abort = () => task?.cancel(); signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted(); task = page.render({ canvas, viewport, background: "#ffffff", annotationMode: 0 }); await task.promise; signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PDF 图片编码失败。")), `image/${options.format}`, options.quality));
    if (blob.type !== `image/${options.format}`) throw new Error("浏览器无法按所选图片格式导出。");
    if (!includePreview) { signal.throwIfAborted(); return { blob }; }
    const thumb = document.createElement("canvas");
    try {
      const scale = Math.min(1, 1000 / Math.max(canvas.width, canvas.height)); thumb.width = Math.max(1, Math.round(canvas.width * scale)); thumb.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = thumb.getContext("2d"); if (!ctx) throw new Error("无法绘制 PDF 缩略图。"); ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const preview = await new Promise<Blob>((resolve, reject) => thumb.toBlob((result) => result ? resolve(result) : reject(new Error("预览编码失败。")), "image/png"));
      signal.throwIfAborted(); return { blob, preview };
    } finally { thumb.width = thumb.height = 0; }
  } finally { signal.removeEventListener("abort", abort); canvas.width = canvas.height = 0; }
}
export async function exportPdf(file: File, options: PdfExportOptions, signal: AbortSignal, report: (progress: number, text: string) => void = () => {}, load: Loader = async (file, signal) => (await import("./document-pdf")).loadPdf(file, signal), render: Render = renderExportPage): Promise<PdfExportResult> {
  validateDocumentFile(file, "pdf-to-word");
  if (!["images", "text"].includes(options.mode) || !["png", "jpeg"].includes(options.format) || ![72, 144, 216, 300].includes(options.dpi) || !Number.isFinite(options.quality) || options.quality < 0.5 || options.quality > 1) throw new Error("PDF 导出选项无效。");
  signal.throwIfAborted(); report(2, "正在加载 PDF…");
  const pdf = await load(file, signal);
  const abort = () => { void pdf.loadingTask.destroy().catch(() => {}); }; signal.addEventListener("abort", abort, { once: true });
  const zip = new LocalZipWriter(toolLimits.pdfExport.bytes / (isConstrainedDevice() ? 2 : 1));
  try {
    signal.throwIfAborted();
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > toolLimits.pdf.sourcePages) throw new Error("PDF 页数无效或超过 1000 页。");
    const selected = options.range.trim() ? parsePageSelection(options.range, pdf.numPages) : Array.from({ length: pdf.numPages }, (_, i) => i);
    if (!selected.length) throw new Error("请至少选择一页。");
    let preview: Blob | undefined, single: Blob | undefined, characters = 0; const texts: string[] = [], emptyPages: number[] = [];
    for (let i = 0; i < selected.length; i++) {
      signal.throwIfAborted(); const number = selected[i] + 1; report(5 + i / selected.length * 90, `正在处理第 ${number} 页（${i + 1} / ${selected.length}）`);
      const page = await pdf.getPage(number);
      try {
        if (options.mode === "images") {
          const viewport = page.getViewport({ scale: 1 }); pdfExportDimensions(viewport.width, viewport.height, options.dpi);
          const output = await render(page, options, signal, i === 0); signal.throwIfAborted(); preview ??= output.preview;
          if (selected.length === 1) single = output.blob;
          else await zip.add(`${String(i + 1).padStart(4, "0")}-page-${number}.${options.format === "png" ? "png" : "jpg"}`, output.blob, signal);
        } else {
          const content = await page.getTextContent(); signal.throwIfAborted();
          if (content.items.length > toolLimits.structured.nodes) throw new Error("此页文字片段过多，请缩小处理范围或导出为图片。");
          const viewport = page.getViewport({ scale: 1 }), [a, b, c, d, e, f] = viewport.transform;
          const lines = groupPdfText(content.items.flatMap((item) => "str" in item ? [{ text: item.str, x: a * item.transform[4] + c * item.transform[5] + e, y: b * item.transform[4] + d * item.transform[5] + f, width: item.width, height: Math.max(1, Math.hypot(item.transform[2], item.transform[3])) }] : []));
          const text = lines.map((line) => line.text).join("\n"); characters += text.length;
          if (characters > toolLimits.text.resultChars) throw new Error("提取文字超过 3200 万字符，请缩小页码范围。");
          if (!text.trim()) emptyPages.push(number);
          texts.push(`--- 第 ${number} 页 ---\n${text}`);
        }
      } finally { page.cleanup(); }
    }
    signal.throwIfAborted();
    if (options.mode === "text") {
      const text = texts.join("\n\n"); return { blob: new Blob([text], { type: "text/plain;charset=utf-8" }), text, pages: selected.length, emptyPages, extension: "txt" };
    }
    if (single && single.size > toolLimits.pdfExport.bytes / (isConstrainedDevice() ? 2 : 1)) throw new Error("单页图片超过输出预算，请降低 DPI。");
    if (!single) await zip.add("pages.json", new Blob([JSON.stringify({ pages: selected.map((p) => p + 1), dpi: options.dpi, format: options.format }, null, 2)]), signal);
    return { blob: single ?? zip.finish(), preview, pages: selected.length, emptyPages, extension: single ? options.format === "png" ? "png" : "jpg" : "zip" };
  } finally { signal.removeEventListener("abort", abort); zip.dispose(); await pdf.loadingTask.destroy(); }
}
