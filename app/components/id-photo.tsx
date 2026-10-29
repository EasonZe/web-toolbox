"use client";
/* eslint-disable @next/next/no-img-element -- Page-owned Blob previews are cleaned up by useBlobUrl. */
import { useMemo, useState } from "react";
import { defaultIdPaper, defaultIdPhoto, idPhotoPresets, idPhotoSize, makeIdPhoto, makeIdPhotoSheet, type IdPhotoOptions, type IdPhotoPaper } from "../lib/id-photo";
import { checkFiles } from "../lib/local-files";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function IdPhoto() {
  const [file, setFile] = useState<File | null>(null), [options, setOptions] = useState(defaultIdPhoto), [paper, setPaper] = useState(defaultIdPaper), [uploadKey, setUploadKey] = useState(0);
  const matte = useLocalTask<Blob>(), single = useLocalTask<Awaited<ReturnType<typeof makeIdPhoto>>>(), sheet = useLocalTask<Awaited<ReturnType<typeof makeIdPhotoSheet>>>();
  const source = useMemo(() => matte.result ? new File([matte.result], "portrait.png", { type: "image/png" }) : file, [file, matte.result]);
  const sourceUrl = useBlobUrl(source), singleUrl = useBlobUrl(single.result?.blob ?? null), sheetUrl = useBlobUrl(sheet.result?.blob ?? null);
  function resetExports() { single.reset(); sheet.reset(); }
  function updateOptions(value: Partial<IdPhotoOptions>) { resetExports(); setOptions((old) => ({ ...old, ...value })); }
  function updatePaper(value: Partial<IdPhotoPaper>) { sheet.reset(); setPaper((old) => ({ ...old, ...value })); }
  let size = "参数待校验"; try { const pixels = idPhotoSize(options); size = `${pixels.width} × ${pixels.height} px`; } catch { /* Explicit generation reports invalid settings. */ }
  const ratio = options.widthMm / options.heightMm, aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 25 / 35;
  return <UtilityShell className="additional-utilities" title="证件照制作与排版" description="本地裁切、背景与相纸排版；可主动启用人像抠图，导出 PNG / JPEG 和打印 DPI 信息。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/bmp,image/avif" title="选择人像或透明 PNG" hint="原图不上传；每张最大 100 MB / 100 MP。已抠好的透明 PNG 可直接换底色。" onFiles={(files) => {
      matte.reset(); resetExports(); setFile(null);
      try { checkFiles(files, toolLimits.image.fileBytes, 1); setFile(files[0]); } catch (cause) { single.setError((cause as Error).message); }
    }} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>照片设置</h2>
      <label>常用规格<select value={String(idPhotoPresets.findIndex((preset) => preset.widthMm === options.widthMm && preset.heightMm === options.heightMm)).replace("-1", "custom")} onChange={(event) => { const preset = idPhotoPresets[Number(event.target.value)]; if (preset) updateOptions({ widthMm: preset.widthMm, heightMm: preset.heightMm }); }}>
        {idPhotoPresets.map((preset, index) => <option key={preset.name} value={index}>{preset.name}</option>)}<option value="custom">自定义（下方填写）</option></select></label>
      <div className="id-photo-number-grid">{([["宽度 mm", "widthMm"], ["高度 mm", "heightMm"], ["打印 DPI", "dpi"]] as const).map(([label, key]) => <label key={key}>{label}<input type="number" step={key === "dpi" ? 1 : "any"} value={options[key]} onChange={(event) => updateOptions({ [key]: Number(event.target.value) })} /></label>)}</div>
      <p className="utility-muted">{size} · mm × DPI / 25.4 后四舍五入为像素；这里只提供尺寸预设，不代表特定证件机构的审核标准。</p>
      {([["放大裁切", "zoom", 1, 4, 0.01], ["水平取景", "focusX", 0, 100, 1], ["垂直取景", "focusY", 0, 100, 1]] as const).map(([label, key, min, max, step]) => <label className="utility-range-control" key={key}><span>{label}<output>{options[key]}{key === "zoom" ? "×" : "%"}</output></span><input type="range" min={min} max={max} step={step} value={options[key]} onChange={(event) => updateOptions({ [key]: Number(event.target.value) })} /></label>)}
      <fieldset className="id-photo-backgrounds"><legend>底色</legend><div className="utility-actions">{[["白", "#ffffff"], ["蓝", "#438edb"], ["红", "#d63735"]].map(([label, value]) => <button type="button" key={value} aria-pressed={options.background === value} onClick={() => updateOptions({ background: value })}>{label}</button>)}<input type="color" aria-label="自定义证件照底色" value={options.background} onChange={(event) => updateOptions({ background: event.target.value })} /></div></fieldset>
      <p className="utility-muted">底色只填充透明区域，不会自动去掉原图背景；普通照片请先点击人像抠图，或自行准备透明 PNG。</p>
      <div className="utility-actions"><button type="button" disabled={!file || matte.busy || single.busy || sheet.busy} onClick={() => { if (!file) return; resetExports(); void matte.run(async (signal, report) => (await import("../lib/id-photo-matte-client")).removePortraitBackground(file, signal, report)); }}>启用本地人像抠图</button>
        <button type="button" disabled={!matte.result && !matte.busy} onClick={() => { matte.reset(); resetExports(); }}>还原原图</button></div>
      <TaskFeedback task={matte} />
      <p className="utility-muted">抠图按钮会按需从 Hugging Face 下载 Apache-2.0 的 MODNet 模型（首次约 26 MB）；照片仍在本地处理。抠图工作图最长边 2048px，发丝、衣领及复杂背景需人工核对；可取消，不保证边缘完全准确。</p>
      <label>导出格式<select value={options.format} onChange={(event) => updateOptions({ format: event.target.value as IdPhotoOptions["format"] })}><option value="png">PNG</option><option value="jpeg">JPEG · 高质量</option></select></label>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!source || single.busy || sheet.busy || matte.busy} onClick={() => { if (source) void single.run((signal) => makeIdPhoto(source, options, signal)); }}>生成单张证件照</button><button type="button" onClick={() => { matte.reset(); resetExports(); setFile(null); setUploadKey((old) => old + 1); }}>清空照片</button></div>
      <TaskFeedback task={single} />
    </section><section className="utility-panel utility-controls"><h2>取景预览</h2>
      {sourceUrl ? <div className="id-photo-preview" style={{ aspectRatio: String(aspect), background: options.background }}><img src={sourceUrl} alt={matte.result ? "已抠图人像取景" : "原图取景（未去除背景）"} style={{ objectPosition: `${options.focusX}% ${options.focusY}%`, transform: `scale(${options.zoom})`, transformOrigin: `${options.focusX}% ${options.focusY}%` }} /></div> : <p className="utility-muted">选择照片后调节取景，不自动识别人脸位置或改变五官。</p>}
      {single.result && <><img className="workbench-image" src={singleUrl} alt="生成的单张证件照" /><p className="utility-muted">{single.result.width} × {single.result.height}px · {single.result.dpi} DPI，已写入文件分辨率元数据。</p><LocalDownload blob={single.result.blob} name={`id-photo.${options.format === "jpeg" ? "jpg" : "png"}`} title="下载单张证件照" /></>}
    </section></div>
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>相纸排版</h2>
      <label>相纸规格<select value={paper.widthMm === 101.6 && paper.heightMm === 152.4 ? "6" : paper.widthMm === 210 && paper.heightMm === 297 ? "A4" : "custom"} onChange={(event) => { if (event.target.value === "6") updatePaper({ widthMm: 101.6, heightMm: 152.4 }); if (event.target.value === "A4") updatePaper({ widthMm: 210, heightMm: 297 }); }}><option value="6">6 寸 · 101.6×152.4 mm</option><option value="A4">A4 · 210×297 mm</option><option value="custom">自定义</option></select></label>
      <div className="id-photo-number-grid">{([["相纸宽 mm", "widthMm"], ["相纸高 mm", "heightMm"], ["间距 mm", "gapMm"], ["外边距 mm", "marginMm"], ["排版张数", "copies"]] as const).map(([label, key]) => <label key={key}>{label}<input type="number" step={key === "copies" ? 1 : "any"} value={paper[key]} onChange={(event) => updatePaper({ [key]: Number(event.target.value) })} /></label>)}</div>
      <label className="id-photo-checkbox"><input type="checkbox" checked={paper.guides} onChange={(event) => updatePaper({ guides: event.target.checked })} />空隙中显示裁切辅助线</label>
      <div className="utility-actions"><button type="button" onClick={() => updatePaper({ widthMm: paper.heightMm, heightMm: paper.widthMm })}>切换相纸方向</button><button type="button" className="primary-button" disabled={!source || sheet.busy || single.busy || matte.busy} onClick={() => { if (source) void sheet.run((signal) => makeIdPhotoSheet(source, options, paper, signal)); }}>生成相纸排版</button></div>
      <TaskFeedback task={sheet} /><p className="utility-muted">最多 200 张，放不下会提示而非截断。打印请选择 100% / 实际尺寸，并关闭打印机自动适配；DPI 元数据不能强制打印软件遵从。放大不增加原图细节，成品仍需按机构要求检查头部比例、背景、尺寸和像素。</p>
    </section><section className="utility-panel utility-controls"><h2>排版结果</h2>{sheet.result ? <><img className="workbench-image" src={sheetUrl} alt="证件照相纸排版预览" /><p className="utility-muted">{sheet.result.width} × {sheet.result.height}px · {sheet.result.dpi} DPI · {sheet.result.copies} 张（当前相纸最多 {sheet.result.capacity} 张）</p><LocalDownload blob={sheet.result.blob} name={`id-photo-sheet.${options.format === "jpeg" ? "jpg" : "png"}`} title="下载相纸排版" /></> : <p className="utility-muted">使用当前取景与底色排版，背景为白色相纸；照片像素内不画裁切线。</p>}</section></div>
  </UtilityShell>;
}
