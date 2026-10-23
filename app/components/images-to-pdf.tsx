"use client";
import { useRef, useState } from "react";
import { defaultImagePdfOptions, type ImagePdfOptions } from "../lib/extra-tool-options";
import { runFileWorker } from "../lib/file-worker-client";
import { checkFiles, fileSize } from "../lib/local-files";
import { toolLimits } from "../lib/resource-limits";
import { LocalDownload, LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
type Item = { id: number; file: File };
export default function ImagesToPdf() {
  const [items, setItems] = useState<Item[]>([]), [options, setOptions] = useState(defaultImagePdfOptions), sequence = useRef(0);
  const task = useLocalTask<Blob>();
  function change(next: Partial<ImagePdfOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  function update(next: Item[]) { task.reset(); setItems(next); }
  function move(index: number, step: number) { const next = [...items]; [next[index], next[index + step]] = [next[index + step], next[index]]; update(next); }
  return <UtilityShell className="additional-utilities" title="图片转 PDF" description="多张图片按顺序合成 PDF，自定义纸张、方向、边距与清晰度，本地导出。">
    <LocalUpload multiple accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" title="添加图片 / 拖入多张图片" hint="PNG / JPG / WebP / AVIF / BMP · 最多 200 张，每张 100 MB，总计 1 GB" onFiles={(files) => {
      task.reset();
      try { checkFiles([...items.map((item) => item.file), ...files], toolLimits.image.batchBytes, toolLimits.image.batchFiles);
        if (files.some((file) => file.size > toolLimits.image.fileBytes || !/\.(png|jpe?g|webp|avif|bmp)$/i.test(file.name))) throw new Error("请选择支持的图片格式，每张最多 100 MB。");
        setItems([...items, ...files.map((file) => ({ id: ++sequence.current, file }))]);
      } catch (cause) { task.setError((cause as Error).message); }
    }} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>页面顺序 · {items.length} 张</h2>
      <div className="utility-actions"><button disabled={!items.length} onClick={() => update([...items].sort((a, b) => a.file.name.localeCompare(b.file.name, "zh-CN", { numeric: true })))}>按文件名排序</button><button disabled={!items.length} onClick={() => update([])}>清空图片</button></div>
      {items.length ? <ol className="image-pdf-list">{items.map((item, index) => <li key={item.id}><span><strong>{index + 1}. {item.file.name}</strong><small>{fileSize(item.file.size)}</small></span><div className="utility-actions"><button aria-label={`上移 ${item.file.name}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button aria-label={`下移 ${item.file.name}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button><button aria-label={`移除 ${item.file.name}`} onClick={() => update(items.filter((other) => other.id !== item.id))}>移除</button></div></li>)}</ol> : <p className="utility-muted">先添加图片，列表顺序就是 PDF 页序。</p>}
    </section><section className="utility-panel utility-controls"><h2>导出设置</h2>
      <label>纸张<select value={options.page} onChange={(e) => change({ page: e.target.value as ImagePdfOptions["page"] })}><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option><option value="image">按图片比例与 DPI</option></select></label>
      <label>方向<select disabled={options.page === "image"} value={options.orientation} onChange={(e) => change({ orientation: e.target.value as ImagePdfOptions["orientation"] })}><option value="auto">自动适配每张图片</option><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
      <label>边距（mm）<input type="number" min="0" max="50" value={options.margin} onChange={(e) => change({ margin: Number(e.target.value) })} /></label>
      {options.page === "image" && <label>页面 DPI<input type="number" min="36" max="600" value={options.dpi} onChange={(e) => change({ dpi: Number(e.target.value) })} /></label>}
      <label>嵌入图片<select value={options.format} onChange={(e) => change({ format: e.target.value as ImagePdfOptions["format"] })}><option value="jpeg">JPEG · 较小体积，白色背景</option><option value="png">PNG · 无损，保留透明通道</option></select></label>
      {options.format === "jpeg" && <label>JPEG 质量 {Math.round(options.quality * 100)}%<input type="range" min="50" max="100" value={Math.round(options.quality * 100)} onChange={(e) => change({ quality: Number(e.target.value) / 100 })} /></label>}
      <label>图片最长边<select value={options.edge} onChange={(e) => change({ edge: Number(e.target.value) })}><option value="0">保留原尺寸</option><option value="4096">最多 4096px</option><option value="2048">最多 2048px</option></select></label>
      <button type="button" className="primary-button" disabled={!items.length || task.busy} onClick={() => void task.run(async (signal, report) => {
        const data = await runFileWorker<Uint8Array>({ action: "images-pdf", files: items.map((item) => item.file), options }, signal, report);
        return new Blob([new Uint8Array(data)], { type: "application/pdf" });
      })}>合成 PDF</button><TaskFeedback task={task} />
      {task.result && <LocalDownload blob={task.result} name="images.pdf" title={`下载 PDF · ${items.length} 页`} />}
      <p className="utility-muted">每张图片一页，完整居中、不裁切；缩小长边时不放大原图。PNG 的透明区域在白纸上显示。输出最多 200 MB，图片按顺序处理，超出内存预算会提示分批，不会自动降低画质。</p>
    </section></div>
  </UtilityShell>;
}
