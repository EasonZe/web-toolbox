"use client";
/* eslint-disable @next/next/no-img-element -- Local-only image thumbnails and generated PNG. */
import { useMemo, useState } from "react";
import { canvasAnchors, canvasImagePlacement, createImageCanvas, defaultImageCanvas, prepareCanvasSource, validateImageCanvas, type CanvasImageSource, type ImageCanvasOptions } from "../lib/image-canvas";
import { DesignColorInput } from "./design-color-input";
import { LocalDownload, LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
const anchorLabels = ["左上", "上方", "右上", "左侧", "居中", "右侧", "左下", "下方", "右下"];

export default function ImageCanvas() {
  const [options, setOptions] = useState<ImageCanvasOptions>({ ...defaultImageCanvas }), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<CanvasImageSource>(), output = useLocalTask<Awaited<ReturnType<typeof createImageCanvas>>>();
  const originalUrl = useBlobUrl(source.result?.thumbnail), outputUrl = useBlobUrl(output.result?.blob);
  function change(next: Partial<ImageCanvasOptions>) { output.reset(); setOptions({ ...options, ...next }); }
  const problem = useMemo(() => { try { validateImageCanvas(options); if (source.result) canvasImagePlacement(source.result.width, source.result.height, options); return ""; } catch (cause) { return (cause as Error).message; } }, [options, source.result]);
  return <UtilityShell className="additional-utilities" title="图片画布与纯色图" description="制作纯色或透明 PNG 底图，也可为图片补背景、扩展画布和统一封面尺寸；在本地完成。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="可选：导入需要放到画布上的图片" hint="不导入图片即可生成纯色或透明底图 · 静态图片，最大 100 MiB / 100 MP" disabled={output.busy} onFiles={async (files) => {
      output.reset(); await source.run((signal) => prepareCanvasSource(files[0], signal));
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>画布设置</h2>
      <div className="workbench-fields"><label>画布宽度（px）<input type="number" min="1" max="8192" step="1" value={options.width} onChange={(event) => change({ width: Number(event.target.value) })} /></label><label>画布高度（px）<input type="number" min="1" max="8192" step="1" value={options.height} onChange={(event) => change({ height: Number(event.target.value) })} /></label></div>
      <div className="utility-actions">{[["正方形", 1080, 1080], ["横版", 1920, 1080], ["竖版", 1080, 1920]].map(([name, width, height]) => <button type="button" key={name} onClick={() => change({ width: width as number, height: height as number })}>{name}</button>)}<button type="button" onClick={() => change({ width: options.height, height: options.width })}>交换宽高</button></div>
      <label className="utility-checkbox"><input type="checkbox" checked={options.transparent} onChange={(event) => change({ transparent: event.target.checked })} />透明画布</label>
      {!options.transparent && <DesignColorInput label="画布底色" value={options.background} onChange={(background) => change({ background })} />}
      <label>图片适配方式<select value={options.fit} onChange={(event) => change({ fit: event.target.value as ImageCanvasOptions["fit"] })}><option value="contain">完整适配 · 保留全部画面</option><option value="original">原尺寸放置 · 不缩放</option><option value="cover">填满裁切 · 可能裁掉边缘</option></select></label>
      <fieldset className="photo-canvas-anchor"><legend>图片位置</legend><div className="photo-canvas-anchor-grid">{canvasAnchors.map((anchor, index) => <button type="button" key={anchor} aria-pressed={options.anchor === anchor} onClick={() => change({ anchor })}>{anchorLabels[index]}</button>)}</div></fieldset>
      <div className="utility-actions"><button type="button" disabled={!source.result} onClick={() => source.result && change({ width: source.result.width, height: source.result.height, fit: "original" })}>使用原图尺寸</button><button type="button" onClick={() => { source.reset(); output.reset(); setUploadKey((key) => key + 1); }}>清空图片</button></div>
      {problem && <p className="utility-error" role="alert">{problem}</p>}
      <button type="button" className="primary-button" disabled={!!problem || source.busy || output.busy} onClick={() => output.run((signal) => createImageCanvas(source.result?.file ?? null, options, signal))}>生成 PNG</button><TaskFeedback task={output} />
      <p className="utility-muted">适配不拉伸比例；完整适配会按画布放大或缩小图片。原尺寸放置要求画布不小于原图，居中时奇数留白会多留一像素在右侧 / 下方以避免模糊；仅“填满裁切”会裁掉超出区域。修改设置后请重新生成。</p>
      <p className="utility-muted">底色会透过源图片的透明区域。透明画布保留透明度；不做智能补画，不恢复画面外的内容。最长边 8192px，按设备内存和原图 / 输出联合预算检查。</p>
    </section><section className="utility-panel utility-controls"><h2>原图与成品</h2>
      {source.result && <figure className="photo-canvas-figure"><figcaption>原图 {source.result.width} × {source.result.height}px · 显示缩略图</figcaption>{originalUrl && <img className="image-diff-preview" src={originalUrl} alt="导入图片缩略图" />}</figure>}
      {output.result ? <><p className="utility-muted">成品 {output.result.width} × {output.result.height}px · PNG · 预览缩放显示，下载像素不变</p>{outputUrl && <img className="image-diff-preview" src={outputUrl} alt="生成后的完整画布" />}<LocalDownload blob={output.result.blob} name={`${source.result?.file.name.replace(/\.[^.]+$/, "") || "solid"}-canvas.png`} title="下载画布图片" /></> : <div className="utility-empty">设置尺寸和底色后点击“生成 PNG”；也可先导入图片。</div>}
    </section></div>
  </UtilityShell>;
}
