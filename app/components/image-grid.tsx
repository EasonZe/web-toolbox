"use client";
/* eslint-disable @next/next/no-img-element -- Local raster thumbnails. */
import { useMemo, useState } from "react";
import { gridSplitPlan } from "../lib/image-grid-plan";
import { defaultGridSplitOptions, type GridSplitOptions } from "../lib/image-grid-options";
import { loadRaster } from "../lib/local-images";
import { runFileWorker } from "../lib/file-worker-client";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
export default function ImageGrid() {
  const [options, setOptions] = useState(defaultGridSplitOptions);
  const source = useLocalTask<{ file: File; width: number; height: number; thumbnail: Blob }>(), output = useLocalTask<Blob>();
  const current = source.result, url = useBlobUrl(current?.thumbnail);
  const plan = useMemo(() => { try { return { value: current ? gridSplitPlan(current.width, current.height, options) : null, error: "" }; } catch (cause) { return { value: null, error: (cause as Error).message }; } }, [current, options]);
  function change(next: Partial<GridSplitOptions>) { output.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="图片九宫格与网格切分" description="将普通图片切成多张网格图片，预览编号与裁剪范围，按行列顺序打包下载。">
    <LocalUpload accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" hint="每张 100 MB / 100 MP · 本地处理 · 不修改原图" onFiles={async (files) => {
      output.reset(); await source.run(async (signal) => {
        if (files.length !== 1) throw new Error("请选择一张图片。");
        const bitmap = await loadRaster(files[0], signal), canvas = document.createElement("canvas");
        try {
          const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法绘制图片预览。"); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("预览失败。")), "image/png"));
          signal.throwIfAborted(); return { file: files[0], width: bitmap.width, height: bitmap.height, thumbnail };
        } finally { bitmap.close(); canvas.width = canvas.height = 0; }
      });
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>切分设置</h2><div className="utility-actions">{[[3, 3], [2, 2], [1, 3], [3, 1]].map(([rows, columns]) => <button type="button" key={`${rows}-${columns}`} onClick={() => change({ rows, columns })}>{rows} × {columns}</button>)}</div>
      <label>行数<input type="number" min="1" max="20" value={options.rows} onChange={(e) => change({ rows: Number(e.target.value) })} /></label><label>列数<input type="number" min="1" max="20" value={options.columns} onChange={(e) => change({ columns: Number(e.target.value) })} /></label>
      <label>图片范围<select value={options.mode} onChange={(e) => change({ mode: e.target.value as GridSplitOptions["mode"] })}><option value="square-crop">居中裁成正方形</option><option value="square-pad">补边为正方形</option><option value="original">完整原图，不裁剪</option></select></label>
      <label>输出格式<select value={options.format} onChange={(e) => change({ format: e.target.value as GridSplitOptions["format"] })}><option value="png">PNG · 保留透明通道</option><option value="jpeg">JPEG · 白色补边</option></select></label>
      {options.format === "jpeg" && <label className="utility-range-control"><span>图片质量<output>{Math.round(options.quality * 100)}%</output></span><input type="range" min="50" max="100" value={Math.round(options.quality * 100)} onChange={(e) => change({ quality: Number(e.target.value) / 100 })} /></label>}
      <button type="button" className="primary-button" disabled={!current || !plan.value || output.busy} onClick={() => current && void output.run((signal, report) => runFileWorker<Blob>({ action: "image-grid", file: current.file, options }, signal, report))}>切分并打包</button><TaskFeedback task={output} />
      {output.result && <LocalDownload blob={output.result} name="image-grid.zip" title="下载网格图片 ZIP" />}
      <p className="utility-muted">从左到右、从上到下编号，最多 200 张；不能整除时格子尺寸最多相差 1px，不丢弃边缘。PNG 补边透明，JPEG 补边白色；ZIP 包含坐标清单。社交平台发布顺序请按自身需求调整。</p>
    </section><section className="utility-panel"><h2>网格预览</h2>{current && plan.value && url ? <>
      <p className="utility-muted">原图 {current.width} × {current.height} · 切分范围 {plan.value.width} × {plan.value.height} · {plan.value.tiles.length} 张</p>
      <div className={`grid-split-preview ${options.format === "jpeg" ? "is-jpeg" : ""}`} style={{ aspectRatio: `${plan.value.width} / ${plan.value.height}` }}><img src={url} alt="网格切分范围" style={{ objectFit: options.mode === "square-crop" ? "cover" : "contain" }} /><div className="grid-split-overlay" style={{ gridTemplateRows: `repeat(${options.rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${options.columns}, minmax(0, 1fr))` }}>{plan.value.tiles.map((tile, index) => <span key={tile.name}>{index + 1}</span>)}</div></div>
      <p className="utility-muted">预览使用缩略图，导出按原始像素切分。</p>
    </> : <p className="utility-muted">选择图片后显示切分网格。</p>}{plan.error && <p role="alert" className="utility-error">{plan.error}</p>}</section></div>
  </UtilityShell>;
}
