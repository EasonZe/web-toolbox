"use client";
/* eslint-disable @next/next/no-img-element -- Locally generated PDF thumbnail. */
import { useState } from "react";
import { defaultPdfExportOptions, type PdfExportOptions } from "../lib/pdf-export-options";
import type { PdfExportResult } from "../lib/pdf-export";
import { validateDocumentFile } from "../lib/document-conversion";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function PdfExport() {
  const [file, setFile] = useState<File | null>(null), [options, setOptions] = useState(defaultPdfExportOptions);
  const task = useLocalTask<PdfExportResult>(), preview = useBlobUrl(task.result?.preview);
  function change(next: Partial<PdfExportOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="PDF 转图片与文字" description="按页码范围导出 PNG / JPEG，或提取 PDF 内的文字；全部在本地完成。">
    <LocalUpload accept="application/pdf,.pdf" title="选择 PDF 文档" hint="最多 200 MB / 1000 页 · 不上传文件" onFiles={(files) => {
      task.reset(); setFile(null);
      try { if (files.length !== 1) throw new Error("请选择一个 PDF 文件。"); validateDocumentFile(files[0], "pdf-to-word"); setFile(files[0]); }
      catch (cause) { task.setError((cause as Error).message); }
    }} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>导出设置</h2>{file && <p className="utility-muted">{file.name}</p>}
      <label>导出内容<select value={options.mode} onChange={(e) => change({ mode: e.target.value as PdfExportOptions["mode"] })}><option value="images">页面图片</option><option value="text">提取文字</option></select></label>
      <label>页码范围<input placeholder="留空导出全部，例如 1-3,5" value={options.range} maxLength={10000} onChange={(e) => change({ range: e.target.value })} /></label>
      {options.mode === "images" ? <><label>图片格式<select value={options.format} onChange={(e) => change({ format: e.target.value as PdfExportOptions["format"] })}><option value="png">PNG · 无损</option><option value="jpeg">JPEG · 较小体积</option></select></label>
        <label>清晰度<select value={options.dpi} onChange={(e) => change({ dpi: Number(e.target.value) })}>{[72, 144, 216, 300].map((dpi) => <option key={dpi} value={dpi}>{dpi} DPI</option>)}</select></label>
        {options.format === "jpeg" && <label className="utility-range-control"><span>JPEG 质量<output>{Math.round(options.quality * 100)}%</output></span><input type="range" min="50" max="100" value={Math.round(options.quality * 100)} onChange={(e) => change({ quality: Number(e.target.value) / 100 })} /></label>}
      </> : <p className="utility-muted">按页面基础行序整理，不执行 OCR。扫描件或图片 PDF 可能没有文字；复杂表格、多栏和竖排可能需要人工调整。可将页面导出图片后使用图片 OCR。</p>}
      <button type="button" className="primary-button" disabled={!file || task.busy} onClick={() => file && void task.run(async (signal, report) => (await import("../lib/pdf-export")).exportPdf(file, options, signal, report))}>开始导出</button><TaskFeedback task={task} />
      <p className="utility-muted">可按输入的页码顺序导出，不能重复。单页直接下载图片，多页打包 ZIP；不导出交互表单、批注层或嵌入附件。超出画布或输出预算会提示缩小范围，不自动降清晰度。</p>
    </section><section className="utility-panel"><h2>导出结果</h2>{task.result ? <>
      <p className="utility-muted">共 {task.result.pages} 页{task.result.emptyPages.length > 0 && ` · ${task.result.emptyPages.length} 页没有可提取文字`}</p>
      {task.result.text !== undefined ? <TextUtilityResult text={task.result.text} name="pdf-text.txt" /> : <><LocalDownload blob={task.result.blob} name={`pdf-pages.${task.result.extension}`} title="下载导出结果" />{preview && <img className="pdf-export-preview" src={preview} alt="第一张导出页面缩略图" />}</>}
      {!!task.result.emptyPages.length && <p className="utility-muted">未检测到文字的页码：{task.result.emptyPages.slice(0, 100).join("、")}{task.result.emptyPages.length > 100 && "……"}。这些页面仍保留在导出的 TXT 中。</p>}
    </> : <p className="utility-muted">导入 PDF 后选择导出方式。</p>}</section></div>
  </UtilityShell>;
}
