"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCopy, FiDownload, FiDroplet, FiUploadCloud } from "react-icons/fi";
import { getPalette, type Color } from "colorthief";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import {
  downloadBlob,
  isSupportedRasterImage,
  loadLocalImage,
  maxLocalImagePixels,
  maxLocalImageSize,
  readableTextColor,
  rgbToHex,
  rgbToHsl,
  safeBaseName,
  type RgbColor,
} from "../lib/pixel-tools";

type ExtractedColor = RgbColor & {
  hex: string;
  percentage: number;
  textColor: string;
};

type PickedPoint = {
  sourceX: number;
  sourceY: number;
  percentX: number;
  percentY: number;
};

function drawPickMarker(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.save();
  context.beginPath();
  context.arc(x, y, radius + 3, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.98)";
  context.lineWidth = Math.max(5, radius * 0.34);
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(16, 27, 34, 0.96)";
  context.lineWidth = Math.max(2, radius * 0.16);
  context.stroke();
  context.beginPath();
  context.moveTo(x - radius * 1.45, y);
  context.lineTo(x + radius * 1.45, y);
  context.moveTo(x, y - radius * 1.45);
  context.lineTo(x, y + radius * 1.45);
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(5, radius * 0.3);
  context.stroke();
  context.strokeStyle = "rgba(16, 27, 34, 0.96)";
  context.lineWidth = Math.max(2, radius * 0.12);
  context.stroke();
  context.restore();
}

function fromColor(color: Color): ExtractedColor {
  const rgb = color.rgb();
  return {
    r: Math.round(rgb.r),
    g: Math.round(rgb.g),
    b: Math.round(rgb.b),
    hex: color.hex().toUpperCase(),
    percentage: color.proportion * 100,
    textColor: color.textColor,
  };
}

