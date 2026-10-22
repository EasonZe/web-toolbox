import { toolLimits } from "./resource-limits";

export type PdfPageChoice = { source: number; page: number; rotation: number };

export function parsePageSelection(text: string, total: number) {
  if (!text.trim()) throw new Error("请输入页码，例如 1-3,5。");
  const pages: number[] = [], used = new Set<number>();
  for (const group of text.split(/[,，\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(group);
    if (!match) throw new Error(`页码格式无效：${group}`);
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > total)
      throw new Error("页码超出范围。");
    if (pages.length + end - start + 1 > toolLimits.pdf.outputPages)
      throw new Error(`输出须包含 1–${toolLimits.pdf.outputPages} 页。`);
    for (let page = start; page <= end; page++) {
      if (used.has(page - 1)) throw new Error("页码不能重复。");
      used.add(page - 1);
      pages.push(page - 1);
    }
  }
  return pages;
}
