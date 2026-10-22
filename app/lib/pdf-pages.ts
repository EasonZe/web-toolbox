import { toolLimits } from "./resource-limits";
import { PDFDocument, degrees } from "pdf-lib";
import type { PdfPageChoice } from "./pdf-selection";
export { parsePageSelection, type PdfPageChoice } from "./pdf-selection";
export async function inspectPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getPageCount() > toolLimits.pdf.sourcePages) throw new Error("最多支持 1000 页 PDF。");
  return doc.getPages().map((page) => ({
    width: page.getWidth(),
    height: page.getHeight(),
    rotation: page.getRotation().angle,
  }));
}
async function loadSelectedSources(sources: Uint8Array[], choices: PdfPageChoice[]) {
  if (!choices.length || choices.length > toolLimits.pdf.outputPages)
    throw new Error(`输出须包含 1–${toolLimits.pdf.outputPages} 页。`);
  for (const choice of choices) {
    if (!Number.isInteger(choice.source) || choice.source < 0 || choice.source >= sources.length ||
        !Number.isInteger(choice.page) || choice.page < 0 ||
        !Number.isInteger(choice.rotation) || choice.rotation % 90)
      throw new Error("页面或旋转设置无效。");
  }
  // Parse only referenced documents, once per operation (including split).
  const loaded = new Map(await Promise.all([...new Set(choices.map((choice) => choice.source))].map(async (index) =>
    [index, await PDFDocument.load(sources[index], { updateMetadata: false })] as const,
  )));
  if (choices.some((choice) => choice.page >= loaded.get(choice.source)!.getPageCount()))
    throw new Error("页面或旋转设置无效。");
  return loaded;
}

async function savePages(loaded: Map<number, PDFDocument>, choices: PdfPageChoice[]) {
  const output = await PDFDocument.create();
  for (const choice of choices) {
    const doc = loaded.get(choice.source)!;
    const [page] = await output.copyPages(doc, [choice.page]);
    page.setRotation(
      degrees((page.getRotation().angle + choice.rotation) % 360),
    );
    output.addPage(page);
  }
  return output.save();
}

export async function buildPdf(sources: Uint8Array[], choices: PdfPageChoice[]) {
  return savePages(await loadSelectedSources(sources, choices), choices);
}

export async function splitPdf(sources: Uint8Array[], choices: PdfPageChoice[]) {
  const loaded = await loadSelectedSources(sources, choices), entries = [];
  for (let i = 0; i < choices.length; i++) entries.push({
    name: `page-${String(i + 1).padStart(3, "0")}.pdf`,
    data: await savePages(loaded, [choices[i]]),
  });
  return entries;
}
