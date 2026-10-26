"use client";
/* eslint-disable @next/next/no-img-element -- Revocable local PDF raster preview. */
import { useEffect, useState } from "react";
import type { PdfMargins } from "../lib/pdf-page-options";
import { useBlobUrl } from "./local-workbench";
export function PdfLocalPreview({ file, page, margins }: { file?: Blob; page: number; margins?: PdfMargins }) {
  const [result, setResult] = useState<{ file: Blob; page: number; blob?: Blob; width?: number; height?: number; error?: string } | null>(null);
  const current = result?.file === file && result?.page === page ? result : null, url = useBlobUrl(current?.blob);
  useEffect(() => {
    const controller = new AbortController();
    if (file) void (async () => { const { loadPdf, renderPdfPage } = await import("../lib/document-pdf"); const pdf = await loadPdf(file, controller.signal); try { const image = await renderPdfPage(pdf, page, controller.signal, 1); controller.signal.throwIfAborted(); setResult({ file, page, ...image }); } finally { await pdf.loadingTask.destroy(); } })().catch((error) => { if (!controller.signal.aborted) setResult({ file, page, error: error.message }); });
    return () => controller.abort();
  }, [file, page]);
  return <div>{url && current?.width && current.height ? <div className="pdf-box-preview" style={{ width: Math.min(600, 600 * current.width / current.height) }}><img src={url} alt={`第 ${page} 页预览`} />{margins && <div className="pdf-crop-guide" style={{ top: `${margins.top}%`, right: `${margins.right}%`, bottom: `${margins.bottom}%`, left: `${margins.left}%` }} aria-hidden="true" />}</div> : <p className="utility-muted">{current?.error || (file ? "正在生成单页预览…" : "导入 PDF 后预览页面")}</p>}</div>;
}
