"use client";
/* eslint-disable @next/next/no-img-element -- Local revocable image thumbnails preserve input privacy. */
import { useState } from "react";
import { defaultDuotone, defaultSharpen, type PhotoEffectKind, type PhotoEffectOptions } from "../lib/image-photo-effects-options";
import type { PhotoEffectResult, PhotoEffectSource } from "../lib/image-photo-effects";
import { runPhotoEffect, readPhotoEffectSource } from "../lib/image-photo-effects-client";
import { UtilityShell } from "./utility-shell";
import { DesignColorInput } from "./design-color-input";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask, useBlobUrl } from "./local-workbench";

export default function ImagePhotoEffects({ kind }: { kind: PhotoEffectKind }) {
  const initial = kind === "duotone" ? defaultDuotone : defaultSharpen;
  const [options, setOptions] = useState<PhotoEffectOptions>(initial), [file, setFile] = useState<File | null>(null), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<PhotoEffectSource>(), output = useLocalTask<PhotoEffectResult>();
  const originalUrl = useBlobUrl(source.result?.thumbnail), resultUrl = useBlobUrl(output.result?.thumbnail);
  const title = kind === "duotone" ? "图片双色调" : "图片锐化";
  function change(next: PhotoEffectOptions) { output.reset(); setOptions(next); }
  function clear() { source.reset(); output.reset(); setFile(null); setOptions(initial); setUploadKey((previous) => previous + 1); }
  return <UtilityShell className="additional-utilities" title={title} description={kind === "duotone" ? "用暗部与亮部颜色重新表现明暗，保留透明度；本地处理，不上传图片。" : "调整半径、强度和阈值增强边缘，保留透明度；本地处理，不是 AI 清晰度复原。"}>
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="选择图片" hint="PNG / JPG / WebP / AVIF / BMP · 100 MiB · 单边最多 8192px；工作空间按设备预算检查，不自动缩小导出。" onFiles={async (files) => {
      output.reset(); source.reset(); setFile(null);
      if (files.length !== 1) { source.setError("请选择一张静态图片。"); return; }
      const current = files[0]; const ready = await source.run((signal, report) => readPhotoEffectSource(current, kind, signal, report)); if (ready) setFile(current);
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>效果设置</h2><div className="photo-effects-fields">
      {options.kind === "duotone" ? <><DesignColorInput label="暗部颜色" value={options.shadow} onChange={(shadow) => change({ ...options, shadow })} /><DesignColorInput label="亮部颜色" value={options.highlight} onChange={(highlight) => change({ ...options, highlight })} />
        <button type="button" onClick={() => change({ ...options, shadow: options.highlight, highlight: options.shadow })}>交换暗亮颜色</button>
        <label className="utility-range-control"><span>双色调强度<output>{options.strength}%</output></span><input type="range" min="0" max="100" value={options.strength} onChange={(e) => change({ ...options, strength: Number(e.target.value) })} /></label>
      </> : <>
        <label>邻域半径（原图 px）<input type="number" min="1" max="12" step="1" value={options.radius} onChange={(e) => change({ ...options, radius: Number(e.target.value) })} /></label>
        <label className="utility-range-control"><span>锐化强度<output>{options.amount}%</output></span><input type="range" min="0" max="300" value={options.amount} onChange={(e) => change({ ...options, amount: Number(e.target.value) })} /></label>
        <label>细节阈值（0–64）<input type="number" min="0" max="64" step="1" value={options.threshold} onChange={(e) => change({ ...options, threshold: Number(e.target.value) })} /></label>
      </>}
      </div><div className="utility-actions"><button className="primary-button" type="button" disabled={!file || !source.result || source.busy || output.busy} onClick={() => file && output.run((signal, report) => runPhotoEffect(file, options, signal, report))}>生成效果</button><button type="button" onClick={() => change(initial)}>重置参数</button><button type="button" onClick={clear}>清空</button></div>
      <TaskFeedback task={output} />
      {output.result && <><p className="utility-muted">原尺寸 {output.result.width} × {output.result.height}px · PNG · 保留透明度</p><LocalDownload blob={output.result.blob} name={kind === "duotone" ? "image-duotone.png" : "image-sharpen.png"} title="下载原尺寸 PNG" /></>}
      <p className="utility-muted">{kind === "duotone" ? "按线性 sRGB 亮度映射暗亮色并混合强度，0% 保持原始像素。更改参数后点击生成，不连续重复处理大图。" : "使用透明度加权盒式邻域的反差锐化；阈值越大，越少增强小幅差异。0% 强度保持原始像素。高强度可能加重噪点与光晕，不能恢复已经丢失的细节。"}</p>
      <p className="utility-muted">预览最长边 1280px；处理与导出保持原尺寸，不修改原文件，不保留 EXIF 等元数据。动图与 SVG 不支持。</p>
    </section><section className="utility-panel"><h2>原图与结果</h2>{file && source.result && <p className="utility-muted">{file.name} · {source.result.width} × {source.result.height}px</p>}
      <div className="adjustment-previews photo-effects-previews"><figure><figcaption>原图 · 缩放预览</figcaption>{originalUrl ? <img src={originalUrl} alt="处理前的原图" /> : <div className="utility-empty">请选择图片</div>}</figure><figure><figcaption>{title} · 缩放预览</figcaption>{resultUrl ? <img src={resultUrl} alt={`${title}结果`} /> : <div className="utility-empty">{output.busy ? "正在生成效果…" : "点击生成效果查看结果"}</div>}</figure></div>
    </section></div>
  </UtilityShell>;
}
