"use client";
/* eslint-disable @next/next/no-img-element -- Local image and generated PNG Blob previews. */
import { useEffect, useState } from "react";
import { imagePresets, defaultAdjustments, type ImageAdjustments } from "../lib/image-adjustments";
import { loadRaster, rasterPixels, pixelsToPng } from "../lib/local-images";
import { runRasterWorker } from "../lib/raster-worker-client";
import { checkRasterWork } from "../lib/resource-limits";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
const controls: [keyof ImageAdjustments, string, number, number][] = [["brightness", "亮度", -100, 100], ["contrast", "对比度", -100, 100], ["saturation", "饱和度", 0, 200], ["warmth", "冷暖", -100, 100], ["grayscale", "黑白", 0, 100], ["invert", "反色", 0, 100]];
export default function ImageAdjuster() {
  const [settings, setSettings] = useState<ImageAdjustments>({ ...defaultAdjustments });
  const source = useLocalTask<{ file: File; width: number; height: number; thumbnail: Blob }>(), preview = useLocalTask<Blob>(), output = useLocalTask<Blob>();
  const original = useBlobUrl(source.result?.thumbnail), adjusted = useBlobUrl(preview.result), { run: runPreview, reset: resetPreview } = preview;
  const current = source.result;
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => void runPreview(async (signal) => {
      const scale = Math.min(1, 1280 / Math.max(current.width, current.height)), width = Math.max(1, Math.round(current.width * scale)), height = Math.max(1, Math.round(current.height * scale));
      const image = await rasterPixels(current.file, signal, width, height);
      const pixels = await runRasterWorker<Uint8ClampedArray>({ action: "adjust", pixels: image.data, width, height, settings }, signal);
      signal.throwIfAborted(); return pixelsToPng(pixels, width, height);
    }), 250);
    return () => { clearTimeout(timer); resetPreview(); };
  }, [current, settings, runPreview, resetPreview]);
  function change(next: ImageAdjustments) { output.reset(); preview.reset(); setSettings(next); }
  return <UtilityShell className="additional-utilities" title="图片调色与滤镜" description="调整亮度、对比度、饱和度与冷暖，比较原图并导出原尺寸 PNG。">
    <LocalUpload accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" hint="PNG / JPG / WebP / AVIF / BMP · 最多 100 MB / 100 MP" onFiles={async (files) => {
      preview.reset(); output.reset(); await source.run(async (signal) => {
        const bitmap = await loadRaster(files[0], signal), canvas = document.createElement("canvas");
        try {
          const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d"); if (!context) throw new Error("无法绘制原图预览。"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("预览生成失败。")), "image/png"));
          signal.throwIfAborted(); return { file: files[0], width: bitmap.width, height: bitmap.height, thumbnail };
        } finally { bitmap.close(); canvas.width = canvas.height = 0; }
      });
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>调色设置</h2><div className="utility-actions">{imagePresets.map((preset) => <button type="button" key={preset.name} onClick={() => change({ ...preset.settings })}>{preset.name}</button>)}</div>
      {controls.map(([key, label, min, max]) => <label className="utility-range-control" key={key}><span>{label}<output>{settings[key]}</output></span><input type="range" min={min} max={max} value={settings[key]} onChange={(e) => change({ ...settings, [key]: Number(e.target.value) })} /></label>)}
      <p className="utility-muted">预览最长边 1280px；导出使用原始像素尺寸，保留透明通道。颜色调整不会修改原文件。</p>
      <button className="primary-button" type="button" disabled={!current || output.busy} onClick={() => current && void output.run(async (signal) => {
        checkRasterWork(current.width, current.height, 3); const image = await rasterPixels(current.file, signal);
        const pixels = await runRasterWorker<Uint8ClampedArray>({ action: "adjust", pixels: image.data, width: image.width, height: image.height, settings }, signal);
        signal.throwIfAborted(); return pixelsToPng(pixels, image.width, image.height);
      })}>原尺寸导出 PNG</button><TaskFeedback task={output} />
      {output.result && current && <LocalDownload blob={output.result} name={`${current.file.name.replace(/\.[^.]+$/, "")}-adjusted.png`} title="下载调色图片" />}
    </section><section className="utility-panel"><h2>原图与效果</h2><div className="adjustment-previews"><figure><figcaption>原图</figcaption>{original ? <img src={original} alt="调色前的原图" /> : <div className="utility-empty">请选择图片</div>}</figure><figure><figcaption>调色效果</figcaption>{adjusted ? <img src={adjusted} alt="调色效果预览" /> : <div className="utility-empty">{preview.busy ? "正在生成预览…" : "等待预览"}</div>}</figure></div><TaskFeedback task={preview} /></section></div>
  </UtilityShell>;
}