export default function ImagePaletteExtractor() {
  const sourceUrlRef = useRef("");
  const jobRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [colorCount, setColorCount] = useState(8);
  const [ignoreWhite, setIgnoreWhite] = useState(false);
  const [palette, setPalette] = useState<ExtractedColor[]>([]);
  const [selected, setSelected] = useState<ExtractedColor | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PickedPoint | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const selectedHsl = useMemo(() => selected ? rgbToHsl(selected) : null, [selected]);

  useEffect(() => () => {
    jobRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  const drawImage = useCallback((source: HTMLImageElement | null = image) => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ratio = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight));
    canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }, [image]);

  useEffect(() => drawImage(), [drawImage]);

  async function extract(source: HTMLImageElement) {
    const job = ++jobRef.current;
    setWorking(true);
    setMessage("正在提取图片配色…");
    try {
      const colors = await getPalette(source, {
        colorCount,
        quality: 4,
        colorSpace: "oklch",
        ignoreWhite,
      });
      if (job !== jobRef.current) return;
      const nextPalette = (colors ?? []).map(fromColor);
      if (!nextPalette.length) throw new Error("没有提取到有效颜色，请尝试关闭“忽略近白色”。");
      setPalette(nextPalette);
      setSelected(nextPalette[0]);
      setSelectedPoint(null);
      window.setTimeout(() => drawImage(source), 0);
      setMessage(`已提取 ${nextPalette.length} 种代表色，可点击图片继续取色。`);
    } catch (error) {
      if (job === jobRef.current) {
        setPalette([]);
        setSelected(null);
        setSelectedPoint(null);
        setMessage(error instanceof Error ? error.message : "配色提取失败。");
      }
    } finally {
      if (job === jobRef.current) setWorking(false);
    }
  }

  async function selectImage(nextFile: File) {
    jobRef.current += 1;
    setPalette([]);
    setSelected(null);
    setSelectedPoint(null);
    setMessage("");
    if (!nextFile.size || nextFile.size > maxLocalImageSize || !isSupportedRasterImage(nextFile)) {
      setMessage("请选择 25 MB 以内的 PNG、JPG、WebP、BMP、AVIF 或 GIF 图片。");
      return;
    }
    const url = URL.createObjectURL(nextFile);
    const job = ++jobRef.current;
    try {
      const nextImage = await loadLocalImage(url);
      if (job !== jobRef.current) return URL.revokeObjectURL(url);
      if (nextImage.naturalWidth * nextImage.naturalHeight > maxLocalImagePixels) throw new Error("图片像素过大，请缩小到 4000 万像素以内。");
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = url;
      setFile(nextFile);
      setImage(nextImage);
      window.setTimeout(() => drawImage(nextImage), 0);
      await extract(nextImage);
    } catch (error) {
      URL.revokeObjectURL(url);
      setWorking(false);
      setMessage(error instanceof Error ? error.message : "无法读取这张图片。");
    }
  }

  function pickColor(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((clientX - bounds.left) / bounds.width * canvas.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((clientY - bounds.top) / bounds.height * canvas.height)));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    // 每次先恢复原图再采样，避免上一次定位标记污染像素颜色。
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(x, y, 1, 1).data;
    if (!data) return;
    const color = { r: data[0], g: data[1], b: data[2] };
    const sourceX = Math.min(image.naturalWidth - 1, Math.floor(x / canvas.width * image.naturalWidth));
    const sourceY = Math.min(image.naturalHeight - 1, Math.floor(y / canvas.height * image.naturalHeight));
    const point = {
      sourceX,
      sourceY,
      percentX: Math.round((sourceX + 0.5) / image.naturalWidth * 1000) / 10,
      percentY: Math.round((sourceY + 0.5) / image.naturalHeight * 1000) / 10,
    };
    // 标记保持约 15 CSS 像素半径，图片缩放后依然清楚可见。
    const markerRadius = Math.max(12, 15 * canvas.width / bounds.width);
    drawPickMarker(context, x, y, markerRadius);
    setSelected({ ...color, hex: rgbToHex(color), percentage: 0, textColor: readableTextColor(color) });
    setSelectedPoint(point);
    setMessage(`已标记原图坐标 X ${sourceX + 1}、Y ${sourceY + 1}。`);
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(success);
    } catch {
      setMessage("复制失败，请手动选择颜色值复制。");
    }
  }

  function cssText() {
    return `:root {\n${palette.map((color, index) => `  --image-color-${index + 1}: ${color.hex};`).join("\n")}\n}`;
  }

  function downloadCss() {
    if (!file || !palette.length) return;
    downloadBlob(new Blob([cssText()], { type: "text/css;charset=utf-8" }), `${safeBaseName(file.name)}-配色.css`);
    setMessage("CSS 配色文件已下载。");
  }

  return (
    <UtilityShell title="图片取色与配色提取工具" description="点击图片精确取色，并自动提取主色、HEX、RGB 与 HSL 配色。">
      <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp,image/bmp,image/avif,image/gif" ariaLabel="选择或拖入图片提取配色" onFile={selectImage} disabled={working}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{file ? "重新选择图片" : "选择图片 / 拖入文件"}</strong>
        <span>{file ? file.name : "支持 PNG、JPG、WebP 等格式，最大 25 MB"}</span>
      </FileDropZone>

      <div className="utility-columns palette-tool-columns">
        <section className="utility-panel utility-controls" aria-labelledby="palette-image-title">
          <div className="utility-heading"><h2 id="palette-image-title">图片取色</h2><span className="utility-muted"><FiDroplet aria-hidden="true" /> 点击图片选取颜色</span></div>
          <div className="palette-image-preview">
            {image ? <canvas ref={canvasRef} aria-label="可点击取色的图片" onPointerDown={(event) => pickColor(event.clientX, event.clientY)} /> : <div className="utility-empty"><span><FiDroplet aria-hidden="true" /><strong>图片取色</strong><small>选择图片后可点击任意位置读取颜色</small></span></div>}
          </div>
          {selected ? <div className="picked-color-card">
            <div className="picked-color-swatch" style={{ background: selected.hex, color: selected.textColor }}><strong>{selected.hex}</strong></div>
            {selectedPoint ? <div className="picked-color-position"><span>已选位置</span><strong>X {selectedPoint.sourceX + 1} · Y {selectedPoint.sourceY + 1}</strong><small>横向 {selectedPoint.percentX}% · 纵向 {selectedPoint.percentY}%</small></div> : null}
            <div><span>RGB</span><strong>{selected.r}, {selected.g}, {selected.b}</strong></div>
            <div><span>HSL</span><strong>{selectedHsl ? `${selectedHsl.h}°, ${selectedHsl.s}%, ${selectedHsl.l}%` : "—"}</strong></div>
            <button type="button" onClick={() => void copy(selected.hex, "HEX 色值已复制。")}><FiCopy aria-hidden="true" />复制 HEX</button>
          </div> : null}
        </section>

        <section className="utility-panel utility-controls" aria-labelledby="palette-settings-title">
          <h2 id="palette-settings-title">配色提取</h2>
          <label className="utility-range-control"><span>提取数量<output>{colorCount} 色</output></span><input type="range" min="2" max="20" step="1" value={colorCount} disabled={working} onChange={(event) => { setColorCount(+event.target.value); setPalette([]); }} /></label>
          <label className="utility-checkbox pixel-tool-checkbox"><input type="checkbox" checked={ignoreWhite} disabled={working} onChange={(event) => { setIgnoreWhite(event.target.checked); setPalette([]); }} />忽略近白色背景</label>
          <button className="primary-button" type="button" disabled={!image || working} onClick={() => image && void extract(image)}>{working ? "正在提取…" : "重新提取配色"}</button>
          <div className="palette-export-actions">
            <button type="button" disabled={!palette.length} onClick={() => void copy(cssText(), "CSS 变量已复制。")}><FiCopy aria-hidden="true" />复制 CSS</button>
            <button type="button" disabled={!palette.length} onClick={downloadCss}><FiDownload aria-hidden="true" />下载 CSS</button>
          </div>
          <p className="utility-muted">配色使用 OKLCH 感知色彩空间归纳，更接近人眼对颜色差异的感受。</p>
        </section>
      </div>

      <section className="utility-panel extracted-palette-panel" aria-labelledby="extracted-palette-title">
        <div className="utility-heading"><h2 id="extracted-palette-title">提取的配色</h2><span className="utility-muted">点击色块查看并复制</span></div>
        {palette.length ? <div className="extracted-palette-grid">{palette.map((color, index) => <button type="button" key={`${color.hex}-${index}`} onClick={() => { setSelected(color); setSelectedPoint(null); drawImage(); }} aria-label={`选择颜色 ${color.hex}`}>
          <span style={{ background: color.hex, color: color.textColor }}>{index + 1}</span>
          <strong>{color.hex}</strong>
          <small>RGB {color.r}, {color.g}, {color.b}</small>
          <output>{color.percentage > 0 ? `${color.percentage.toFixed(1)}%` : "代表色"}</output>
        </button>)}</div> : <div className="utility-empty compact">选择图片后自动提取代表色</div>}
      </section>
      {message ? <p className="utility-muted" role="status">{message}</p> : null}
    </UtilityShell>
  );
}
