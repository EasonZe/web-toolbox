"use client";
/* eslint-disable @next/next/no-img-element -- Revocable local PDF raster preview. */
import { useEffect, useRef, useState } from "react";
import type { PdfMargins } from "../lib/pdf-page-options";
import { createPdfPreviewSession } from "../lib/pdf-preview-session";
import { useBlobUrl } from "./local-workbench";
export function PdfLocalPreview({ file, page, margins }: { file?: Blob; page: number; margins?: PdfMargins }) {
  const [result, setResult] = useState<{ file: Blob; page: number; blob: Blob; width: number; height: number } | null>(null);
  const [failure, setFailure] = useState<{ file: Blob; page: number; error: string } | null>(null);
  const session = useRef<ReturnType<typeof createPdfPreviewSession> | null>(null);
  const current = result?.file === file ? result : null, url = useBlobUrl(current?.blob);
  const error = failure?.file === file && failure?.page === page ? failure.error : "", pending = !!file && current?.page !== page && !error;
  // Parsing belongs to the input; changing pages only replaces the render owner.
  useEffect(() => {
    if (!file) return;
    const owner = createPdfPreviewSession(file); session.current = owner;
    return () => { if (session.current === owner) session.current = null; void owner.dispose(); };
  }, [file]);
  useEffect(() => {
    const controller = new AbortController(), owner = session.current;
    if (file && owner) void owner.render(page, controller.signal).then((image) => { controller.signal.throwIfAborted(); setResult({ file, page, ...image }); setFailure(null); }).catch((cause) => { if (!controller.signal.aborted) setFailure({ file, page, error: cause instanceof Error ? cause.message : "PDF 预览失败。" }); });
    return () => controller.abort();
  }, [file, page]);
  return <div aria-busy={pending}>{url && current ? <div className="pdf-box-preview" style={{ width: Math.min(600, 600 * current.width / current.height) }}><img src={url} alt={`第 ${current.page} 页预览`} />{margins && current.page === page && !error && <div className="pdf-crop-guide" style={{ top: `${margins.top}%`, right: `${margins.right}%`, bottom: `${margins.bottom}%`, left: `${margins.left}%` }} aria-hidden="true" />}</div> : !error && <p className="utility-muted">{file ? "正在生成单页预览…" : "导入 PDF 后预览页面"}</p>}{pending && current && <p className="utility-muted" role="status">正在生成第 {page} 页预览，当前暂显示第 {current.page} 页。</p>}{error && <p className="utility-error" role="alert">{error}</p>}</div>;
}
