"use client";

/* eslint-disable @next/next/no-img-element -- All previews use local Blob URLs. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiDownload, FiImage, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { gifCanvasSize, gifFrameRect, imagesToGifLimits, supportedGifImageText, validateGifImages } from "../lib/images-to-gif";

type ImageItem = { id: string; file: File; url: string };
type GifResult = { url: string; name: string; size: number; width: number; height: number };
const widths = [320, 480, 720, 1080];
const fileSize = (bytes: number) => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(2)} MB`;

export default function ImagesToGif() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [delay, setDelay] = useState(500);
  const [requestedWidth, setRequestedWidth] = useState(480);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [repeat, setRepeat] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<GifResult | null>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const resultUrlRef = useRef("");
  const jobRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = working;
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    jobRef.current += 1;
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null); setProgress(0); setStatus("");
  }

  function changeSetting(action: () => void) { clearResult(); setError(""); action(); }

  function addFiles(files: File[]) {
    const current = itemsRef.current.map((item) => item.file);
    const { accepted, errors } = validateGifImages(files, current);
    if (accepted.length) {
      clearResult();
      setItems((value) => [...value, ...accepted.map((file) => ({
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file, url: URL.createObjectURL(file),
      }))]);
    }
    setError(errors[0] || "");
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    clearResult(); setError("");
    setItems((value) => { const next = [...value]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  function remove(index: number) {
    const item = items[index]; if (!item) return;
    URL.revokeObjectURL(item.url); clearResult(); setError("");
    setItems((value) => value.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearAll() {
    jobRef.current += 1; items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]); clearResult(); setError(""); setWorking(false);
  }

  async function generate() {
    if (items.length < 2 || working) return;
    const canvas = canvasRef.current;
    if (!canvas) { setError("浏览器无法创建GIF画布"); return; }
    clearResult(); setError(""); setWorking(true); setProgress(0);
    const job = ++jobRef.current;
    const bitmaps: ImageBitmap[] = [];
    try {
      for (let index = 0; index < items.length; index++) {
        setStatus(`正在读取第 ${index + 1} / ${items.length} 张图片`);
        const bitmap = await createImageBitmap(items[index].file, { imageOrientation: "from-image" });
        if (job !== jobRef.current) { bitmap.close(); return; }
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > imagesToGifLimits.maxPixels) {
          bitmap.close(); throw new Error(`${items[index].file.name}：图片尺寸无效或超过4000万像素`);
        }
        bitmaps.push(bitmap);
      }
      const size = gifCanvasSize(bitmaps[0].width, bitmaps[0].height, requestedWidth);
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!context) throw new Error("浏览器无法创建GIF画布");
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
      const gif = GIFEncoder();
      for (let index = 0; index < bitmaps.length; index++) {
        if (job !== jobRef.current) return;
        context.fillStyle = background; context.fillRect(0, 0, size.width, size.height);
        const rect = gifFrameRect(bitmaps[index].width, bitmaps[index].height, size.width, size.height, fit);
        context.drawImage(bitmaps[index], rect.x, rect.y, rect.width, rect.height);
        const rgba = context.getImageData(0, 0, size.width, size.height).data;
        const palette = quantize(rgba, 192);
        gif.writeFrame(applyPalette(rgba, palette), size.width, size.height, {
          palette, delay, repeat: repeat ? 0 : -1,
        });
        setProgress(Math.round((index + 1) / bitmaps.length * 100));
        setStatus(`正在合成第 ${index + 1} / ${bitmaps.length} 帧`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (job !== jobRef.current) return;
      gif.finish();
      const bytes = gif.bytes();
      if (!bytes.length) throw new Error("没有生成GIF数据");
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "image/gif" });
      const url = URL.createObjectURL(blob); resultUrlRef.current = url;
      setResult({ url, name: `images-${items.length}-frames.gif`, size: blob.size, ...size });
      setStatus("GIF合成完成"); setProgress(100);
    } catch (cause) {
      if (job === jobRef.current) { setError(cause instanceof Error ? cause.message : "GIF合成失败，请减少图片或降低输出宽度"); setStatus(""); setProgress(0); }
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close());
      if (job === jobRef.current) setWorking(false);
    }
  }

  return <main className="tool-shell images-gif-shell">
    <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
    <header className="tool-header images-gif-header"><h1>多张图片合成GIF工具</h1><p>按顺序将多张图片合成为GIF动画。</p></header>
    <section className="converter-card images-gif-card" aria-label="多张图片合成GIF" aria-busy={working}>
      <FileDropZone className="image-compressor-picker" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif" multiple disabled={busy} onFiles={addFiles} ariaLabel="选择或拖入多张图片">
        <FiUploadCloud aria-hidden="true" /><strong>选择图片</strong><span>点击选择或拖入多张图片 · {supportedGifImageText} · 最多30张</span>
      </FileDropZone>
      {error && <p className="images-gif-error" role="alert">{error}</p>}
      <div className="images-gif-layout">
        <section className="images-gif-panel" aria-labelledby="images-gif-list-title">
          <div className="images-gif-heading"><div><h2 id="images-gif-list-title">图片顺序</h2><span>{items.length ? `${items.length}张 · ${fileSize(totalSize)}` : "至少选择2张图片"}</span></div>{items.length ? <button type="button" disabled={busy} onClick={clearAll}><FiTrash2 aria-hidden="true" />清空</button> : null}</div>
          {items.length ? <div className="images-gif-list">{items.map((item, index) => <article className="images-gif-item" key={item.id}>
            <span className="images-gif-index">{index + 1}</span><img src={item.url} alt="" /><div><strong title={item.file.name}>{item.file.name}</strong><span>{fileSize(item.file.size)}</span></div>
            <div className="images-gif-order"><button type="button" aria-label={`上移${item.file.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><FiArrowUp aria-hidden="true" /></button><button type="button" aria-label={`下移${item.file.name}`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}><FiArrowDown aria-hidden="true" /></button><button type="button" aria-label={`移除${item.file.name}`} disabled={busy} onClick={() => remove(index)}><FiTrash2 aria-hidden="true" /></button></div>
          </article>)}</div> : <div className="file-tool-empty images-gif-empty"><FiImage aria-hidden="true" /><strong>尚未选择图片</strong><span>选择图片后可调整播放顺序</span></div>}
        </section>
        <section className="images-gif-panel images-gif-settings" aria-labelledby="images-gif-settings-title"><h2 id="images-gif-settings-title">合成设置</h2>
          <fieldset disabled={busy}><label><span>每帧停留时间</span><div className="images-gif-delay"><input type="range" min="100" max="2000" step="50" value={delay} onChange={(event) => changeSetting(() => setDelay(Number(event.target.value)))} /><output>{delay} ms</output></div></label>
            <label><span>最大输出宽度</span><select value={requestedWidth} onChange={(event) => changeSetting(() => setRequestedWidth(Number(event.target.value)))}>{widths.map((width) => <option value={width} key={width}>{width}px</option>)}</select></label>
            <span className="images-gif-fit-label">图片填充方式</span><div className="images-gif-options" role="group" aria-label="图片填充方式"><button type="button" aria-pressed={fit === "contain"} onClick={() => changeSetting(() => setFit("contain"))}>完整显示</button><button type="button" aria-pressed={fit === "cover"} onClick={() => changeSetting(() => setFit("cover"))}>铺满裁剪</button></div>
            <label><span>空白区域颜色</span><input type="color" value={background} onChange={(event) => changeSetting(() => setBackground(event.target.value))} /></label>
            <label className="images-gif-check"><input type="checkbox" checked={repeat} onChange={(event) => changeSetting(() => setRepeat(event.target.checked))} /><span>循环播放</span></label>
          </fieldset>
          <button className="convert-button images-gif-run" type="button" onClick={generate} disabled={items.length < 2 || busy}>{working ? "正在合成…" : "开始合成GIF"}</button>
          {working && <button className="images-gif-cancel" type="button" onClick={() => { jobRef.current += 1; setWorking(false); setStatus("已取消合成"); setProgress(0); }}>取消</button>}
        </section>
      </div>
      <section className="images-gif-result" aria-labelledby="images-gif-result-title"><div className="images-gif-heading"><div><h2 id="images-gif-result-title">GIF预览</h2><span>{result ? `${result.width} × ${result.height} · ${fileSize(result.size)}` : "等待合成"}</span></div>{result && <a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载GIF</a>}</div>
        {status && <div className="images-gif-progress" role="status"><div><span>{status}</span><strong>{progress}%</strong></div><progress max="100" value={progress}>{progress}%</progress></div>}
        {result ? <img src={result.url} alt="合成后的GIF预览" /> : <div className="file-tool-empty result-preview-empty"><FiImage aria-hidden="true" /><strong>GIF会显示在这里</strong><span>选择至少2张图片并完成合成</span></div>}
      </section>
    </section>
    <canvas ref={canvasRef} className="video-gif-canvas" aria-hidden="true" />
  </main>;
}
