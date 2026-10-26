"use client";
/* eslint-disable @next/next/no-img-element -- Local raster thumbnails. */
import { useState } from "react";
import { defaultImageDiffOptions, type ImageDiffOptions } from "../lib/practical-tool-options";
import type { ImageDifference } from "../lib/image-difference";
import { readRasterPreview } from "../lib/raster-preview";
import { runFileWorker } from "../lib/file-worker-client";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
export default function ImageDifferenceTool() {
  const [options, setOptions] = useState(defaultImageDiffOptions);
  const left = useLocalTask<Awaited<ReturnType<typeof readRasterPreview>>>(), right = useLocalTask<Awaited<ReturnType<typeof readRasterPreview>>>(), result = useLocalTask<ImageDifference>();
  const leftUrl = useBlobUrl(left.result?.thumbnail), rightUrl = useBlobUrl(right.result?.thumbnail), resultUrl = useBlobUrl(result.result?.preview);
  function change(next: Partial<ImageDiffOptions>) { result.reset(); setOptions({ ...options, ...next }); }
  const dimensionsMatch = !!left.result && !!right.result && left.result.width === right.result.width && left.result.height === right.result.height;
  return <UtilityShell className="additional-utilities" title="图片差异对比" description="比较同尺寸图片的视觉像素差异，突出修改区域，导出原尺寸差异图。">
    <div className="utility-columns">{([["对比图 A", left, leftUrl], ["对比图 B", right, rightUrl]] as const).map(([title, source, url]) => <section className="utility-panel" key={title}><h2>{title}</h2>
      <LocalUpload accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title={`选择${title}`} hint="PNG / JPG / WebP / AVIF / BMP · 100 MB / 100 MP" onFiles={async (files) => { result.reset(); await source.run(async (signal) => { if (files.length !== 1) throw new Error("请选择一张图片。"); return readRasterPreview(files[0], signal); }); }} />
      <TaskFeedback task={source} />{source.result && <p className="utility-muted">{source.result.file.name} · {source.result.width} × {source.result.height}</p>}{url && <img className="image-diff-preview" src={url} alt={title} />}
    </section>)}</div>
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>对比设置</h2>
      <label className="utility-range-control"><span>颜色差异阈值<output>{options.threshold.toFixed(2)}</output></span><input type="range" min="0" max="1" step="0.01" value={options.threshold} onChange={(e) => change({ threshold: Number(e.target.value) })} /></label>
      <fieldset className="compact-options"><legend>差异显示</legend><label className="utility-checkbox"><input type="checkbox" checked={options.includeAA} onChange={(e) => change({ includeAA: e.target.checked })} />计入抗锯齿像素</label><label className="utility-checkbox"><input type="checkbox" checked={options.mask} onChange={(e) => change({ mask: e.target.checked })} />只导出透明底差异遮罩</label></fieldset>
      {left.result && right.result && !dimensionsMatch && <p role="alert" className="utility-error">两张图片尺寸不同，请先统一尺寸；不会自动缩放。</p>}
      <button type="button" className="primary-button" disabled={!dimensionsMatch || result.busy || left.busy || right.busy} onClick={() => left.result && right.result && void result.run((signal) => runFileWorker<ImageDifference>({ action: "image-diff", left: left.result!.file, right: right.result!.file, options }, signal))}>开始对比</button><TaskFeedback task={result} />
      <p className="utility-muted">阈值越小越敏感，不是“允许差异像素百分比”。红色表示差异；黄色为被忽略的抗锯齿区域。透明像素按白底视觉效果比较。差异率不是内容相似度，也不能证明文件字节相同。</p>
    </section><section className="utility-panel"><h2>差异结果</h2>{result.result ? <>
      <p className="utility-muted">{result.result.width} × {result.result.height} · {result.result.differences.toLocaleString()} 个差异像素 · 差异率 {result.result.ratio.toFixed(4)}%</p>
      {resultUrl && <img className="image-diff-preview" src={resultUrl} alt="图片差异预览" />}<LocalDownload blob={result.result.blob} name="image-difference.png" title="下载原尺寸差异 PNG" />
    </> : <p className="utility-muted">预览最长边 1280px，比较与导出使用原始尺寸。</p>}</section></div>
  </UtilityShell>;
}
