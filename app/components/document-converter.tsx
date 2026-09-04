"use client";

/* eslint-disable @next/next/no-img-element -- Preview is a local, revocable Blob URL, not a server image. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiDownload, FiFileText, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { defaultDocumentSettings, documentOutputName, validateDocumentFile } from "../lib/document-conversion";
import type { DocumentSettings } from "../lib/document-conversion";

type Result = { url: string; preview: string; name: string; size: number; pages: number; warnings: string[] };
const sizeLabel = (bytes: number) => bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;

export default function DocumentConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<DocumentSettings>({ ...defaultDocumentSettings });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toPdf = settings.direction === "word-to-pdf";

  useEffect(() => () => {
    job.current?.abort(); job.current = null;
    clearTimeout(timer.current);
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function clearResult() {
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = [];
    setResult(null); setProgress(0); setError(""); setMessage("");
  }

  function changeSettings(next: Partial<DocumentSettings>) {
    if (job.current) return;
    if (next.direction && next.direction !== settings.direction) setFile(null);
    setSettings((previous) => ({ ...previous, ...next }));
    clearResult();
  }

  function selectFile(selected: File) {
    if (job.current) return;
    clearResult(); setFile(null);
    try { validateDocumentFile(selected, settings.direction); setFile(selected); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "文件读取失败。"); }
  }

  function cancel(timedOut = false) {
    job.current?.abort(); job.current = null;
    clearTimeout(timer.current); setBusy(false); setProgress(0);
    setMessage(timedOut ? "" : "已取消转换，可以调整设置后重试。");
    setError(timedOut ? "转换长时间没有进展，已停止。请缩小文件或减少页数后重试。" : "");
  }

  function resetTimeout() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => cancel(true), 180000);
  }

  async function startConversion() {
    if (!file || job.current) return;
    const controller = new AbortController(); job.current = controller;
    clearResult(); setBusy(true); setMessage("正在准备转换…"); resetTimeout();
    try {
      const { convertDocument } = await import("../lib/document-engine");
      controller.signal.throwIfAborted();
      const output = await convertDocument(file, settings, controller.signal, (percent, label) => {
        if (job.current !== controller) return;
        setProgress(percent); setMessage(label); resetTimeout();
      });
      if (job.current !== controller) return;
      const url = URL.createObjectURL(output.blob), preview = URL.createObjectURL(output.preview);
      urls.current = [url, preview];
      setResult({ url, preview, name: documentOutputName(file.name, settings.direction), size: output.blob.size, pages: output.pages, warnings: output.warnings });
      setProgress(100); setMessage("转换完成，可以下载文件。");
    } catch (cause) {
      if (job.current === controller) {
        setMessage("");
        const detail = cause instanceof Error ? cause.message : "请检查文件是否损坏后重试。";
        setError(`转换失败：${detail}`);
      }
    } finally {
      if (job.current === controller) { job.current = null; setBusy(false); clearTimeout(timer.current); }
    }
  }

  return <main className="tool-shell document-shell">
    <Link className="back-link" href="/">← 多功能工具箱</Link>
    <header className="tool-header document-header">
      <h1>Word与PDF互转工具</h1>
      <p>Word文档转PDF，或将PDF转换为可编辑文字、保留版式的Word文档。</p>
    </header>
    <section className="converter-card document-card" aria-label="Word与PDF互转">
      <fieldset className="document-direction" disabled={busy}>
        <legend>转换方向</legend>
        <div className="document-options">
          <button type="button" aria-pressed={toPdf} onClick={() => changeSettings({ direction: "word-to-pdf" })}>Word → PDF</button>
          <button type="button" aria-pressed={!toPdf} onClick={() => changeSettings({ direction: "pdf-to-word" })}>PDF → Word</button>
        </div>
      </fieldset>
      <FileDropZone className="video-file-picker" accept={toPdf ? ".docx" : ".pdf"} ariaLabel="选择或拖入文档" disabled={busy} onFile={selectFile}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{file ? "重新选择文件" : toPdf ? "选择Word文档" : "选择PDF文档"}</strong>
        <span>点击选择或拖入文件 · {toPdf ? "DOCX（不支持旧版DOC）" : "PDF"} · 最大20 MB</span>
      </FileDropZone>
      {file && <div className="document-source"><FiFileText aria-hidden="true" /><span title={file.name}>{file.name}</span><small>{sizeLabel(file.size)}</small><button type="button" disabled={busy} onClick={() => { setFile(null); clearResult(); }}>移除</button></div>}
      <div className="document-workbench">
        <section className="document-panel document-preview" aria-label="文档预览">
          <h2>{result && !toPdf ? "原PDF首页参考" : "转换预览"}</h2>
          {result ? <>
            <div className="document-sheet"><img src={result.preview} alt={toPdf ? "转换后PDF的第一页" : "原PDF第一页，仅供参考"} /></div>
            <p className="document-hint">{toPdf ? `输出共${result.pages}页` : `已处理原PDF的${result.pages}页，Word分页可能变化`} · {sizeLabel(result.size)}</p>
            {!toPdf && <p className="document-hint">此图为原PDF首页，转换后的Word文档请下载检查。</p>}
            <a className="gif-download-button document-download" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载{toPdf ? "PDF" : "Word"}</a>
          </> : <div className="file-tool-empty document-empty"><FiFileText aria-hidden="true" /><strong>等待转换</strong><span>选择文件并开始转换，完成后可预览和下载</span></div>}
        </section>
        <section className="document-panel document-settings" aria-label="转换设置">
          <h2>转换设置</h2>
          {toPdf ? <>
            <fieldset disabled={busy}><legend>纸张大小</legend><div className="document-options">{(["A4", "LETTER"] as const).map((paper) => <button type="button" key={paper} aria-pressed={settings.paper === paper} onClick={() => changeSettings({ paper })}>{paper === "A4" ? "A4" : "Letter"}</button>)}</div></fieldset>
            <fieldset disabled={busy}><legend>页面方向</legend><div className="document-options"><button type="button" aria-pressed={!settings.landscape} onClick={() => changeSettings({ landscape: false })}>纵向</button><button type="button" aria-pressed={settings.landscape} onClick={() => changeSettings({ landscape: true })}>横向</button></div></fieldset>
            <p className="document-note">适合正文、标题、列表、表格及PNG/JPG图片。使用统一中文字体重新排版；页眉页脚、原字体、复杂版式和原分页可能无法保留。</p>
          </> : <>
            <fieldset disabled={busy}><legend>转换模式</legend><div className="document-modes">
              <button type="button" aria-pressed={settings.mode === "text"} onClick={() => changeSettings({ mode: "text" })}><strong>可编辑文字</strong><span>提取文字，可修改内容 · 最多100页</span></button>
              <button type="button" aria-pressed={settings.mode === "layout"} onClick={() => changeSettings({ mode: "layout" })}><strong>保留版式</strong><span>每页转成图片，文字不可编辑 · 最多30页</span></button>
            </div></fieldset>
            <p className="document-note">{settings.mode === "text" ? "仅提取已有文字，不保留图片、表格结构和多栏排版。扫描件不支持OCR识别，请选择“保留版式”。" : "适合扫描件或复杂版式。以整页图片放入Word，文件可能较大，文字不可直接编辑。"}</p>
          </>}
          <button className="convert-button" type="button" disabled={!file || busy} onClick={startConversion}>{busy ? `正在转换 ${progress}%` : "开始转换"}</button>
          {busy && <><progress className="document-progress" aria-label="文档转换进度" value={progress} max={100} /><button className="document-cancel" type="button" onClick={() => cancel()}>取消转换</button></>}
          <p className="document-status" role="status">{message}</p>
          {error && <p className="document-error" role="alert">{error}</p>}
          {result?.warnings.map((warning) => <p className="document-note" key={warning}>{warning}</p>)}
        </section>
      </div>
    </section>
  </main>;
}
