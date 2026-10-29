"use client";
/* eslint-disable @next/next/no-img-element -- Local source and exported PNG Blob previews. */
import { useState } from "react";
import { defaultRoundedImage, planRoundedImage, renderRoundedImage, type RoundedCorners, type RoundedImageOptions } from "../lib/image-rounded";
import { prepareCanvasSource, type CanvasImageSource } from "../lib/image-canvas";
import { LocalDownload, LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
const cornerNames: [keyof RoundedCorners, string][] = [["topLeft", "左上"], ["topRight", "右上"], ["bottomRight", "右下"], ["bottomLeft", "左下"]];
const accept = "image/png,image/jpeg,image/webp,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.bmp";
export default function ImageRounded() {
  const [options, setOptions] = useState<RoundedImageOptions>({ ...defaultRoundedImage, corners: { ...defaultRoundedImage.corners } }), [individual, setIndividual] = useState(false);
  const source = useLocalTask<CanvasImageSource>(), output = useLocalTask<Awaited<ReturnType<typeof renderRoundedImage>>>();
  const current = source.result, original = useBlobUrl(current?.thumbnail), result = useBlobUrl(output.result?.blob);
  function change(next: RoundedImageOptions) { output.reset(); setOptions(next); }
  function radius(value: number, key?: keyof RoundedCorners) {
    change({ ...options, corners: key ? { ...options.corners, [key]: value } : { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value } });
  }
  let planned: ReturnType<typeof planRoundedImage> | undefined, validation = "";
  if (current) { try { planned = planRoundedImage(current.width, current.height, options); } catch (cause) { validation = cause instanceof Error ? cause.message : "设置无效。"; } }
  const maximum = options.radiusUnit === "percent" ? 50 : current ? Math.min(current.width, current.height) / 2 : 4096;
  return <UtilityShell className="additional-utilities image-rounded-tool" title="图片圆角与边框" description="为静态图片设置圆角、圆形遮罩与内外边框，导出透明 PNG。">
    <LocalUpload accept={accept} title="选择图片" hint="PNG / JPG / WebP / AVIF / BMP · 最多 100 MB · 不支持动画或 SVG" onFiles={async (files) => {
      output.reset(); await source.run((signal) => prepareCanvasSource(files[0], signal));
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>圆角与边框</h2>
      <label>形状<select value={options.shape} onChange={(event) => change({ ...options, shape: event.target.value as RoundedImageOptions["shape"] })}><option value="rounded">圆角矩形</option><option value="circle">居中圆形</option></select></label>
      {options.shape === "rounded" && <>
        <label>圆角单位<select value={options.radiusUnit} onChange={(event) => {
          const unit = event.target.value as RoundedImageOptions["radiusUnit"], short = current ? Math.min(current.width, current.height) : 100;
          const corners = Object.fromEntries(Object.entries(options.corners).map(([key, value]) => [key, Math.round((unit === "percent" ? value / short * 100 : value / 100 * short) * 100) / 100])) as RoundedCorners;
          change({ ...options, radiusUnit: unit, corners });
        }}><option value="percent">短边百分比</option><option value="pixels">像素</option></select></label>
        <label className="utility-checkbox"><input type="checkbox" checked={individual} onChange={(event) => { output.reset(); setIndividual(event.target.checked); if (!event.target.checked) radius(options.corners.topLeft); }} />分别设置四角</label>
        {(individual ? cornerNames : [["topLeft", "统一圆角"] as [keyof RoundedCorners, string]]).map(([key, title]) => <label key={key}>{title}（{options.radiusUnit === "percent" ? "%" : "px"}）<input type="number" min="0" max={maximum} step="0.5" value={options.corners[key]} onChange={(event) => radius(Number(event.target.value), individual ? key : undefined)} /></label>)}
        <p className="utility-muted">圆角最大为短边的一半；百分比按原图短边计算，不会缩放原图。</p>
      </>}
      <label>边框位置<select value={options.border} onChange={(event) => change({ ...options, border: event.target.value as RoundedImageOptions["border"] })}><option value="none">无边框</option><option value="inside">内边框 · 原尺寸</option><option value="outside">外边框 · 扩展画布</option></select></label>
      {options.border !== "none" && <><label>边框宽度（px）<input type="number" min="0" max="8192" step="1" value={options.borderWidth} onChange={(event) => change({ ...options, borderWidth: Number(event.target.value) })} /></label><label>边框颜色<input type="color" value={options.borderColor} onChange={(event) => change({ ...options, borderColor: event.target.value })} /></label><p className="utility-muted">{options.border === "outside" ? "外框在原图外扩展，宽高各增加两倍边框宽度，原图不缩放。" : "内框覆盖遮罩内侧的边缘像素，画布与原图尺寸相同。"}</p></>}
      {options.shape === "circle" && <p className="utility-muted">按短边生成居中圆形遮罩；画布保持原尺寸，圆形外的内容变为透明。非正方形图片不会被暗中拉伸或裁小画布。</p>}
      {current && <dl className="workbench-details"><dt>来源尺寸</dt><dd>{current.width} × {current.height}px</dd><dt>预计成品</dt><dd>{planned ? `${planned.width} × ${planned.height}px` : "请检查设置"}</dd></dl>}
      {validation && <p className="utility-error" role="alert">{validation}</p>}
      <div className="utility-actions"><button className="primary-button" type="button" disabled={!current || source.busy || output.busy || !!validation} onClick={() => current && output.run((signal) => renderRoundedImage(current.file, options, signal))}>生成 PNG</button><button type="button" disabled={!current && !source.busy} onClick={() => { source.reset(); output.reset(); }}>清空图片</button><button type="button" onClick={() => { output.reset(); setIndividual(false); setOptions({ ...defaultRoundedImage, corners: { ...defaultRoundedImage.corners } }); }}>重置设置</button></div>
      <TaskFeedback task={output} />{output.result && current && <LocalDownload blob={output.result.blob} name={`${current.file.name.replace(/\.[^.]+$/, "")}-rounded.png`} title="下载透明 PNG" />}
    </section><section className="utility-panel"><h2>图片预览</h2><p className="utility-muted">原图预览最长边 1024px，导出保留原尺寸。更改设置后点“生成 PNG”更新预览；不在调节时反复处理整张图片。棋盘格只表示透明区域，不会导出。</p>
      <div className="adjustment-previews"><figure><figcaption>原图{current ? ` · ${current.width} × ${current.height}px` : ""}</figcaption>{original ? <img src={original} alt="圆角处理前原图" /> : <div className="utility-empty">请选择图片</div>}</figure><figure><figcaption>成品{output.result ? ` · ${output.result.width} × ${output.result.height}px` : ""}</figcaption>{result ? <img className="image-diff-preview" src={result} alt="圆角与边框实际 PNG 成品" /> : <div className="utility-empty">生成后显示成品预览</div>}</figure></div>
    </section></div>
  </UtilityShell>;
}
