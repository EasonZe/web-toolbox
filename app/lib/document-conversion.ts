export type DocumentDirection = "word-to-pdf" | "pdf-to-word";
export type PdfWordMode = "text" | "layout";
export type DocumentSettings = { direction: DocumentDirection; mode: PdfWordMode; paper: "A4" | "LETTER"; landscape: boolean };
export const defaultDocumentSettings: DocumentSettings = { direction: "word-to-pdf", mode: "text", paper: "A4", landscape: false };
export const maxDocumentBytes = 20 * 1024 * 1024;
export const maxPdfPages = 100;

export function validateDocumentFile(file: File, direction: DocumentDirection) {
  if (!file.size) throw new Error("文件为空，请重新选择。");
  if (file.size > maxDocumentBytes) throw new Error("文件不能超过20 MB。");
  if (/\.doc$/i.test(file.name)) throw new Error("暂不支持旧版.doc文件，请用Word另存为.docx后再转换。");
  const extension = direction === "word-to-pdf" ? "docx" : "pdf";
  if (!file.name.toLowerCase().endsWith(`.${extension}`)) throw new Error(`请选择.${extension}文件。`);
}

export function documentOutputName(name: string, direction: DocumentDirection) {
  return `${name.replace(/\.[^.]+$/, "") || "document"}.${direction === "word-to-pdf" ? "pdf" : "docx"}`;
}

export type PositionedText = { text: string; x: number; y: number; width: number; height: number };
export function groupPdfText(items: PositionedText[]) {
  const sorted = items.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PositionedText[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, Math.min(row[0].height, item.height) * 0.3)) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "";
    row.forEach((item, index) => {
      const previous = row[index - 1];
      const separated = previous && item.x - previous.x - previous.width > Math.max(1.5, item.height * 0.15);
      text += `${separated && !text.endsWith(" ") && !item.text.startsWith(" ") ? " " : ""}${item.text}`;
    });
    return { text: text.trim(), height: Math.max(...row.map((item) => item.height)) };
  });
}
