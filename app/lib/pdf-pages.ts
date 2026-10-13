import { PDFDocument, degrees } from "pdf-lib";
export type PdfPageChoice = { source: number; page: number; rotation: number };
export async function inspectPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getPageCount() > 300) throw new Error("最多支持 300 页 PDF。");
  return doc.getPages().map((page) => ({
    width: page.getWidth(),
    height: page.getHeight(),
    rotation: page.getRotation().angle,
  }));
}
export function parsePageSelection(text: string, total: number) {
  if (!text.trim()) throw new Error("请输入页码，例如 1-3,5。");
  const pages: number[] = [];
  for (const group of text.split(/[,，\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(group);
    if (!match) throw new Error(`页码格式无效：${group}`);
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > total || end - start > 300)
      throw new Error("页码超出范围。");
    for (let page = start; page <= end; page++) {
      if (pages.includes(page - 1)) throw new Error("页码不能重复。");
      pages.push(page - 1);
    }
  }
  return pages;
}
export async function buildPdf(
  sources: Uint8Array[],
  choices: PdfPageChoice[],
) {
  if (!choices.length || choices.length > 300)
    throw new Error("输出须包含 1–300 页。");
  const loaded = await Promise.all(
      sources.map((bytes) =>
        PDFDocument.load(bytes, { updateMetadata: false }),
      ),
    ),
    output = await PDFDocument.create();
  for (const choice of choices) {
    const doc = loaded[choice.source];
    if (
      !doc ||
      !Number.isInteger(choice.page) ||
      choice.page < 0 ||
      choice.page >= doc.getPageCount() ||
      !Number.isInteger(choice.rotation) ||
      choice.rotation % 90
    )
      throw new Error("页面或旋转设置无效。");
    const [page] = await output.copyPages(doc, [choice.page]);
    page.setRotation(
      degrees((page.getRotation().angle + choice.rotation) % 360),
    );
    output.addPage(page);
  }
  return output.save();
}
