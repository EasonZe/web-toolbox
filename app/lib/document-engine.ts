import type { DocumentSettings } from "./document-conversion";
import { validateDocumentFile } from "./document-conversion";

export type ConversionProgress = (percent: number, message: string) => void;
export type DocumentResult = { blob: Blob; preview: Blob; pages: number; warnings: string[] };

export async function convertDocument(file: File, settings: DocumentSettings, signal: AbortSignal, progress: ConversionProgress): Promise<DocumentResult> {
  validateDocumentFile(file, settings.direction);
  signal.throwIfAborted();
  if (settings.direction === "word-to-pdf") {
    const { wordToPdf } = await import("./document-word-to-pdf");
    signal.throwIfAborted();
    return wordToPdf(file, settings, signal, progress);
  }
  const { pdfToWord } = await import("./document-pdf-to-word");
  signal.throwIfAborted();
  return pdfToWord(file, settings, signal, progress);
}

// Check declared expansion before handing an untrusted ZIP to the DOCX reader.
export function checkDocxArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw new Error("不是有效的DOCX文件，请重新选择。");
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("DOCX文件不完整或已损坏。");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), expanded = 0;
  if (count > 3000 || count === 0) throw new Error("文档内部文件数量过多或文档无效。");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("DOCX文件结构异常。");
    expanded += view.getUint32(offset + 24, true);
    if (expanded > 80 * 1024 * 1024) throw new Error("文档解压后超过80 MB，请缩小内嵌图片后再试。");
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}
