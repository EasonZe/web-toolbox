"use client";
/* eslint-disable @next/next/no-img-element -- Only local revocable thumbnail URLs are displayed. */
import { useState } from "react";
import { defaultImageBlur, validateImageBlur, type ImageBlurOptions, type BlurRegion } from "../lib/image-blur-options";
import type { ImageBlurSource, ImageBlurResult } from "../lib/image-blur";
import { readImageBlurSource, runImageBlur } from "../lib/image-blur-client";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask, useBlobUrl } from "./local-workbench";

export default function ImageBlur() {
  const [options, setOptions] = useState<ImageBlurOptions>(defaultImageBlur), [file, setFile] = useState<File | null>(null), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<ImageBlurSource>(), output = useLocalTask<ImageBlurResult>();
  const originalUrl = useBlobUrl(source.result?.thumbnail), resultUrl = useBlobUrl(output.result?.thumbnail);
  let valid = true; try { validateImageBlur(options); } catch { valid = false; }
  function change(next: ImageBlurOptions) { output.reset(); setOptions(next); }
  function region(key: keyof BlurRegion, value: number) { change({ ...options, region: { ...options.region, [key]: value } }); }
  function clear() { source.reset(); output.reset(); setFile(null); setOptions(defaultImageBlur); setUploadKey((previous) => previous + 1); }
  return <UtilityShell className="additional-utilities image-blur-tool" title="图片模糊" description="全图或矩形局部均值模糊，保留透明度并导出原尺寸 PNG；本地处理，不上传图片。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="选择图片" hint="PNG / JPG / WebP / AVIF / BMP · 100 MiB · 单边最多 8192px；按设备检查工作空间，不自动缩小导出。" onFiles={async (files) => {
      output.reset(); source.reset(); setFile(null);
      if (files.length !== 1) { source.setError("请选择一张静态图片。"); return; }
      const current = files[0], ready = await source.run((signal, report) => readImageBlurSource(current, signal, report)); if (ready) setFile(current);
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>模糊设置</h2>
      <div className="image-blur-fields">
        <label>处理范围<select value={options.scope} onChange={(e) => change({ ...options, scope: e.target.value as ImageBlurOptions["scope"] })}><option value="all">整张图片</option><option value="region">局部矩形</option></select></label>
        <label>均值半径（原图 px）<input type="number" min="1" max="100" step="1" value={options.radius} onChange={(e) => change({ ...options, radius: Number(e.target.value) })} /></label>
        <label className="utility-range-control"><span>模糊强度<output>{options.strength}%</output></span><input type="range" min="0" max="100" value={options.strength} onChange={(e) => change({ ...options, strength: Number(e.target.value) })} /></label>
      </div>
      {options.scope === "region" && <fieldset className="image-blur-region"><legend>局部矩形（原图百分比）</legend><div className="image-blur-region-fields">{([["left", "左侧位置"], ["top", "顶部位置"], ["width", "范围宽度"], ["height", "范围高度"]] as const).map(([key, label]) => <label key={key}>{label}（%）<input type="number" min={key === "left" || key === "top" ? "0" : "0.1"} max="100" step="0.1" value={options.region[key]} onChange={(e) => region(key, Number(e.target.value))} /></label>)}</div><p className="utility-muted">左侧 + 宽度、顶部 + 高度均不超过 100%。矩形之外保持不变；邻域会采样矩形周围的原图。</p></fieldset>}
      {!valid && <p className="utility-error" role="alert">请检查半径与局部范围，矩形不能超出图片。</p>}
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!file || !source.result || source.busy || output.busy || !valid} onClick={() => file && output.run((signal, report) => runImageBlur(file, options, signal, report))}>生成模糊图片</button><button type="button" onClick={() => change(defaultImageBlur)}>重置参数</button><button type="button" onClick={clear}>清空</button></div>
      <TaskFeedback task={output} />{output.result && <><p className="utility-muted">原尺寸 {output.result.width} × {output.result.height}px · PNG · 保留原透明度</p><LocalDownload blob={output.result.blob} name="image-blur.png" title="下载原尺寸 PNG" /></>}
      <p className="utility-muted">透明度加权盒式均值模糊，不是高斯模糊。强度 0% 保持原像素。半径越大越柔和，更改参数后点击生成。</p>
      <p className="utility-muted">适合全图柔焦与矩形局部柔化；需要手绘遮挡时请使用「敏感信息遮挡」工具。</p>
      <p className="utility-muted">普通模糊可能被还原或推断，不用于敏感信息安全脱敏；请改用不透明遮盖并核对导出结果。</p>
      <p className="utility-muted">预览最长边 1280px；导出保持原尺寸，不修改原文件，不保留 EXIF 等元数据。不支持动图与 SVG。</p>
    </section><section className="utility-panel"><h2>原图与结果</h2>{file && source.result && <p className="utility-muted">{file.name} · {source.result.width} × {source.result.height}px</p>}
      <div className="adjustment-previews photo-effects-previews image-blur-previews"><figure><figcaption>原图 · 局部范围以虚线标记</figcaption>{originalUrl ? <div className="image-blur-selection"><img src={originalUrl} alt="处理前的原图" />{options.scope === "region" && valid && <span className="image-blur-selection-box" aria-hidden="true" style={{ left: `${options.region.left}%`, top: `${options.region.top}%`, width: `${options.region.width}%`, height: `${options.region.height}%` }} />}</div> : <div className="utility-empty">请选择图片</div>}</figure><figure><figcaption>模糊结果 · 缩放预览</figcaption>{resultUrl ? <img src={resultUrl} alt="图片模糊结果" /> : <div className="utility-empty">{output.busy ? "正在生成模糊图片…" : "点击生成查看结果"}</div>}</figure></div>
    </section></div>
  </UtilityShell>;
}
