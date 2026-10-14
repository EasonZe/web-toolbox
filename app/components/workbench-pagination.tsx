"use client";
import { toolLimits } from "../lib/resource-limits";
export function WorkbenchPagination({ total, page, onPage }: { total: number; page: number; onPage: (page: number) => void }) {
  const pages = Math.ceil(total / toolLimits.pageRows), current = Math.max(0, Math.min(page, pages - 1));
  if (pages <= 1) return null;
  return <nav className="utility-actions" aria-label="结果分页">
    <button type="button" disabled={current === 0} onClick={() => onPage(current - 1)}>上一页</button>
    <span>{current + 1} / {pages} 页 · 共 {total} 项</span>
    <button type="button" disabled={current + 1 >= pages} onClick={() => onPage(current + 1)}>下一页</button>
  </nav>;
}
