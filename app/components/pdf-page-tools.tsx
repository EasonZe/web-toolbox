"use client";
import { useState } from "react";
import { defaultPdfCropOptions, defaultPdfNumberOptions, type PdfCropOptions, type PdfNumberOptions, type PdfGeometry } from "../lib/pdf-page-options";
import { runFileWorker } from "../lib/file-worker-client";
import { DesignColorInput } from "./design-color-input";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask } from "./local-workbench";
import { PdfLocalPreview } from "./pdf-local-preview";
import { ResultContinue, ToolHandoffInput } from "./tool-handoff";
import { resultFile } from "../lib/tool-handoff";
export default function PdfPageTools({ mode }: { mode: "numbers" | "crop" }) {
  const source = useLocalTask<{ file: File; pages: PdfGeometry[] }>(), output = useLocalTask<{ blob: Blob; changedPages: number }>();
  const [numberOptions, setNumberOptions] = useState(defaultPdfNumberOptions), [cropOptions, setCropOptions] = useState(defaultPdfCropOptions), [page, setPage] = useState(1);
  function number(next: Partial<PdfNumberOptions>) { output.reset(); setNumberOptions({ ...numberOptions, ...next }); }
  function crop(next: Partial<PdfCropOptions>) { output.reset(); setCropOptions({ ...cropOptions, ...next }); }
  const options = mode === "numbers" ? numberOptions : cropOptions, current = source.result, margins = cropOptions.margins;
  const validMargins = Object.values(margins).every((v) => Number.isFinite(v) && v >= 0 && v < 100) && margins.top + margins.bottom < 100 && margins.left + margins.right < 100;
  async function loadFiles(files: File[]) {
    output.reset(); setPage(1);
    const received = await source.run(async (signal) => { if (files.length !== 1) throw new Error("请选择一个 PDF。"); const pages = await runFileWorker<PdfGeometry[]>({ action: "pdf-page-info", file: files[0] }, signal); return { file: files[0], pages }; });
    return !!received;
  }
  return <UtilityShell className="additional-utilities" title={mode === "numbers" ? "PDF 加页码" : "PDF 页面裁剪"} description={mode === "numbers" ? "按选定页序添加页码，支持位置、字号、模板与中文；原有页面顺序不变。" : "按页面视觉方向裁切四边，支持旋转页与指定范围；仅改变可见区域，不删除隐藏内容。"}>
    <ToolHandoffInput target={mode === "numbers" ? "/pdf-page-numbers" : "/pdf-cropper"} behavior="replace" onFiles={loadFiles} disabled={source.busy || output.busy} />
    <LocalUpload accept="application/pdf,.pdf" title="选择 PDF 文件" hint="本地处理 · 最多 200 MiB / 1000 页 · 不支持加密文件" onFiles={async (files) => { await loadFiles(files); }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>处理设置</h2>
      {current && <p className="utility-muted">{current.file.name} · {current.pages.length} 页</p>}
      <label>页码范围（留空处理全部）<input value={options.range} maxLength={10000} placeholder="例如 1-3,5" onChange={(e) => mode === "numbers" ? number({ range: e.target.value }) : crop({ range: e.target.value })} /></label>
      {mode === "numbers" ? <>
        <label>页码模板<input value={numberOptions.template} maxLength={120} onChange={(e) => number({ template: e.target.value })} /></label><p className="utility-muted">{"{n} 为连续编号，{total} 为选中页数，{page} 为原始页码。按输入页序编号，不重新排列页面；中文使用项目内字体，暂不支持 Emoji。"}</p>
        <div className="utility-actions">{["{n}", "{n} / {total}", "第 {n} 页，共 {total} 页"].map((template) => <button type="button" key={template} onClick={() => number({ template })}>{template}</button>)}</div>
        <label>起始编号<input type="number" min="1" max="1000000000" value={numberOptions.start} onChange={(e) => number({ start: Number(e.target.value) })} /></label>
        <label>页码位置<select value={numberOptions.position} onChange={(e) => number({ position: e.target.value as PdfNumberOptions["position"] })}>{[["top-left", "左上"], ["top-center", "顶部居中"], ["top-right", "右上"], ["bottom-left", "左下"], ["bottom-center", "底部居中"], ["bottom-right", "右下"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>字号（pt）<input type="number" min="6" max="48" value={numberOptions.size} onChange={(e) => number({ size: Number(e.target.value) })} /></label><label>距边缘（mm）<input type="number" min="2" max="50" value={numberOptions.margin} onChange={(e) => number({ margin: Number(e.target.value) })} /></label><DesignColorInput label="页码颜色" value={numberOptions.color} onChange={(color) => number({ color })} />
        <label className="utility-range-control"><span>不透明度<output>{numberOptions.opacity}%</output></span><input type="range" min="0" max="100" value={numberOptions.opacity} onChange={(e) => number({ opacity: Number(e.target.value) })} /></label>
        <p className="utility-muted">页码叠加在原内容上，不自动腾出空白；放不下时会明确报错。0% 为不可见页码。签名可能失效，请保留原文件。</p>
      </> : <>
        {([["top", "顶部裁去"], ["right", "右侧裁去"], ["bottom", "底部裁去"], ["left", "左侧裁去"]] as const).map(([key, label]) => <label key={key}>{label}（%）<input type="number" min="0" max="99" step="0.1" value={margins[key]} onChange={(e) => crop({ margins: { ...margins, [key]: Number(e.target.value) } })} /></label>)}
        <div className="utility-actions"><button type="button" onClick={() => crop({ margins: { top: 5, right: 5, bottom: 5, left: 5 } })}>四边 5%</button><button type="button" onClick={() => crop({ margins: { top: 0, right: 0, bottom: 0, left: 0 } })}>不再裁切</button></div>
        {!validMargins && <p className="utility-error" role="alert">上下、左右裁切之和分别须小于 100%。</p>}
        <p className="utility-muted">比例按当前可见页面及旋转后的方向计算。未选中的页面不变，原 MediaBox 与隐藏内容仍在，后续可恢复；不能用于删除敏感信息。重复裁切会基于上一次的可见范围。</p>
      </>}
      <button className="primary-button" type="button" disabled={!current || output.busy || mode === "crop" && !validMargins} onClick={() => current && void output.run((signal, report) => mode === "numbers" ? runFileWorker({ action: "pdf-number", file: current.file, options: numberOptions }, signal, report) : runFileWorker({ action: "pdf-crop", file: current.file, options: cropOptions }, signal, report))}>{mode === "numbers" ? "添加页码并导出" : "裁剪并导出"}</button><TaskFeedback task={output} />
      {output.result && <><p className="utility-muted">已处理 {output.result.changedPages} 页，保留全部页面。</p><LocalDownload blob={output.result.blob} name={mode === "numbers" ? "numbered.pdf" : "cropped.pdf"} title="下载处理后的 PDF" /><ResultContinue source={mode === "numbers" ? "PDF 加页码" : "PDF 页面裁剪"} targets={[mode === "numbers" ? "/pdf-cropper" : "/pdf-page-numbers"]} getFiles={() => output.result ? [resultFile(output.result.blob, mode === "numbers" ? "numbered.pdf" : "cropped.pdf", "application/pdf")] : []} /></>}
    </section><section className="utility-panel utility-controls"><h2>{output.result ? "输出文件预览" : "原文件预览"}</h2><label>预览原始页码<input type="number" min="1" max={current?.pages.length ?? 1} value={page} onChange={(e) => setPage(Math.max(1, Math.min(current?.pages.length ?? 1, Number(e.target.value) || 1)))} /></label>
      <PdfLocalPreview file={output.result?.blob ?? current?.file} page={page} margins={mode === "crop" && !output.result && validMargins ? margins : undefined} />
      <p className="utility-muted">仅预览一页，不一次渲染整份 PDF。{mode === "crop" && !output.result ? "框内为保留区域；导出后预览实际裁切结果。" : "请检查输出位置后下载。"}</p>
    </section></div>
  </UtilityShell>;
}
