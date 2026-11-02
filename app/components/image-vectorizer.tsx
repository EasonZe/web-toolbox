"use client";
/* eslint-disable @next/next/no-img-element -- Local revocable raster and SVG Blob URLs, never injected markup. */
import { useState } from "react";
import { defaultImageVectorizer, validateImageVectorizer, vectorizerDimensions, type ImageVectorizerOptions } from "../lib/image-vectorizer-options";
import type { ImageVectorizerResult, ImageVectorizerSource } from "../lib/image-vectorizer";
import { readImageVectorizerSource, runImageVectorizer } from "../lib/image-vectorizer-client";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function ImageVectorizer() {
  const [options, setOptions] = useState<ImageVectorizerOptions>(defaultImageVectorizer), [file, setFile] = useState<File | null>(null), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<ImageVectorizerSource>(), output = useLocalTask<ImageVectorizerResult>(), sourceUrl = useBlobUrl(source.result?.thumbnail), outputUrl = useBlobUrl(output.result?.blob);
  let valid = true; try { validateImageVectorizer(options); } catch { valid = false; }
  const size = source.result && valid ? vectorizerDimensions(source.result.width, source.result.height, options.edge) : null;
  function change(next: ImageVectorizerOptions) { output.reset(); setOptions(next); }
  function clear() { source.reset(); output.reset(); setFile(null); setOptions(defaultImageVectorizer); setUploadKey((key) => key + 1); }
  return <UtilityShell className="additional-utilities image-vectorizer-tool" title="图片转 SVG 矢量图" description="将本地图片的色块和轮廓描摹为 SVG 路径，适合图标、标志与插画。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="选择静态图片" hint="PNG / JPG / WebP / AVIF / BMP · 100 MiB · 原图单边最多 8192px · 不支持动图与 SVG" onFiles={async (files) => { output.reset(); source.reset(); setFile(null); if (files.length !== 1) { source.setError("请选择一张静态图片。"); return; } const current = files[0], ready = await source.run((signal, report) => readImageVectorizerSource(current, signal, report)); if (ready) setFile(current); }} />
    <TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>描摹设置</h2><div className="image-vectorizer-fields">
      <label>处理最长边<select value={options.edge} onChange={(e) => change({ ...options, edge: Number(e.target.value) as ImageVectorizerOptions["edge"] })}><option value="512">512px · 快速</option><option value="1024">1024px · 精细</option><option value="2048">2048px · 高细节</option></select></label>
      <label>颜色数量（2–32）<input type="number" min="2" max="32" step="1" value={options.colors} onChange={(e) => change({ ...options, colors: Number(e.target.value) })} /></label>
      <label className="utility-range-control"><span>线条拟合<output>{options.fitting}</output></span><input type="range" min="0.1" max="5" step="0.1" value={options.fitting} onChange={(e) => change({ ...options, fitting: Number(e.target.value) })} /></label>
      <label className="utility-range-control"><span>小斑点过滤<output>{options.speckles}</output></span><input type="range" min="0" max="64" step="1" value={options.speckles} onChange={(e) => change({ ...options, speckles: Number(e.target.value) })} /></label>
      <label>背景处理<select value={options.background} onChange={(e) => change({ ...options, background: e.target.value as ImageVectorizerOptions["background"] })}><option value="transparent">保留透明背景</option><option value="white">合成为白色背景</option></select></label>
    </div>
      {size && <p className="utility-muted">原图 {source.result!.width} × {source.result!.height}px → 描摹 {size.width} × {size.height}px · {size.scale < 1 ? `缩放为原图 ${(size.scale * 100).toFixed(1)}%` : "保持原尺寸，不放大"}</p>}
      {!valid && <p className="utility-error" role="alert">颜色数量须为 2–32 的整数，请检查描摹参数。</p>}
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!file || !source.result || source.busy || output.busy || !valid} onClick={() => file && output.run((signal, report) => runImageVectorizer(file, options, signal, report))}>生成 SVG</button><button type="button" onClick={() => change(defaultImageVectorizer)}>重置参数</button><button type="button" onClick={clear}>清空</button></div>
      <TaskFeedback task={output} />
      {output.result && <><p className="utility-muted">SVG {output.result.width} × {output.result.height}px · {output.result.paths} 个可见路径 · {(output.result.blob.size / 1024).toFixed(1)} KiB</p><LocalDownload blob={output.result.blob} name={`${file?.name.replace(/\.[^.]+$/, "") || "image"}-vector.svg`} title="下载 SVG 矢量图" /></>}
      <p className="utility-muted">线条拟合越小越贴近原轮廓；小斑点过滤越大，保留的细小轮廓越少。尺寸上限由你选择，超出设备预算会提示，不会悄悄降低质量。</p>
      <p className="utility-muted">透明度参与颜色量化，半透明和边缘会近似；透明背景与镂空区域另用矢量轮廓裁切。白色模式先合成白底。照片、渐变和细密纹理可能失真，输出也可能大于原图。</p>
      <p className="utility-muted">只导出真实 SVG 路径，不嵌入原图、不恢复原始文字或图层。单次处理最多 2 分钟、2 万路径、30 万线段、8 MiB SVG；达到保护范围时请调整参数。</p>
    </section><section className="utility-panel"><h2>原图与矢量预览</h2>{file && <p className="utility-muted">{file.name}</p>}<div className="adjustment-previews photo-effects-previews image-vectorizer-previews"><figure><figcaption>原图 · 最长边 512px 缩略图</figcaption>{sourceUrl ? <img src={sourceUrl} alt="描摹前的本地原图" /> : <div className="utility-empty">请选择图片</div>}</figure><figure><figcaption>SVG · 可缩放的真实路径</figcaption>{outputUrl ? <img src={outputUrl} alt="SVG 矢量描摹结果" /> : <div className="utility-empty">{output.busy ? "正在描摹矢量路径…" : "生成后查看矢量结果"}</div>}</figure></div></section></div>
  </UtilityShell>;
}
