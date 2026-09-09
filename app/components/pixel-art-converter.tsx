"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiDownload, FiImage, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import {
  canvasToPng,
  downloadBlob,
  type DitherMode,
  isSupportedRasterImage,
  loadLocalImage,
  maxLocalImagePixels,
  maxLocalImageSize,
  type PaletteEntry,
  quantizeImageData,
  safeBaseName,
  summarizePixels,
} from "../lib/pixel-tools";

type PixelResult = { imageData: ImageData; width: number; height: number; palette: PaletteEntry[] };

function outputScale(result: PixelResult, selectedScale: number) {
  return Math.max(1, Math.min(selectedScale, Math.floor(4096 / Math.max(result.width, result.height))));
}

export default function PixelArtConverter() {
  const sourceUrlRef = useRef("");
  const jobRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelWidth, setPixelWidth] = useState(64);
  const [colorCount, setColorCount] = useState(16);
  const [dither, setDither] = useState<DitherMode>("nearest");
  const [scale, setScale] = useState(8);
  const [result, setResult] = useState<PixelResult | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    jobRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  const drawResult = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const resultScale = outputScale(result, scale);
    canvas.width = result.width * resultScale;
    canvas.height = result.height * resultScale;
    const context = canvas.getContext("2d");
    if (!context) return;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = result.width;
    sourceCanvas.height = result.height;
    sourceCanvas.getContext("2d")?.putImageData(result.imageData, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  }, [result, scale]);

  useEffect(() => drawResult(), [drawResult]);

  function invalidate() {
    jobRef.current += 1;
    setResult(null);
    setWorking(false);
    setMessage("");
  }

  async function selectImage(nextFile: File) {
    invalidate();
    if (!nextFile.size || nextFile.size > maxLocalImageSize || !isSupportedRasterImage(nextFile)) {
      setMessage("请选择 25 MB 以内的 PNG、JPG、WebP、BMP、AVIF 或 GIF 图片。");
      return;
    }
    const job = ++jobRef.current;
    const url = URL.createObjectURL(nextFile);
    try {
      const nextImage = await loadLocalImage(url);
      if (job !== jobRef.current) return URL.revokeObjectURL(url);
      if (nextImage.naturalWidth * nextImage.naturalHeight > maxLocalImagePixels) throw new Error("图片像素过大，请缩小到 4000 万像素以内。");
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = url;
      setFile(nextFile);
      setImage(nextImage);
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(error instanceof Error ? error.message : "无法读取这张图片。");
    }
  }

  async function generate() {
    if (!image || working) return;
    const job = ++jobRef.current;
    setWorking(true);
    setMessage("正在生成像素画…");
    try {
      let width = Math.max(8, Math.min(pixelWidth, image.naturalWidth));
      let height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
      if (height > 512) {
        height = 512;
        width = Math.max(1, Math.round(height * image.naturalWidth / image.naturalHeight));
      }
      const samplingCanvas = document.createElement("canvas");
      samplingCanvas.width = width;
      samplingCanvas.height = height;
      const context = samplingCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法创建图片画布。");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      const quantized = await quantizeImageData(context.getImageData(0, 0, width, height), colorCount, dither);
      if (job !== jobRef.current) return;
      setResult({ imageData: quantized, width, height, palette: summarizePixels(quantized, "P") });
      setMessage("像素画已生成。");
    } catch (error) {
      if (job === jobRef.current) setMessage(error instanceof Error ? error.message : "像素画生成失败。");
    } finally {
      if (job === jobRef.current) setWorking(false);
    }
  }

  async function download() {
    if (!canvasRef.current || !file || !result) return;
    drawResult();
    try {
      downloadBlob(await canvasToPng(canvasRef.current), `${safeBaseName(file.name)}-像素画.png`);
      setMessage("像素画 PNG 已下载。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "下载失败。");
    }
  }

  return (
    <UtilityShell title="图片转像素画工具" description="将照片量化为清晰像素画，可控制像素尺寸、色数和抖动效果。">
      <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp,image/bmp,image/avif,image/gif" ariaLabel="选择或拖入图片生成像素画" onFile={selectImage} disabled={working}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{file ? "重新选择图片" : "选择图片 / 拖入文件"}</strong>
        <span>{file ? file.name : "支持 PNG、JPG、WebP 等格式，最大 25 MB"}</span>
      </FileDropZone>

      <div className="utility-columns pixel-tool-columns">
        <section className="utility-panel utility-controls" aria-labelledby="pixel-art-settings-title">
          <h2 id="pixel-art-settings-title">像素画设置</h2>
          <label className="utility-range-control"><span>像素宽度<output>{pixelWidth} 格</output></span><input type="range" min="8" max="256" step="1" value={pixelWidth} disabled={working} onChange={(event) => { setPixelWidth(+event.target.value); invalidate(); }} /></label>
          <label className="utility-range-control"><span>颜色数量<output>{colorCount} 色</output></span><input type="range" min="2" max="64" step="1" value={colorCount} disabled={working} onChange={(event) => { setColorCount(+event.target.value); invalidate(); }} /></label>
          <label>抖动方式<select value={dither} disabled={working} onChange={(event) => { setDither(event.target.value as DitherMode); invalidate(); }}><option value="nearest">不抖动，边缘清晰</option><option value="floyd-steinberg">Floyd–Steinberg</option><option value="atkinson">Atkinson</option></select></label>
          <label>导出放大倍数<select value={scale} disabled={working} onChange={(event) => setScale(+event.target.value)}><option value="1">1× 原始像素格</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label>
          <button className="primary-button" type="button" disabled={!image || working} onClick={() => void generate()}><FiRefreshCw aria-hidden="true" />{working ? "正在生成…" : result ? "重新生成像素画" : "生成像素画"}</button>
          <p className="utility-muted">颜色量化使用 image-q 的 WuQuant 与 CIEDE2000 色差算法。</p>
        </section>

        <section className="utility-panel utility-controls pixel-result-panel" aria-labelledby="pixel-art-result-title">
          <div className="utility-heading"><h2 id="pixel-art-result-title">像素画预览</h2>{result ? <span className="utility-muted">{result.width} × {result.height} 格</span> : null}</div>
          <div className="pixel-canvas-preview">
            {result ? <canvas ref={canvasRef} aria-label="生成的像素画" /> : <div className="utility-empty"><span><FiImage aria-hidden="true" /><strong>像素画预览</strong><small>选择图片并生成后在这里查看</small></span></div>}
          </div>
          {result ? <div className="pixel-palette-strip" aria-label="像素画配色">{result.palette.slice(0, 24).map((entry) => <span key={entry.hex} title={`${entry.hex} · ${entry.percentage.toFixed(1)}%`} style={{ background: entry.hex }} />)}</div> : null}
          <button className="primary-button" type="button" disabled={!result} onClick={() => void download()}><FiDownload aria-hidden="true" />下载像素画 PNG</button>
        </section>
      </div>
      {message ? <p className="utility-muted" role="status">{message}</p> : null}
    </UtilityShell>
  );
}
