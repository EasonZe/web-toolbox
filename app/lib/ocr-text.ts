import { toolLimits } from "./resource-limits";
export type OcrLine = { text: string; score: number; poly: [number, number][] };
export type OcrResult = { text: string; confidence: number; engine?: string; lines?: OcrLine[] };

/** Optional editorial cleanup. Keep raw OCR separate; never cross line breaks. */
export function tidyChineseOcrSpacing(text: string) {
  return text.replace(/(?<=[\p{Script=Han}，。！？；：、（）《》【】]) (?=[\p{Script=Han}，。！？；：、（）《》【】])/gu, "");
}
export function paddleOcrResult(items: OcrLine[]): OcrResult {
  if (!Array.isArray(items) || items.length > toolLimits.ocr.lines) throw new Error("检测到的文字行过多，请裁剪识别范围后重试。");
  for (const item of items) {
    if (typeof item.text !== "string" || !Number.isFinite(item.score) || item.score < 0 || item.score > 1 || !Array.isArray(item.poly) || item.poly.length !== 4 || item.poly.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new Error("识别引擎返回的文字行无效。");
  }
  const text = items.map((item) => item.text).join("\n");
  if (text.length > toolLimits.text.editorChars) throw new Error("识别文字超过编辑预算，请缩小范围。");
  return { text, confidence: items.length ? items.reduce((sum, item) => sum + item.score, 0) / items.length * 100 : 0, engine: "PaddleOCR · PP-OCRv5", lines: items };
}
