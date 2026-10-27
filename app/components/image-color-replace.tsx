"use client";
/* eslint-disable @next/next/no-img-element -- Local raster thumbnails with explicit sample coordinates. */
import { useState, type MouseEvent } from "react";
import { defaultColorReplaceOptions, type ColorReplaceOptions, type replaceImageColor, type sampleImageColor } from "../lib/image-color-replace";
import { readRasterPreview } from "../lib/raster-preview";
import { runFileWorker } from "../lib/file-worker-client";
import { UtilityShell } from "./utility-shell";
import { DesignColorInput } from "./design-color-input";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask, useBlobUrl } from "./local-workbench";
import { ResultContinue } from "./tool-handoff";
import { resultFile } from "../lib/tool-handoff";
export default function ImageColorReplace() {
  const source = useLocalTask<Awaited<ReturnType<typeof readRasterPreview>>>(), output = useLocalTask<Awaited<ReturnType<typeof replaceImageColor>>>(), sampler = useLocalTask<Awaited<ReturnType<typeof sampleImageColor>>>();
  const [options, setOptions] = useState(defaultColorReplaceOptions), [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const current = source.result, original = useBlobUrl(current?.thumbnail), preview = useBlobUrl(output.result?.preview);
  function change(next: Partial<ColorReplaceOptions>) { output.reset(); sampler.reset(); if (next.from !== undefined) setPoint(null); setOptions({ ...options, ...next }); }
  function pick(event: MouseEvent<HTMLButtonElement>) {
    if (!current) return; const box = event.currentTarget.getBoundingClientRect(), rx = event.detail === 0 ? 0.5 : (event.clientX - box.left) / box.width, ry = event.detail === 0 ? 0.5 : (event.clientY - box.top) / box.height;
    const x = Math.max(0, Math.min(current.width - 1, Math.floor(rx * current.width))), y = Math.max(0, Math.min(current.height - 1, Math.floor(ry * current.height))); output.reset();
    void sampler.run(async (signal) => { const result = await runFileWorker<Awaited<ReturnType<typeof sampleImageColor>>>({ action: "image-color-sample", file: current.file, x, y }, signal); signal.throwIfAborted(); setOptions((previous) => ({ ...previous, from: result.hex })); setPoint({ x, y }); return result; });
  }
  return <UtilityShell className="additional-utilities" title="图片指定颜色替换" description="选择源颜色与目标颜色，调整容差、柔化和强度，按原尺寸导出 PNG；保留透明通道。">
    <LocalUpload accept="image/png,image/jpeg,image/webp,image/bmp,image/avif" title="选择图片" hint="本地处理 · 100 MiB / 100 MP · 单边最多 8192px" onFiles={async (files) => { output.reset(); sampler.reset(); setPoint(null); await source.run(async (signal) => { if (files.length !== 1) throw new Error("请选择一张图片。"); return readRasterPreview(files[0], signal); }); }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>替换设置</h2><DesignColorInput label="源颜色" value={options.from} onChange={(from) => change({ from })} /><DesignColorInput label="目标颜色" value={options.to} onChange={(to) => change({ to })} />
      {([["tolerance", "颜色容差"], ["softness", "边界柔化"], ["strength", "替换强度"]] as const).map(([key, label]) => <label className="utility-range-control" key={key}><span>{label}<output>{options[key]}%</output></span><input type="range" min="0" max="100" value={options[key]} onChange={(e) => change({ [key]: Number(e.target.value) })} /></label>)}
      <button className="primary-button" type="button" disabled={!current || output.busy || sampler.busy} onClick={() => current && void output.run((signal) => runFileWorker({ action: "image-color-replace", file: current.file, options }, signal))}>开始替换</button><TaskFeedback task={sampler} /><TaskFeedback task={output} />
      {output.result && <><p className="utility-muted">实际改变 {output.result.changed.toLocaleString()} 个像素 · {output.result.width} × {output.result.height}</p><LocalDownload blob={output.result.blob} name="color-replaced.png" title="下载原尺寸 PNG" /><ResultContinue source="图片指定颜色替换" targets={["/images-to-pdf", "/image-compressor", "/image-text"]} getFiles={() => output.result ? [resultFile(output.result.blob, "color-replaced.png", "image/png")] : []} /></>}
      <p className="utility-muted">点击原图取色，十字标记和坐标对应原始像素；键盘激活取图像中心。0% 容差仅匹配精确 RGB，柔化作用于容差范围内的边缘；不是 AI 区域识别，同色区域都会处理。透明像素不换色，半透明像素保留原透明度；不保留元数据。</p>
    </section><section className="utility-panel utility-controls"><h2>原图与取色位置</h2>{current && original && <><p className="utility-muted">{current.file.name} · {current.width} × {current.height}</p><button type="button" className="color-replace-picker" style={{ width: Math.min(600, 600 * current.width / current.height) }} aria-label="在原图取色，键盘激活取中心像素" onClick={pick}><img src={original} alt="原图取色预览" />{point && <span className="color-pick-cross" style={{ left: `${(point.x + 0.5) / current.width * 100}%`, top: `${(point.y + 0.5) / current.height * 100}%` }} />}</button>{sampler.result && <p className="utility-muted">原图坐标 x={sampler.result.x}, y={sampler.result.y} · {sampler.result.hex} · 不透明度 {(sampler.result.alpha / 255 * 100).toFixed(1)}%</p>}</>}
      {preview && <><h2>替换结果</h2><img className="image-diff-preview" src={preview} alt="颜色替换结果" /></>}
    </section></div>
  </UtilityShell>;
}
