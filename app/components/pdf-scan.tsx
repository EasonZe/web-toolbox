"use client";
/* eslint-disable @next/next/no-img-element -- Local generated page thumbnail. */
import { useState } from "react";
import { defaultPdfScanOptions, type PdfScanOptions } from "../lib/pdf-scan-options";
import type { PdfScanResult } from "../lib/pdf-scan";
import { validateDocumentFile } from "../lib/document-conversion";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function PdfScan() {
  const [file, setFile] = useState<File | null>(null), [options, setOptions] = useState(defaultPdfScanOptions), [uploadKey, setUploadKey] = useState(0);
  const task = useLocalTask<PdfScanResult>(), preview = useBlobUrl(task.result?.preview);
  function change(next: Partial<PdfScanOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="PDF 转扫描件" description="把选定 PDF 页面渲染为图片型 PDF，可选原彩、灰度或黑白效果。">
    <LocalUpload key={uploadKey} accept=".pdf,application/pdf" title="选择 PDF 文档" hint="最多 200 MB / 1000 页，本地逐页处理，不上传文件。" onFiles={(files) => {
      task.reset(); setFile(null); try { if (files.length !== 1) throw new Error("请选择一个 PDF 文件。"); validateDocumentFile(files[0], "pdf-to-word"); setFile(files[0]); } catch (cause) { task.setError(cause instanceof Error ? cause.message : "文件无效。"); }
    }} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>扫描效果</h2>{file && <p className="utility-muted">{file.name}</p>}
      <label>页码范围<input value={options.range} maxLength={10000} placeholder="留空全部，例如 1-3,5" onChange={(e) => change({ range: e.target.value })} /></label>
      <label>页面效果<select value={options.mode} onChange={(e) => change({ mode: e.target.value as PdfScanOptions["mode"] })}><option value="color">原彩</option><option value="grayscale">灰度</option><option value="threshold">黑白阈值</option></select></label>
      {options.mode === "threshold" && <label className="utility-range-control"><span>黑白阈值<output>{options.threshold}</output></span><input type="range" min={0} max={255} value={options.threshold} onChange={(e) => change({ threshold: Number(e.target.value) })} /></label>}
      <div className="compact-options"><label>清晰度<select value={options.dpi} onChange={(e) => change({ dpi: Number(e.target.value) })}>{[72, 144, 216, 300].map((dpi) => <option key={dpi} value={dpi}>{dpi} DPI</option>)}</select></label><label>内嵌图片<select value={options.format} onChange={(e) => change({ format: e.target.value as PdfScanOptions["format"] })}><option value="jpeg">JPEG · 较小体积</option><option value="png">PNG · 无损</option></select></label></div>
      {options.format === "jpeg" && <label className="utility-range-control"><span>JPEG 质量<output>{Math.round(options.quality * 100)}%</output></span><input type="range" min={50} max={100} value={Math.round(options.quality * 100)} onChange={(e) => change({ quality: Number(e.target.value) / 100 })} /></label>}
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!file || task.busy} onClick={() => { if (file) void task.run(async (signal, report) => (await import("../lib/pdf-scan")).createScannedPdf(file, options, signal, report)); }}>生成图片型 PDF</button><button type="button" onClick={() => { task.reset(); setFile(null); setUploadKey((value) => value + 1); }}>清空</button></div><TaskFeedback task={task} />
      <p className="utility-muted">保留所选页的可见尺寸和顺序，不加纸张噪点；输出不含原文本层、交互表单、链接、批注层或附件。JPEG 有损，黑白效果要保留纯黑白像素可选 PNG。</p>
      <p className="utility-muted">这只是页面栅格化，不是安全脱敏、防复制或真实性证明；仍可被 OCR 识别。原签名不会保留，请核对转换结果并保留原文件。超出画布或输出预算会报错，不自动降低清晰度。</p>
    </section><section className="utility-panel"><h2>生成结果</h2>{task.result ? <><p className="utility-muted" role="status">已生成 {task.result.pages} 页图片型 PDF · 来源页码 {task.result.sourcePages.slice(0, 50).join("、")}{task.result.sourcePages.length > 50 && "……"}</p><LocalDownload blob={task.result.blob} name="scanned-document.pdf" title="下载图片型 PDF" />{preview && <img className="pdf-export-preview" src={preview} alt="图片型 PDF 首个输出页预览" />}</> : <p className="utility-muted">生成后预览首个输出页，下载包含全部所选页。</p>}</section></div>
  </UtilityShell>;
}
