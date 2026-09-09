"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiGrid, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import {
  canvasToPng,
  downloadBlob,
  isSupportedRasterImage,
  loadLocalImage,
  maxLocalImagePixels,
  maxLocalImageSize,
  type PaletteEntry,
  quantizeImageData,
  readableTextColor,
  rgbToHex,
  safeBaseName,
  summarizePixels,
} from "../lib/pixel-tools";

type BeadResult = { imageData: ImageData; width: number; height: number; palette: PaletteEntry[] };

export default function BeadPatternGenerator() {
  const sourceUrlRef = useRef("");
  const jobRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [beadWidth, setBeadWidth] = useState(48);
  const [colorCount, setColorCount] = useState(18);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCodes, setShowCodes] = useState(true);
  const [result, setResult] = useState<BeadResult | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const totalBeads = useMemo(() => result?.palette.reduce((sum, entry) => sum + entry.count, 0) ?? 0, [result]);

  useEffect(() => () => {
    jobRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  const drawPattern = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const cellSize = result.width <= 64 ? 28 : result.width <= 84 ? 22 : 18;
    canvas.width = result.width * cellSize + 1;
    canvas.height = result.height * cellSize + 1;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const codeByHex = new Map(result.palette.map((entry) => [entry.hex, entry]));
    const { data } = result.imageData;

    for (let row = 0; row < result.height; row += 1) {
      for (let column = 0; column < result.width; column += 1) {
        const index = (row * result.width + column) * 4;
        if (data[index + 3] < 16) continue;
        const color = { r: data[index], g: data[index + 1], b: data[index + 2] };
        const entry = codeByHex.get(rgbToHex(color));
        const centerX = column * cellSize + cellSize / 2;
        const centerY = row * cellSize + cellSize / 2;
        context.beginPath();
        context.arc(centerX, centerY, cellSize * 0.39, 0, Math.PI * 2);
        context.fillStyle = entry?.hex ?? rgbToHex(color);
        context.fill();
        context.strokeStyle = "rgba(32, 54, 65, .18)";
        context.lineWidth = 1;
        context.stroke();
        if (showCodes && entry && cellSize >= 22) {
          context.fillStyle = readableTextColor(entry);
          context.font = `700 ${Math.max(7, cellSize * 0.27)}px Arial, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(entry.code.replace(/^C0?/, ""), centerX, centerY + 0.5);
        }
      }
    }

    if (showGrid) {
      context.beginPath();
      context.strokeStyle = "rgba(32, 54, 65, .16)";
      context.lineWidth = 1;
      for (let column = 0; column <= result.width; column += 1) {
        context.moveTo(column * cellSize + 0.5, 0);
        context.lineTo(column * cellSize + 0.5, canvas.height);
      }
      for (let row = 0; row <= result.height; row += 1) {
        context.moveTo(0, row * cellSize + 0.5);
        context.lineTo(canvas.width, row * cellSize + 0.5);
      }
      context.stroke();
    }
  }, [result, showCodes, showGrid]);

  useEffect(() => drawPattern(), [drawPattern]);

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
    setMessage("正在生成拼豆图纸…");
    try {
      let width = Math.max(8, Math.min(beadWidth, image.naturalWidth));
      let height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
      if (height > 160) {
        height = 160;
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
      const source = context.getImageData(0, 0, width, height);
      if (removeWhite) {
        for (let index = 0; index < source.data.length; index += 4) {
          if (source.data[index + 3] < 32 || (source.data[index] > 245 && source.data[index + 1] > 245 && source.data[index + 2] > 245)) source.data[index + 3] = 0;
        }
      }
      const quantized = await quantizeImageData(source, colorCount, "nearest");
      if (job !== jobRef.current) return;
      setResult({ imageData: quantized, width, height, palette: summarizePixels(quantized, "C") });
      setMessage("拼豆图纸已生成。");
    } catch (error) {
      if (job === jobRef.current) setMessage(error instanceof Error ? error.message : "拼豆图纸生成失败。");
    } finally {
      if (job === jobRef.current) setWorking(false);
    }
  }

  async function download() {
    if (!canvasRef.current || !file || !result) return;
    drawPattern();
    try {
      downloadBlob(await canvasToPng(canvasRef.current), `${safeBaseName(file.name)}-拼豆图纸.png`);
      setMessage("拼豆图纸 PNG 已下载。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "下载失败。");
    }
  }

  return (
    <UtilityShell title="拼豆图纸生成工具" description="把图片转换为带网格、编号和用量统计的拼豆图纸。">
      <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp,image/bmp,image/avif,image/gif" ariaLabel="选择或拖入图片生成拼豆图纸" onFile={selectImage} disabled={working}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{file ? "重新选择图片" : "选择图片 / 拖入文件"}</strong>
        <span>{file ? file.name : "支持 PNG、JPG、WebP 等格式，最大 25 MB"}</span>
      </FileDropZone>

      <div className="utility-columns pixel-tool-columns">
        <section className="utility-panel utility-controls" aria-labelledby="bead-preview-title">
          <div className="utility-heading"><h2 id="bead-preview-title">图纸预览</h2>{result ? <span className="utility-muted">{result.width} × {result.height} 格</span> : null}</div>
          <div className="pixel-canvas-preview bead-canvas-preview">
            {result ? <canvas ref={canvasRef} aria-label="拼豆图纸预览" /> : <div className="utility-empty"><span><FiGrid aria-hidden="true" /><strong>拼豆图纸</strong><small>选择图片并生成后显示带编号图纸</small></span></div>}
          </div>
          <button className="primary-button" type="button" disabled={!result} onClick={() => void download()}><FiDownload aria-hidden="true" />下载 PNG 图纸</button>
        </section>

        <section className="utility-panel utility-controls" aria-labelledby="bead-settings-title">
          <h2 id="bead-settings-title">图纸设置</h2>
          <label className="utility-range-control"><span>横向豆数<output>{beadWidth} 颗</output></span><input type="range" min="8" max="100" step="1" value={beadWidth} disabled={working} onChange={(event) => { setBeadWidth(+event.target.value); invalidate(); }} /></label>
          <label className="utility-range-control"><span>最多颜色<output>{colorCount} 色</output></span><input type="range" min="4" max="32" step="1" value={colorCount} disabled={working} onChange={(event) => { setColorCount(+event.target.value); invalidate(); }} /></label>
          <label className="utility-checkbox pixel-tool-checkbox"><input type="checkbox" checked={removeWhite} disabled={working} onChange={(event) => { setRemoveWhite(event.target.checked); invalidate(); }} />将纯白和透明背景视为空位</label>
          <label className="utility-checkbox pixel-tool-checkbox"><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />显示格线</label>
          <label className="utility-checkbox pixel-tool-checkbox"><input type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} />在豆格中显示编号</label>
          <button className="primary-button" type="button" disabled={!image || working} onClick={() => void generate()}>{working ? "正在生成…" : "生成拼豆图纸"}</button>
          <p className="utility-muted">颜色采用图纸内自动编号，并非特定拼豆品牌的官方色号。</p>
        </section>
      </div>

      <section className="utility-panel bead-palette-panel" aria-labelledby="bead-palette-title">
        <div className="utility-heading"><h2 id="bead-palette-title">颜色与用量</h2><span className="utility-muted">共 {totalBeads.toLocaleString("zh-CN")} 颗</span></div>
        {result?.palette.length ? <div className="bead-palette-list">{result.palette.map((entry) => <div className="bead-palette-item" key={entry.code}><i style={{ background: entry.hex }} /><strong>{entry.code}</strong><span>{entry.hex}</span><output>{entry.count.toLocaleString("zh-CN")} 颗</output></div>)}</div> : <div className="utility-empty compact">生成图纸后显示颜色编号和用量</div>}
      </section>
      {message ? <p className="utility-muted" role="status">{message}</p> : null}
    </UtilityShell>
  );
}
