import { StandardFonts, degrees, rgb } from "pdf-lib";
import { loadEditablePdf, saveEditedPdf, loadPdfTextFont, pageGeometry, visiblePdfPoint } from "./pdf-page-tools";
import { parsePageSelection } from "./pdf-selection";
import { planPdfWatermarks, validatePdfWatermark, watermarkBaseline, type PdfWatermarkOptions } from "./pdf-watermark-options";

export async function watermarkPdf(file: File, options: PdfWatermarkOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}, fontSource = loadPdfTextFont) {
  validatePdfWatermark(options); signal.throwIfAborted();
  const pdf = await loadEditablePdf(file, signal), total = pdf.getPageCount();
  const pages = options.range.trim() ? parsePageSelection(options.range, total) : Array.from({ length: total }, (_, i) => i);
  if (!pages.length) throw new Error("页码范围没有有效页面，请输入页码或留空处理全部。");
  const standardFont = /^[\x20-\x7e]+$/.test(options.text);
  let font;
  if (standardFont) font = await pdf.embedFont(StandardFonts.Helvetica);
  else {
    report(5, "正在加载项目内中文字体…");
    const [kit, data] = await Promise.all([import("@pdf-lib/fontkit"), fontSource(signal)]); signal.throwIfAborted();
    // The current CFF subset encoder can drop visible glyph outlines in mixed
    // Chinese/Latin text. Embed the complete project font for reliable output.
    pdf.registerFontkit(kit.default); font = await pdf.embedFont(data, { subset: false });
  }
  const supported = new Set(font.getCharacterSet());
  if ([...options.text].some((char) => !supported.has(char.codePointAt(0)!))) throw new Error("水印中有当前字体不支持的字符，请移除 Emoji 或罕见字后重试。");
  // Helvetica's widthOfTextAtSize includes kerning, while drawText emits a Tj
  // without kerning offsets. Measure actual glyph advances to avoid clipping.
  const textWidth = standardFont ? [...options.text].reduce((sum, char) => sum + font.widthOfTextAtSize(char, options.size), 0) : font.widthOfTextAtSize(options.text, options.size);
  const textHeight = font.heightAtSize(options.size), ascent = font.heightAtSize(options.size, { descender: false });
  // Validate every page and total operator count before altering the document.
  let stamps = 0;
  const plans = pages.map((index) => {
    signal.throwIfAborted(); const geometry = pageGeometry(pdf.getPage(index));
    const centers = planPdfWatermarks(geometry.displayWidth, geometry.displayHeight, textWidth, textHeight, options);
    stamps += centers.length;
    if (stamps > 50000) throw new Error("整份文档水印超过 50000 个，请减小页码范围或增大间隔。");
    return { index, geometry, centers };
  });
  const color = rgb(...[1, 3, 5].map((at) => parseInt(options.color.slice(at, at + 2), 16) / 255) as [number, number, number]);
  for (let i = 0; i < plans.length; i++) {
    signal.throwIfAborted(); const { index, geometry, centers } = plans[i], page = pdf.getPage(index);
    for (const center of centers) {
      signal.throwIfAborted(); const baseline = watermarkBaseline(center.x, center.y, textWidth, ascent, textHeight, options.angle);
      page.drawText(options.text, { ...visiblePdfPoint(geometry, baseline.u, baseline.v), font, size: options.size, rotate: degrees(geometry.rotation + options.angle), color, opacity: options.opacity / 100 });
    }
    report(10 + (i + 1) / plans.length * 80, `正在添加第 ${index + 1} 页水印…`);
  }
  report(92, "正在封装 PDF…");
  return { blob: await saveEditedPdf(pdf, signal), changedPages: pages.length, stamps };
}
