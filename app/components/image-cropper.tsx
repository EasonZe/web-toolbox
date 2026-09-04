"use client";

/* eslint-disable @next/next/no-img-element -- 裁剪结果预览来自本地 Blob URL。 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FiCrop, FiDownload, FiImage, FiRotateCcw, FiRotateCw, FiUploadCloud } from "react-icons/fi";
import { TbFlipHorizontal, TbFlipVertical } from "react-icons/tb";
import {
  createCropFromPoints,
  createInitialCrop,
  imageCropLimits,
  moveCropRect,
  normalizeCropRect,
  supportedCropImageText,
  validateCropImage,
  type CropPoint,
  type CropRect,
} from "../lib/image-cropping";
import { FileDropZone } from "./file-drop-zone";

type LoadedImage = {
  file: File;
  url: string;
  width: number;
  height: number;
};

type CropResult = {
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
};

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";
type RatioKey = "free" | "original" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
type PointerAction =
  | { type: "move"; start: CropPoint; initial: CropRect }
  | { type: "resize"; anchor: CropPoint };

const acceptedImages = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif";
const ratioOptions: Array<{ key: RatioKey; label: string }> = [
  { key: "free", label: "自由" },
  { key: "original", label: "原图" },
  { key: "1:1", label: "1:1" },
  { key: "4:3", label: "4:3" },
  { key: "3:4", label: "3:4" },
  { key: "16:9", label: "16:9" },
  { key: "9:16", label: "9:16" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ratioValue(key: RatioKey, image: { width: number; height: number } | null) {
  if (key === "free") return null;
  if (key === "original") return image ? image.width / image.height : null;
  const [width, height] = key.split(":").map(Number);
  return width / height;
}

function previewDimensions(width: number, height: number) {
  const scale = Math.min(1, 1100 / width, 760 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function outputExtension(format: OutputFormat) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/webp") return "webp";
  return "png";
}

function canvasToBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("浏览器无法导出裁剪图片")),
      format,
      format === "image/png" ? undefined : quality / 100,
    );
  });
}

async function decodeImage(file: File, url: string) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // 部分移动浏览器不支持此格式的 createImageBitmap，继续使用 img 解码。
    }
  }
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => undefined,
  };
}

export default function ImageCropper() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [ratioKey, setRatioKey] = useState<RatioKey>("free");
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [quality, setQuality] = useState(92);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CropResult | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultUrlRef = useRef("");
  const imageUrlRef = useRef("");
  const pointerActionRef = useRef<PointerAction | null>(null);
  const jobRef = useRef(0);
  const busy = loading || working;
  const activeRatio = useMemo(() => ratioValue(ratioKey, image), [ratioKey, image]);
  const preview = image ? previewDimensions(image.width, image.height) : { width: 1, height: 1 };

  useEffect(() => () => {
    jobRef.current += 1;
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setStatus("");
  }

  function updateCrop(next: CropRect) {
    if (!image) return;
    clearResult();
    setError("");
    setCrop(normalizeCropRect(next, image, activeRatio));
  }

  async function selectImage(file: File) {
    const validationError = validateCropImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const job = ++jobRef.current;
    setLoading(true);
    setError("");
    clearResult();
    const url = URL.createObjectURL(file);
    let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;

    try {
      decoded = await decodeImage(file, url);
      if (job !== jobRef.current) return;
      if (!decoded.width || !decoded.height || decoded.width * decoded.height > imageCropLimits.maxPixels) {
        throw new Error("图片尺寸无效或超过4000万像素");
      }

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = decoded.width;
      sourceCanvas.height = decoded.height;
      const context = sourceCanvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("浏览器无法创建裁剪画布");
      context.drawImage(decoded.source, 0, 0);

      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = url;
      sourceCanvasRef.current = sourceCanvas;
      const nextImage = { file, url, width: decoded.width, height: decoded.height };
      setImage(nextImage);
      setRatioKey("free");
      setCrop(createInitialCrop(nextImage));
      setStatus("图片读取完成");
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (job === jobRef.current) {
        setError(cause instanceof Error ? cause.message : "图片读取失败");
      }
    } finally {
      decoded?.close();
      if (job === jobRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const source = sourceCanvasRef.current;
    if (!canvas || !source || !image || !crop) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scaleX = canvas.width / image.width;
    const scaleY = canvas.height / image.height;
    const x = crop.x * scaleX;
    const y = crop.y * scaleY;
    const width = crop.width * scaleX;
    const height = crop.height * scaleY;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    context.save();
    context.fillStyle = "rgba(10, 20, 26, 0.58)";
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.rect(x, y, width, height);
    context.fill("evenodd");

    context.strokeStyle = "rgba(255,255,255,0.62)";
    context.lineWidth = 1;
    for (let index = 1; index < 3; index += 1) {
      context.beginPath();
      context.moveTo(x + width * index / 3, y);
      context.lineTo(x + width * index / 3, y + height);
      context.moveTo(x, y + height * index / 3);
      context.lineTo(x + width, y + height * index / 3);
      context.stroke();
    }

    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.strokeStyle = "#4e7b94";
    context.lineWidth = 1;
    context.strokeRect(x + 2, y + 2, Math.max(0, width - 4), Math.max(0, height - 4));
    const handles = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
    handles.forEach(([handleX, handleY]) => {
      context.beginPath();
      context.arc(handleX, handleY, 7, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.fill();
      context.strokeStyle = "#4e7b94";
      context.lineWidth = 2;
      context.stroke();
    });
    context.restore();
  }, [crop, image, preview.width, preview.height]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!image) return { x: 0, y: 0 };
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(image.width, Math.max(0, (event.clientX - bounds.left) / bounds.width * image.width)),
      y: Math.min(image.height, Math.max(0, (event.clientY - bounds.top) / bounds.height * image.height)),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!image || !crop || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    clearResult();
    setError("");
    const point = canvasPoint(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const threshold = 22 / Math.max(1, bounds.width) * image.width;
    const corners = [
      { point: { x: crop.x, y: crop.y }, anchor: { x: crop.x + crop.width, y: crop.y + crop.height } },
      { point: { x: crop.x + crop.width, y: crop.y }, anchor: { x: crop.x, y: crop.y + crop.height } },
      { point: { x: crop.x, y: crop.y + crop.height }, anchor: { x: crop.x + crop.width, y: crop.y } },
      { point: { x: crop.x + crop.width, y: crop.y + crop.height }, anchor: { x: crop.x, y: crop.y } },
    ];
    const corner = corners.find((item) => Math.hypot(item.point.x - point.x, item.point.y - point.y) <= threshold);
    if (corner) {
      pointerActionRef.current = { type: "resize", anchor: corner.anchor };
      return;
    }
    const inside = point.x >= crop.x && point.x <= crop.x + crop.width && point.y >= crop.y && point.y <= crop.y + crop.height;
    pointerActionRef.current = inside
      ? { type: "move", start: point, initial: crop }
      : { type: "resize", anchor: point };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const action = pointerActionRef.current;
    if (!action || !image || busy) return;
    event.preventDefault();
    const point = canvasPoint(event);
    if (action.type === "move") {
      setCrop(moveCropRect(action.initial, {
        x: point.x - action.start.x,
        y: point.y - action.start.y,
      }, image));
    } else {
      setCrop(createCropFromPoints(action.anchor, point, image, activeRatio));
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointerActionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function selectRatio(nextKey: RatioKey) {
    setRatioKey(nextKey);
    clearResult();
    setError("");
    if (image) setCrop(createInitialCrop(image, ratioValue(nextKey, image)));
  }

  function changeCropField(field: keyof CropRect, value: number) {
    if (!image || !crop) return;
    const next = { ...crop, [field]: value };
    if (activeRatio && field === "width") next.height = value / activeRatio;
    if (activeRatio && field === "height") next.width = value * activeRatio;
    updateCrop(next);
  }

  function transformSource(action: "clockwise" | "counterclockwise" | "horizontal" | "vertical") {
    const source = sourceCanvasRef.current;
    if (!source || !image || busy) return;
    clearResult();
    setError("");
    const rotated = action === "clockwise" || action === "counterclockwise";
    const next = document.createElement("canvas");
    next.width = rotated ? source.height : source.width;
    next.height = rotated ? source.width : source.height;
    const context = next.getContext("2d", { alpha: true });
    if (!context) {
      setError("浏览器无法旋转图片");
      return;
    }
    if (action === "clockwise") {
      context.translate(next.width, 0);
      context.rotate(Math.PI / 2);
    } else if (action === "counterclockwise") {
      context.translate(0, next.height);
      context.rotate(-Math.PI / 2);
    } else if (action === "horizontal") {
      context.translate(next.width, 0);
      context.scale(-1, 1);
    } else {
      context.translate(0, next.height);
      context.scale(1, -1);
    }
    context.drawImage(source, 0, 0);
    sourceCanvasRef.current = next;
    const nextImage = { ...image, width: next.width, height: next.height };
    setImage(nextImage);
    setCrop(createInitialCrop(nextImage, ratioValue(ratioKey, nextImage)));
    setStatus(rotated ? "图片已旋转" : "图片已翻转");
  }

  async function exportCrop() {
    const source = sourceCanvasRef.current;
    if (!source || !image || !crop || working) return;
    const width = Math.max(1, Math.round(crop.width));
    const height = Math.max(1, Math.round(crop.height));
    setWorking(true);
    setError("");
    clearResult();
    try {
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d", { alpha: true });
      if (!context) throw new Error("浏览器无法创建裁剪画布");
      if (format === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      const blob = await canvasToBlob(output, format, quality);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      const baseName = image.file.name.replace(/\.[^.]+$/, "") || "image";
      setResult({
        url,
        name: `${baseName}-cropped.${outputExtension(format)}`,
        size: blob.size,
        width,
        height,
      });
      setStatus("图片裁剪完成");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片裁剪失败");
      setStatus("");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="tool-shell image-crop-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header image-crop-header">
        <h1>图片裁剪工具</h1>
        <p>拖动裁剪框，保留图片中需要的区域。</p>
      </header>

      <section className="converter-card image-crop-card" aria-label="图片裁剪" aria-busy={busy}>
        <FileDropZone className="image-compressor-picker" accept={acceptedImages} disabled={busy} onFile={selectImage} ariaLabel="选择或拖入图片">
          <FiUploadCloud aria-hidden="true" />
          <strong>{image ? "重新选择图片" : "选择图片"}</strong>
          <span>点击选择或拖入图片 · {supportedCropImageText} · 最大25 MB</span>
        </FileDropZone>

        {error && <p className="image-crop-error" role="alert">{error}</p>}

        <div className="image-crop-workbench">
          <section className="image-crop-panel image-crop-preview-panel" aria-labelledby="image-crop-preview-title">
            <div className="image-crop-heading">
              <div>
                <h2 id="image-crop-preview-title">裁剪预览</h2>
                <span>{image ? `${image.width} × ${image.height} · ${formatFileSize(image.file.size)}` : "等待选择图片"}</span>
              </div>
              {image && crop && <button type="button" disabled={busy} onClick={() => { clearResult(); setCrop(createInitialCrop(image, activeRatio)); }}>重置裁剪框</button>}
            </div>

            {image && crop ? (
              <div className="image-crop-canvas-frame">
                <canvas
                  ref={previewCanvasRef}
                  width={preview.width}
                  height={preview.height}
                  aria-label="可拖动和缩放的图片裁剪预览"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishPointer}
                  onPointerCancel={finishPointer}
                />
                <p>拖动裁剪框移动位置，拖动四角调整大小</p>
              </div>
            ) : (
              <div className="file-tool-empty image-crop-empty">
                <FiCrop aria-hidden="true" />
                <strong>尚未选择图片</strong>
                <span>选择图片后可在这里调整裁剪区域</span>
              </div>
            )}
          </section>

          <section className="image-crop-panel image-crop-settings" aria-labelledby="image-crop-settings-title">
            <h2 id="image-crop-settings-title">裁剪设置</h2>
            <fieldset disabled={!image || busy}>
              <legend>裁剪比例</legend>
              <div className="image-crop-ratios" role="group" aria-label="裁剪比例">
                {ratioOptions.map((option) => (
                  <button type="button" key={option.key} aria-pressed={ratioKey === option.key} onClick={() => selectRatio(option.key)}>{option.label}</button>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={!image || busy}>
              <legend>精确裁剪区域</legend>
              <div className="image-crop-coordinates">
                {(["x", "y", "width", "height"] as Array<keyof CropRect>).map((field) => (
                  <label key={field}>
                    <span>{field === "x" ? "X 坐标" : field === "y" ? "Y 坐标" : field === "width" ? "宽度" : "高度"}</span>
                    <input type="number" min="0" step="1" value={crop ? Math.round(crop[field]) : 0} onChange={(event) => changeCropField(field, Number(event.target.value))} />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={!image || busy}>
              <legend>旋转与翻转</legend>
              <div className="image-crop-transform" role="group" aria-label="旋转与翻转">
                <button type="button" aria-label="向左旋转90度" onClick={() => transformSource("counterclockwise")}><FiRotateCcw aria-hidden="true" />向左旋转</button>
                <button type="button" aria-label="向右旋转90度" onClick={() => transformSource("clockwise")}><FiRotateCw aria-hidden="true" />向右旋转</button>
                <button type="button" onClick={() => transformSource("horizontal")}><TbFlipHorizontal aria-hidden="true" />水平翻转</button>
                <button type="button" onClick={() => transformSource("vertical")}><TbFlipVertical aria-hidden="true" />垂直翻转</button>
              </div>
            </fieldset>

            <label className="image-crop-select">
              <span>输出格式</span>
              <select value={format} disabled={!image || busy} onChange={(event) => { clearResult(); setFormat(event.target.value as OutputFormat); }}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>

            {format !== "image/png" && (
              <label className="image-crop-quality">
                <span>输出质量<output>{quality}%</output></span>
                <input type="range" min="10" max="100" step="1" value={quality} disabled={!image || busy} onChange={(event) => { clearResult(); setQuality(Number(event.target.value)); }} />
              </label>
            )}

            <button className="convert-button image-crop-run" type="button" disabled={!image || !crop || busy} onClick={exportCrop}>
              {working ? "正在裁剪…" : "完成裁剪"}
            </button>
          </section>
        </div>

        <section className="image-crop-result" aria-labelledby="image-crop-result-title">
          <div className="image-crop-heading">
            <div>
              <h2 id="image-crop-result-title">裁剪结果</h2>
              <span>{result ? `${result.width} × ${result.height} · ${formatFileSize(result.size)}` : "等待裁剪"}</span>
            </div>
            {result && <a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载图片</a>}
          </div>
          {status && <p className="image-crop-status" role="status">{status}</p>}
          {result ? (
            <div className="image-crop-result-frame"><img src={result.url} alt="裁剪后的图片预览" /></div>
          ) : (
            <div className="file-tool-empty image-crop-result-empty">
              <FiImage aria-hidden="true" />
              <strong>裁剪后的图片会显示在这里</strong>
              <span>调整裁剪区域并点击完成裁剪</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
