"use client";
import { useState } from "react";
import { defaultPdfWatermark, validatePdfWatermark, type PdfWatermarkOptions } from "../lib/pdf-watermark-options";
import type { PdfGeometry } from "../lib/pdf-page-options";
import { runFileWorker } from "../lib/file-worker-client";
import { UtilityShell } from "./utility-shell";
import { LocalDownload, LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";
import { DesignColorInput } from "./design-color-input";
import { PdfLocalPreview } from "./pdf-local-preview";

export default function PdfWatermark() {
  const [options, setOptions] = useState(defaultPdfWatermark), [page, setPage] = useState(1), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<{ file: File; pages: number }>(), output = useLocalTask<{ blob: Blob; changedPages: number; stamps: number }>();
  function change(next: Partial<PdfWatermarkOptions>) { output.reset(); setOptions({ ...options, ...next }); }
  const current = source.result;
  let validation = ""; try { validatePdfWatermark(options); } catch (cause) { validation = cause instanceof Error ? cause.message : "设置无效。"; }
  return <UtilityShell className="additional-utilities pdf-watermark-tool" title="PDF 文字水印" description="为指定页面添加居中、网格或交错平铺文字水印，支持中文、旋转和不透明度，本地导出 PDF。">
    <LocalUpload key={uploadKey} accept="application/pdf,.pdf" title="选择 PDF 文件" hint="本地处理 · 最多 200 MiB / 1000 页 · 不支持加密文件" onFiles={async (files) => {
      output.reset(); setPage(1);
      await source.run(async (signal) => { if (files.length !== 1) throw new Error("请选择一个 PDF。"); const pages = await runFileWorker<PdfGeometry[]>({ action: "pdf-page-info", file: files[0] }, signal); return { file: files[0], pages: pages.length }; });
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>水印设置</h2>
      {current && <p className="utility-muted utility-code-output">{current.file.name} · {current.pages} 页</p>}
      <label>水印文字<input value={options.text} maxLength={120} onChange={(event) => change({ text: event.target.value })} /></label>
      <label>页码范围（留空处理全部）<input value={options.range} maxLength={10000} placeholder="例如 1-3,5" onChange={(event) => change({ range: event.target.value })} /></label>
      <label>排列方式<select value={options.layout} onChange={(event) => change({ layout: event.target.value as PdfWatermarkOptions["layout"] })}><option value="single">单个水印</option><option value="grid">网格水印</option><option value="staggered">交错平铺</option></select></label>
      <div className="watermark-number-fields"><label>字号（pt）<input type="number" min="8" max="120" value={options.size} onChange={(event) => change({ size: Number(event.target.value) })} /></label><label>倾斜角度（°）<input type="number" min="-90" max="90" value={options.angle} onChange={(event) => change({ angle: Number(event.target.value) })} /></label></div>
      <DesignColorInput label="水印颜色" value={options.color} onChange={(color) => change({ color })} />
      <label className="utility-range-control"><span>不透明度<output>{options.opacity}%</output></span><input type="range" min="0" max="100" value={options.opacity} onChange={(event) => change({ opacity: Number(event.target.value) })} /></label>
      {options.layout === "single" ? <><label className="utility-range-control"><span>水平位置<output>{options.x}%</output></span><input type="range" min="0" max="100" value={options.x} onChange={(event) => change({ x: Number(event.target.value) })} /></label><label className="utility-range-control"><span>垂直位置<output>{options.y}%</output></span><input type="range" min="0" max="100" value={options.y} onChange={(event) => change({ y: Number(event.target.value) })} /></label><p className="utility-muted">0% / 100% 将完整水印贴近页面边缘，50% 居中；不会有意裁掉文字。</p></> : <div className="watermark-number-fields"><label>水平间隔（mm）<input type="number" min="0" max="200" value={options.gapX} onChange={(event) => change({ gapX: Number(event.target.value) })} /></label><label>垂直间隔（mm）<input type="number" min="0" max="200" value={options.gapY} onChange={(event) => change({ gapY: Number(event.target.value) })} /></label></div>}
      <p className="utility-muted">水印叠加在原内容上，不会防止复制、编辑或移除，不能用来安全脱敏。0% 为不可见；修改可能使数字签名失效，请保留原文件。中文使用项目内字体，暂不支持 Emoji。</p>
      <p className="utility-muted">中文混排嵌入完整字体以避免缺字，输出通常增加约 7–8 MB；纯英文使用内置字体。</p>
      {validation && <p className="utility-error" role="alert">{validation}</p>}
      <div className="utility-actions"><button className="primary-button" type="button" disabled={!current || source.busy || output.busy || !!validation} onClick={() => current && output.run((signal, report) => runFileWorker({ action: "pdf-watermark", file: current.file, options }, signal, report))}>生成带水印 PDF</button><button type="button" onClick={() => { source.reset(); output.reset(); setPage(1); setUploadKey((key) => key + 1); }}>清空文件</button><button type="button" onClick={() => { output.reset(); setOptions({ ...defaultPdfWatermark }); }}>重置设置</button></div>
      <TaskFeedback task={output} />
      {output.result && <><p className="utility-muted">已处理 {output.result.changedPages} 页，添加 {output.result.stamps} 个水印；全部原始页面仍保留。</p><LocalDownload blob={output.result.blob} name={`${current?.file.name.replace(/\.pdf$/i, "") ?? "document"}-watermarked.pdf`} title="下载带水印 PDF" /></>}
    </section><section className="utility-panel utility-controls"><h2>{output.result ? "成品预览" : "原文件预览"}</h2>
      <label>预览页码<input type="number" min="1" max={current?.pages ?? 1} value={page} onChange={(event) => setPage(Math.max(1, Math.min(current?.pages ?? 1, Math.trunc(Number(event.target.value)) || 1)))} /></label>
      <PdfLocalPreview file={output.result?.blob ?? current?.file} page={page} />
      <p className="utility-muted">生成后显示真实成品，不用 CSS 模拟水印。修改设置会清除旧结果，需重新生成；只预览当前一页。</p>
    </section></div>
  </UtilityShell>;
}
