import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { DocumentSettings } from "./document-conversion";
import type { ConversionProgress, DocumentResult } from "./document-engine";
import { checkDocxArchive } from "./document-engine";
import { loadPdf, renderPdfPage } from "./document-pdf";

function makePdf(definition: TDocumentDefinitions, signal: AbortSignal, progress: ConversionProgress): Promise<Blob> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/document-pdf.worker.ts", import.meta.url), { type: "module" });
    const close = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = () => { close(); reject(new DOMException("已取消", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { close(); reject(new Error("PDF生成引擎启动失败，请刷新后重试。")); };
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") progress(data.percent, data.message);
      if (data.type === "done") { close(); resolve(data.blob); }
      if (data.type === "error") { close(); reject(new Error(data.message)); }
    };
    try { worker.postMessage(definition); } catch (cause) { close(); reject(cause); }
  });
}

function fitImages(value: unknown, width: number, height: number) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((child) => fitImages(child, width, height)); return; }
  const node = value as Record<string, unknown>;
  delete node.link;
  if (node.image) { delete node.width; delete node.height; node.fit = [width, height]; }
  Object.values(node).forEach((child) => fitImages(child, width, height));
}

export async function wordToPdf(file: File, settings: DocumentSettings, signal: AbortSignal, progress: ConversionProgress): Promise<DocumentResult> {
  progress(5, "加载Word转换引擎…");
  const [mammothModule, purifierModule, htmlModule] = await Promise.all([
    import("mammoth/mammoth.browser"), import("dompurify"), import("html-to-pdfmake"),
  ]);
  signal.throwIfAborted();
  const mammoth = mammothModule.default;
  const buffer = await file.arrayBuffer();
  checkDocxArchive(buffer);
  const warnings: string[] = [];
  progress(15, "读取文档、表格和图片…");
  const converted = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
    externalFileAccess: false, includeEmbeddedStyleMap: false,
    styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='标题'] => h1:fresh"],
    convertImage: mammoth.images.imgElement(async (image) => {
      if (!/^image\/(png|jpeg)$/.test(image.contentType)) {
        warnings.push("部分图片格式不受支持，已跳过。建议在Word中改用PNG或JPG。");
        return { src: "" };
      }
      return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` };
    }),
  });
  signal.throwIfAborted();
  const safeHtml = purifierModule.default.sanitize(converted.value, {
    ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "i", "em", "u", "s", "sub", "sup", "br", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "img", "a"],
    ALLOWED_ATTR: ["src", "alt", "colspan", "rowspan"],
  });
  const html = new DOMParser().parseFromString(safeHtml, "text/html");
  html.querySelectorAll("img").forEach((img) => { if (!/^data:image\/(png|jpeg);base64,/i.test(img.getAttribute("src") || "")) img.remove(); });
  if (!html.body.textContent?.trim() && !html.querySelector("img")) throw new Error("文档中没有可转换的正文或图片。");
  const content = htmlModule.default(html.body.innerHTML, {
    tableAutoSize: true,
    defaultStyles: { h1: { fontSize: 22 }, h2: { fontSize: 18 }, h3: { fontSize: 15 }, p: { margin: [0, 0, 0, 8] } },
  }) as Content;
  let [width, height] = settings.paper === "A4" ? [595.28, 841.89] : [612, 792];
  if (settings.landscape) [width, height] = [height, width];
  fitImages(content, width - 88, height - 100);
  const blob = await makePdf({
    content, pageSize: settings.paper, pageOrientation: settings.landscape ? "landscape" : "portrait",
    pageMargins: [44, 44, 44, 44], defaultStyle: { font: "NotoSC", fontSize: 11, lineHeight: 1.25 },
    info: { title: file.name.replace(/\.docx$/i, ""), creator: "多功能工具箱" },
  }, signal, progress);
  signal.throwIfAborted();
  progress(90, "生成PDF首页预览…");
  const pdf = await loadPdf(blob, signal);
  try {
    const preview = await renderPdfPage(pdf, 1, signal);
    signal.throwIfAborted();
    return { blob, preview: preview.blob, pages: pdf.numPages, warnings: [...new Set(warnings)] };
  } finally { await pdf.loadingTask.destroy(); }
}
