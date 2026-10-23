"use client";
/* eslint-disable @next/next/no-img-element -- Generated local PNG previews. */
import { useState } from "react";
import { iconSizes, iconPlacement, packIco } from "../lib/icon-generator";
import { loadRaster } from "../lib/local-images";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask, useBlobUrl } from "./local-workbench";

function IconPreview({ size, blob }: { size: number; blob: Blob }) {
  const url = useBlobUrl(blob);
  return <div className="icon-result"><div className="icon-checker">{url && <img src={url} alt={`${size} 像素图标`} width={size} height={size} />}</div><span>{size} × {size}</span><LocalDownload blob={blob} name={`icon-${size}.png`} title="下载 PNG" /></div>;
}
export default function IconGenerator() {
  const [file, setFile] = useState<File | null>(null), [sizes, setSizes] = useState<number[]>([16, 32, 48, 256]), [fit, setFit] = useState<"contain" | "cover">("contain"), [transparent, setTransparent] = useState(true), [background, setBackground] = useState("#ffffff");
  const task = useLocalTask<{ ico: Blob; images: { size: number; blob: Blob }[] }>();
  async function generate() {
    if (!file) return;
    await task.run(async (signal) => {
      if (!sizes.length) throw new Error("请至少选择一个尺寸。");
      const bitmap = await loadRaster(file, signal), canvas = document.createElement("canvas");
      try {
        const images: { size: number; blob: Blob; png: Uint8Array }[] = [];
        for (const size of [...sizes].sort((a, b) => a - b)) {
          signal.throwIfAborted(); canvas.width = canvas.height = size;
          const context = canvas.getContext("2d"); if (!context) throw new Error("无法绘制图片。");
          if (!transparent) { context.fillStyle = background; context.fillRect(0, 0, size, size); }
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
          const placement = iconPlacement(bitmap.width, bitmap.height, size, fit);
          context.drawImage(bitmap, placement.x, placement.y, placement.width, placement.height);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图标导出失败。")), "image/png"));
          images.push({ size, blob, png: new Uint8Array(await blob.arrayBuffer()) });
        }
        signal.throwIfAborted(); return { ico: new Blob([packIco(images)], { type: "image/x-icon" }), images };
      } finally { bitmap.close(); canvas.width = canvas.height = 0; }
    });
  }
  return <UtilityShell className="additional-utilities" title="ICO 图标制作" description="把图片制作成多尺寸 ICO，保留透明背景，并导出各尺寸 PNG。">
    <LocalUpload accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="选择图标原图 / 拖入图片" hint="PNG / JPG / WebP / AVIF / BMP · 最大 100 MB，最多 100 MP" onFiles={(files) => { task.reset(); setFile(files[0]); }} />
    <section className="utility-panel utility-controls"><h2>图标设置</h2>{file && <p className="utility-muted utility-code-output">{file.name}</p>}
      <label>画面适配<select value={fit} onChange={(e) => { task.reset(); setFit(e.target.value as typeof fit); }}><option value="contain">完整显示（保留边距）</option><option value="cover">居中裁剪（填满正方形）</option></select></label>
      <fieldset className="compact-options"><legend>ICO 包含的尺寸</legend>{iconSizes.map((size) => <label className="utility-checkbox" key={size}><input type="checkbox" checked={sizes.includes(size)} onChange={(e) => { task.reset(); setSizes(e.target.checked ? [...sizes, size] : sizes.filter((item) => item !== size)); }} />{size}px</label>)}</fieldset>
      <label className="utility-checkbox"><input type="checkbox" checked={transparent} onChange={(e) => { task.reset(); setTransparent(e.target.checked); }} />保留透明背景</label>{!transparent && <label>背景颜色<input type="color" value={background} onChange={(e) => { task.reset(); setBackground(e.target.value); }} /></label>}
      <button className="primary-button" type="button" disabled={!file || task.busy || !sizes.length} onClick={() => void generate()}>生成图标</button><TaskFeedback task={task} />
    </section>
    {task.result && <section className="utility-panel utility-controls"><h2>图标预览</h2><LocalDownload blob={task.result.ico} name="favicon.ico" title="下载多尺寸 ICO" /><div className="icon-results">{task.result.images.map((image) => <IconPreview key={image.size} {...image} />)}</div><p className="utility-muted">棋盘格只用于表示透明区域，不会导出到图标中。</p></section>}
  </UtilityShell>;
}
