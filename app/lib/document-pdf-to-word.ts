import type { DocumentSettings } from "./document-conversion";
import { groupPdfText } from "./document-conversion";
import type { ConversionProgress, DocumentResult } from "./document-engine";
import { loadPdf, renderPdfPage } from "./document-pdf";

export async function pdfToWord(file: File, settings: DocumentSettings, signal: AbortSignal, progress: ConversionProgress): Promise<DocumentResult> {
  progress(5, "加载PDF转换引擎…");
  const [docx, pdfjs] = await Promise.all([import("docx"), import("pdfjs-dist")]);
  signal.throwIfAborted();
  const pdf = await loadPdf(file, signal);
  const abort = () => { void pdf.loadingTask.destroy().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    if (settings.mode === "layout" && pdf.numPages > 30) throw new Error("保留版式模式最多支持30页，请拆分文件后再试。");
    const sections: ConstructorParameters<typeof docx.Document>[0]["sections"][number][] = [];
    const emptyPages: number[] = [];
    let preview: Blob | undefined, textCharacters = 0, imageBytes = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      signal.throwIfAborted();
      progress(Math.round(10 + 75 * (index - 1) / pdf.numPages), `正在转换第${index}/${pdf.numPages}页…`);
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      if (viewport.width > 1584 || viewport.height > 1584 || viewport.width < 72 || viewport.height < 72) throw new Error("PDF页面尺寸超出Word支持范围，请先调整纸张大小。");
      // docx swaps width/height itself for landscape sections.
      const size = { width: Math.round(Math.min(viewport.width, viewport.height) * 20),
        height: Math.round(Math.max(viewport.width, viewport.height) * 20),
        orientation: viewport.width > viewport.height ? docx.PageOrientation.LANDSCAPE : docx.PageOrientation.PORTRAIT };
      if (settings.mode === "layout") {
        const rendered = await renderPdfPage(pdf, index, signal, 1.6);
        preview ??= rendered.blob;
        imageBytes += rendered.blob.size;
        if (imageBytes > 60 * 1024 * 1024) throw new Error("页面图片超过60 MB，请减少页数后再转换。");
        const image = new docx.ImageRun({ type: "png", data: await rendered.blob.arrayBuffer(),
          transformation: { width: viewport.width * 96 / 72, height: viewport.height * 96 / 72 },
          floating: { horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true },
        });
        sections.push({ properties: { type: docx.SectionType.NEXT_PAGE, page: { size, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
          children: [new docx.Paragraph({ children: [image], spacing: { before: 0, after: 0, line: 20, lineRule: docx.LineRuleType.EXACT } })] });
      } else {
        const content = await page.getTextContent();
        const items = content.items.flatMap((item) => {
          if (!("str" in item)) return [];
          const transform = pdfjs.Util.transform(viewport.transform, item.transform);
          return [{ text: item.str, x: transform[4], y: transform[5], width: item.width, height: Math.max(1, Math.hypot(transform[2], transform[3])) }];
        });
        const lines = groupPdfText(items);
        textCharacters += lines.reduce((sum, line) => sum + line.text.length, 0);
        if (!lines.length) emptyPages.push(index);
        sections.push({ properties: { type: docx.SectionType.NEXT_PAGE, page: { size, margin: { top: 600, bottom: 600, left: 600, right: 600 } } },
          children: lines.length ? lines.map((line) => new docx.Paragraph({ spacing: { after: 60 }, children: [new docx.TextRun({ text: line.text, size: Math.round(Math.min(48, Math.max(16, line.height * 2))) })] })) : [new docx.Paragraph("")] });
        if (index === 1) preview = (await renderPdfPage(pdf, index, signal)).blob;
        page.cleanup();
      }
    }
    if (settings.mode === "text" && !textCharacters) throw new Error("没有检测到可提取文字。扫描件或图片PDF请改选“保留版式”，当前不提供OCR识别。");
    signal.throwIfAborted();
    progress(90, "正在打包Word文档…");
    const document = new docx.Document({ sections, creator: "Eason的工具箱", title: file.name.replace(/\.pdf$/i, ""),
      styles: { default: { document: { run: { font: "Microsoft YaHei", size: 22 } } } } });
    const blob = await docx.Packer.toBlob(document);
    signal.throwIfAborted();
    const warnings = emptyPages.length ? [`第${emptyPages.join("、")}页未检测到文字，已保留为空白页。若需要页面图像，请改用“保留版式”。`] : [];
    return { blob, preview: preview!, pages: pdf.numPages, warnings };
  } finally { signal.removeEventListener("abort", abort); await pdf.loadingTask.destroy(); }
}
