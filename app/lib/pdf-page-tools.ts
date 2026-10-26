import { PDFDocument, PDFName, PDFNumber, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import { toolLimits } from "./resource-limits";
import { parsePageSelection } from "./pdf-selection";
import { designColor } from "./design-generator-options";
import type { PdfGeometry, PdfMargins, PdfCropOptions, PdfNumberOptions } from "./pdf-page-options";
export function pageGeometry(page: PDFPage): PdfGeometry {
  const media = page.getMediaBox(), crop = page.getCropBox(), rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const unit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
  if (unit !== 1) throw new Error("暂不支持 UserUnit 不为 1 的 PDF，请先在阅读器中另存为标准页面单位。");
  const x = Math.max(media.x, crop.x), y = Math.max(media.y, crop.y), width = Math.min(media.x + media.width, crop.x + crop.width) - x, height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  if (![x, y, width, height].every(Number.isFinite) || width < 1 || height < 1 || ![0, 90, 180, 270].includes(rotation)) throw new Error("PDF 页面可见区域或旋转角度无效。");
  return { x, y, width, height, rotation, displayWidth: rotation % 180 ? height : width, displayHeight: rotation % 180 ? width : height };
}
/** Display coordinates have top-left origin; PDF coordinates have bottom-left origin. */
export function visiblePdfPoint(g: PdfGeometry, u: number, v: number) {
  if (![u, v].every(Number.isFinite)) throw new Error("页面坐标无效。");
  if (g.rotation === 0) return { x: g.x + u, y: g.y + g.height - v };
  if (g.rotation === 90) return { x: g.x + v, y: g.y + u };
  if (g.rotation === 180) return { x: g.x + g.width - u, y: g.y + v };
  if (g.rotation === 270) return { x: g.x + g.width - v, y: g.y + g.height - u };
  throw new Error("旋转角度无效。");
}
export function croppedPdfBox(g: PdfGeometry, margins: PdfMargins) {
  if (Object.values(margins).length !== 4 || ![margins.top, margins.right, margins.bottom, margins.left].every((v) => Number.isFinite(v) && v >= 0 && v < 100) || margins.left + margins.right >= 100 || margins.top + margins.bottom >= 100) throw new Error("四边裁切比例须为 0–99%，左右、上下之和分别须小于 100%。");
  const left = g.displayWidth * margins.left / 100, top = g.displayHeight * margins.top / 100, right = g.displayWidth * (1 - margins.right / 100), bottom = g.displayHeight * (1 - margins.bottom / 100);
  const corners = [visiblePdfPoint(g, left, top), visiblePdfPoint(g, right, top), visiblePdfPoint(g, left, bottom), visiblePdfPoint(g, right, bottom)], x = Math.min(...corners.map((p) => p.x)), y = Math.min(...corners.map((p) => p.y)), width = Math.max(...corners.map((p) => p.x)) - x, height = Math.max(...corners.map((p) => p.y)) - y;
  if (width < 1 || height < 1) throw new Error("裁切后页面小于 1 PDF 点，请减小裁切比例。");
  return { x, y, width, height };
}
async function load(file: File, signal: AbortSignal) {
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > toolLimits.pdf.bytes) throw new Error("请选择非空 PDF，最多 200 MiB。");
  signal.throwIfAborted(); const bytes = await file.arrayBuffer(); signal.throwIfAborted();
  let pdf: PDFDocument; try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); } catch (cause) { if (/encrypt/i.test(String(cause))) throw new Error("PDF 受密码保护，请先在阅读器中解锁。"); throw new Error("PDF 无法读取，文件可能已损坏。"); }
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > toolLimits.pdf.sourcePages) throw new Error("PDF 须为 1–1000 页。");
  return pdf;
}
export async function inspectPdfGeometry(file: File, signal: AbortSignal) { const pdf = await load(file, signal); return pdf.getPages().map(pageGeometry); }
const selection = (range: string, total: number) => range.trim() ? parsePageSelection(range, total) : Array.from({ length: total }, (_, i) => i);
async function save(pdf: PDFDocument, signal: AbortSignal) { signal.throwIfAborted(); const bytes = await pdf.save(); signal.throwIfAborted(); if (bytes.length > toolLimits.pdf.bytes) throw new Error("输出 PDF 超过 200 MiB，请缩小处理范围。"); return new Blob([new Uint8Array(bytes)], { type: "application/pdf" }); }
export async function cropPdfPages(file: File, options: PdfCropOptions, signal: AbortSignal, report: (n: number, text: string) => void = () => {}) {
  const pdf = await load(file, signal), pages = selection(options.range, pdf.getPageCount());
  for (let i = 0; i < pages.length; i++) { signal.throwIfAborted(); const page = pdf.getPage(pages[i]), box = croppedPdfBox(pageGeometry(page), options.margins); page.setCropBox(box.x, box.y, box.width, box.height); report(5 + i / pages.length * 90, `正在裁切第 ${pages[i] + 1} 页`); }
  return { blob: await save(pdf, signal), changedPages: pages.length };
}
export function numberLabel(template: string, n: number, total: number, page: number) {
  if (!template || template.length > 120 || /[\u0000-\u001f\u007f]/.test(template) || /[{}]/.test(template.replace(/\{(n|total|page)\}/g, ""))) throw new Error("页码模板须为单行，最多 120 字符，仅支持 {n}、{total}、{page}。");
  return template.replace(/\{(n|total|page)\}/g, (_, key) => String(({ n, total, page } as Record<string, number>)[key]));
}
async function loadNumberFont(signal: AbortSignal) { const response = await fetch("/fonts/noto-sans-sc/regular.otf", { signal }); if (!response.ok) throw new Error("项目内中文字体加载失败，请刷新后重试。"); const bytes = new Uint8Array(await response.arrayBuffer()); if (!bytes.length || bytes.length > 32 * 1048576) throw new Error("字体资源大小异常。"); return bytes; }
export async function numberPdfPages(file: File, options: PdfNumberOptions, signal: AbortSignal, report: (n: number, text: string) => void = () => {}, fontSource: (signal: AbortSignal) => Promise<Uint8Array> = loadNumberFont) {
  if (!Number.isSafeInteger(options.start) || options.start < 1 || options.start > 1_000_000_000 || !Number.isFinite(options.size) || options.size < 6 || options.size > 48 || !Number.isFinite(options.margin) || options.margin < 2 || options.margin > 50 || !Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 100 || !/^(top|bottom)-(left|center|right)$/.test(options.position)) throw new Error("页码起始编号、字号、边距、不透明度或位置无效。");
  const color = designColor(options.color), pdf = await load(file, signal), pages = selection(options.range, pdf.getPageCount()), labels = pages.map((page, index) => numberLabel(options.template, options.start + index, pages.length, page + 1));
  let font;
  if (labels.every((label) => /^[\x20-\x7e]+$/.test(label))) font = await pdf.embedFont(StandardFonts.Helvetica);
  else { report(5, "正在加载项目内中文字体…"); const [kit, data] = await Promise.all([import("@pdf-lib/fontkit"), fontSource(signal)]); signal.throwIfAborted(); pdf.registerFontkit(kit.default); font = await pdf.embedFont(data, { subset: true }); }
  const supported = new Set(font.getCharacterSet());
  for (let i = 0; i < pages.length; i++) {
    signal.throwIfAborted(); const page = pdf.getPage(pages[i]), g = pageGeometry(page), text = labels[i];
    if ([...text].some((char) => !supported.has(char.codePointAt(0)!))) throw new Error("页码中有当前字体不支持的字符，请移除 Emoji 或罕见字后重试。");
    const width = font.widthOfTextAtSize(text, options.size), height = font.heightAtSize(options.size), ascent = font.heightAtSize(options.size, { descender: false }), margin = options.margin * 72 / 25.4;
    if (width + margin * 2 > g.displayWidth || height + margin * 2 > g.displayHeight) throw new Error(`第 ${pages[i] + 1} 页放不下页码，请减小字号或边距。`);
    const u = options.position.endsWith("left") ? margin : options.position.endsWith("right") ? g.displayWidth - margin - width : (g.displayWidth - width) / 2;
    const v = options.position.startsWith("top") ? margin + ascent : g.displayHeight - margin - (height - ascent), point = visiblePdfPoint(g, u, v);
    page.drawText(text, { ...point, font, size: options.size, rotate: degrees(g.rotation), opacity: options.opacity / 100, color: rgb(...[1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255) as [number, number, number]) });
    report(10 + i / pages.length * 85, `正在添加第 ${pages[i] + 1} 页页码`);
  }
  return { blob: await save(pdf, signal), changedPages: pages.length };
}
