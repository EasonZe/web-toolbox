"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  FiDownload,
  FiImage,
  FiRotateCcw,
  FiRotateCw,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type RedactionMode = "mosaic" | "blur" | "solid";
type OutputFormat = "image/png" | "image/jpeg";
type Point = { x: number; y: number };
type Stroke = {
  mode: RedactionMode;
  points: Point[];
  size: number;
  strength: number;
  color: string;
};

const maxFileSize = 25 * 1024 * 1024;
const maxImagePixels = 24_000_000;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片"));
    image.src = url;
  });
}

function enableHighQualitySmoothing(context: CanvasRenderingContext2D) {
  context.imageSmoothingEnabled = true;
  try {
    context.imageSmoothingQuality = "high";
  } catch {
    // Older mobile browsers support smoothing but not the quality hint.
  }
}

function drawPortableBlur(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  radius: number,
) {
  const blurRadius = Math.max(3, radius);

  if ("filter" in context) {
    context.filter = `blur(${blurRadius}px)`;
    if (context.filter !== "none") {
      context.drawImage(image, 0, 0);
      context.filter = "none";
      return;
    }
  }

  // Safari on iPhone and iPad does not reliably support Canvas 2D filters.
  // Progressive downscaling creates a smooth low-pass blur using only the
  // broadly supported drawImage API, so the exported pixels match the preview.
  const reduction = Math.min(32, Math.max(2, Math.round(blurRadius / 3)));
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = Math.max(1, Math.round(width / reduction));
  blurCanvas.height = Math.max(1, Math.round(height / reduction));
  const blurContext = blurCanvas.getContext("2d");
  if (!blurContext) {
    context.drawImage(image, 0, 0);
    return;
  }

  enableHighQualitySmoothing(blurContext);
  blurContext.drawImage(
    image,
    0,
    0,
    blurCanvas.width,
    blurCanvas.height,
  );
  enableHighQualitySmoothing(context);
  context.drawImage(
    blurCanvas,
    0,
    0,
    blurCanvas.width,
    blurCanvas.height,
    0,
    0,
    width,
    height,
  );
}

export default function SensitiveRedactor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const sourceUrlRef = useRef("");
  const effectCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const activeStrokeRef = useRef<Stroke | null>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<RedactionMode>("mosaic");
  const [brushSize, setBrushSize] = useState(72);
  const [strength, setStrength] = useState(18);
  const [coverColor, setCoverColor] = useState("#111111");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<Stroke[]>([]);
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>("image/png");
  const [quality, setQuality] = useState(92);
  const [drawing, setDrawing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  const getEffectCanvas = useCallback((stroke: Stroke) => {
    const image = sourceImageRef.current;
    if (!image || stroke.mode === "solid") return null;

    const key = `${stroke.mode}-${Math.round(stroke.strength)}`;
    const cached = effectCacheRef.current.get(key);
    if (cached) return cached;

    const effectCanvas = document.createElement("canvas");
    effectCanvas.width = image.naturalWidth;
    effectCanvas.height = image.naturalHeight;
    const context = effectCanvas.getContext("2d");
    if (!context) return null;

    if (stroke.mode === "mosaic") {
      const blockSize = Math.max(4, Math.round(stroke.strength));
      const smallCanvas = document.createElement("canvas");
      smallCanvas.width = Math.max(1, Math.ceil(effectCanvas.width / blockSize));
      smallCanvas.height = Math.max(1, Math.ceil(effectCanvas.height / blockSize));
      const smallContext = smallCanvas.getContext("2d");
      if (!smallContext) return null;
      smallContext.imageSmoothingEnabled = true;
      smallContext.drawImage(image, 0, 0, smallCanvas.width, smallCanvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        smallCanvas,
        0,
        0,
        smallCanvas.width,
        smallCanvas.height,
        0,
        0,
        effectCanvas.width,
        effectCanvas.height,
      );
    } else {
      drawPortableBlur(
        context,
        image,
        effectCanvas.width,
        effectCanvas.height,
        stroke.strength,
      );
    }

    effectCacheRef.current.set(key, effectCanvas);
    return effectCanvas;
  }, []);

  const paintStroke = useCallback(
    (context: CanvasRenderingContext2D, stroke: Stroke) => {
      if (stroke.points.length === 0) return;

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = stroke.size;

      if (stroke.mode === "solid") {
        context.strokeStyle = stroke.color;
        context.fillStyle = stroke.color;
      } else {
        const effectCanvas = getEffectCanvas(stroke);
        if (!effectCanvas) {
          context.restore();
          return;
        }
        const pattern = context.createPattern(effectCanvas, "no-repeat");
        if (!pattern) {
          context.restore();
          return;
        }
        context.strokeStyle = pattern;
        context.fillStyle = pattern;
      }

      if (stroke.points.length === 1) {
        const point = stroke.points[0];
        context.beginPath();
        context.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (const point of stroke.points.slice(1)) {
          context.lineTo(point.x, point.y);
        }
        context.stroke();
      }
      context.restore();
    },
    [getEffectCanvas],
  );

  const renderStrokes = useCallback(
    (nextStrokes: Stroke[]) => {
      const canvas = canvasRef.current;
      const image = sourceImageRef.current;
      if (!canvas || !image) return;

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      for (const stroke of nextStrokes) paintStroke(context, stroke);
    },
    [paintStroke],
  );

  useEffect(() => {
    if (!sourceImage) return;
    renderStrokes(strokes);
  }, [renderStrokes, sourceImage, strokes]);

  async function handleSourceFile(file: File) {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|bmp|avif)$/i.test(file.name);
    if (!looksLikeImage) {
      setMessage("请选择PNG、JPG、WebP等图片文件。");
      return;
    }
    if (file.size > maxFileSize) {
      setMessage("图片不能超过25 MB。");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(nextUrl);
      if (image.naturalWidth * image.naturalHeight > maxImagePixels) {
        URL.revokeObjectURL(nextUrl);
        setMessage("图片像素过大，请使用不超过2400万像素的图片。");
        return;
      }

      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = nextUrl;
      sourceImageRef.current = image;
      effectCacheRef.current.clear();
      setSourceFile(file);
      setSourceImage(image);
      setStrokes([]);
      setRedoStrokes([]);
      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      setMessage(error instanceof Error ? error.message : "图片读取失败。");
    }
  }

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      point: {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      },
      scale: canvas.width / rect.width,
    };
  }

  function updateCursor(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    if (!canvas || !cursor) return;
    const rect = canvas.getBoundingClientRect();
    cursor.style.width = `${brushSize}px`;
    cursor.style.height = `${brushSize}px`;
    cursor.style.transform = `translate(${event.clientX - rect.left - brushSize / 2}px, ${event.clientY - rect.top - brushSize / 2}px)`;
    cursor.dataset.visible = "true";
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!sourceImage || event.button !== 0) return;
    const location = getCanvasPoint(event);
    if (!location) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextStroke: Stroke = {
      mode,
      points: [location.point],
      size: brushSize * location.scale,
      strength: strength * location.scale,
      color: coverColor,
    };
    activeStrokeRef.current = nextStroke;
    setDrawing(true);
    const context = canvasRef.current?.getContext("2d");
    if (context) paintStroke(context, nextStroke);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    updateCursor(event);
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;
    const location = getCanvasPoint(event);
    if (!location) return;
    event.preventDefault();
    const previous = activeStroke.points.at(-1);
    activeStroke.points.push(location.point);
    if (!previous) return;
    const context = canvasRef.current?.getContext("2d");
    if (context) {
      paintStroke(context, {
        ...activeStroke,
        points: [previous, location.point],
      });
    }
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeStrokeRef.current = null;
    setDrawing(false);
    setStrokes((current) => [...current, activeStroke]);
    setRedoStrokes([]);
  }

  function undo() {
    if (strokes.length === 0 || drawing) return;
    const removed = strokes.at(-1);
    if (!removed) return;
    const nextStrokes = strokes.slice(0, -1);
    setStrokes(nextStrokes);
    setRedoStrokes((current) => [...current, removed]);
    renderStrokes(nextStrokes);
  }

  function redo() {
    if (redoStrokes.length === 0 || drawing) return;
    const restored = redoStrokes.at(-1);
    if (!restored) return;
    const nextStrokes = [...strokes, restored];
    setStrokes(nextStrokes);
    setRedoStrokes((current) => current.slice(0, -1));
    renderStrokes(nextStrokes);
  }

  function clearRedactions() {
    if (drawing || strokes.length === 0) return;
    setStrokes([]);
    setRedoStrokes([]);
    renderStrokes([]);
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || !sourceFile || !sourceImage) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("图片导出失败，请重试。");
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const baseName = sourceFile.name.replace(/\.[^.]+$/, "") || "image";
        anchor.href = url;
        anchor.download = `${baseName}-已打码.${outputFormat === "image/png" ? "png" : "jpg"}`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      outputFormat,
      outputFormat === "image/jpeg" ? quality / 100 : undefined,
    );
  }

  return (
    <main className="tool-shell sensitive-redactor-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header sensitive-redactor-header">
        <h1>敏感内容打码工具</h1>
        <p>手动涂抹需要隐藏的区域。</p>
      </header>

      <section className="converter-card sensitive-redactor-card" aria-label="敏感内容打码">
        <FileDropZone
          className="video-file-picker sensitive-redactor-picker"
          accept="image/*"
          onFile={handleSourceFile}
          ariaLabel="选择或拖入图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{sourceFile ? "重新选择图片" : "选择图片"}</strong>
          <span>点击选择或拖入图片，支持PNG、JPG、WebP等格式，最大25 MB</span>
        </FileDropZone>

        <div className="sensitive-redactor-workbench">
          <section className="sensitive-redactor-preview" aria-labelledby="redactor-preview-title">
            <div className="sensitive-redactor-section-heading">
              <div>
                <h2 id="redactor-preview-title">打码预览</h2>
                <span>
                  {sourceImage && sourceFile
                    ? `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight} · ${formatFileSize(sourceFile.size)}`
                    : "尚未选择图片"}
                </span>
              </div>
              <div className="redactor-history-actions" aria-label="编辑历史">
                <button type="button" onClick={undo} disabled={!sourceImage || strokes.length === 0 || drawing} aria-label="撤销" title="撤销">
                  <FiRotateCcw aria-hidden="true" />
                </button>
                <button type="button" onClick={redo} disabled={!sourceImage || redoStrokes.length === 0 || drawing} aria-label="重做" title="重做">
                  <FiRotateCw aria-hidden="true" />
                </button>
                <button type="button" onClick={clearRedactions} disabled={!sourceImage || strokes.length === 0 || drawing} aria-label="清空打码" title="清空打码">
                  <FiTrash2 aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="sensitive-redactor-canvas-frame">
              {sourceImage ? (
                <div className="sensitive-redactor-canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    aria-label="图片打码编辑区域"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishStroke}
                    onPointerCancel={finishStroke}
                    onPointerEnter={updateCursor}
                    onPointerLeave={() => {
                      if (cursorRef.current) cursorRef.current.dataset.visible = "false";
                    }}
                  />
                  <span className="redactor-brush-cursor" ref={cursorRef} aria-hidden="true" />
                </div>
              ) : (
                <div className="file-tool-empty image-preview-empty">
                  <FiImage aria-hidden="true" />
                  <strong>图片编辑区域</strong>
                  <span>选择图片后，用鼠标或手指涂抹需要隐藏的内容</span>
                </div>
              )}
            </div>
          </section>

          <section className="sensitive-redactor-settings" aria-labelledby="redactor-settings-title">
            <h2 id="redactor-settings-title">打码设置</h2>

            <fieldset className="redactor-mode-options" disabled={!sourceImage || drawing}>
              <legend>打码方式</legend>
              <div>
                <button className={mode === "mosaic" ? "is-selected" : ""} type="button" onClick={() => setMode("mosaic")} aria-pressed={mode === "mosaic"}>马赛克</button>
                <button className={mode === "blur" ? "is-selected" : ""} type="button" onClick={() => setMode("blur")} aria-pressed={mode === "blur"}>模糊</button>
                <button className={mode === "solid" ? "is-selected" : ""} type="button" onClick={() => setMode("solid")} aria-pressed={mode === "solid"}>遮挡</button>
              </div>
            </fieldset>

            <label className="redactor-range-control">
              <span>画笔大小 <strong>{brushSize}px</strong></span>
              <input type="range" min="24" max="180" value={brushSize} disabled={!sourceImage || drawing} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>

            {mode === "solid" ? (
              <label className="redactor-color-control">
                <span>遮挡颜色</span>
                <span>
                  <input type="color" value={coverColor} disabled={!sourceImage || drawing} onChange={(event) => setCoverColor(event.target.value)} />
                  <code>{coverColor.toUpperCase()}</code>
                </span>
              </label>
            ) : (
              <label className="redactor-range-control">
                <span>{mode === "mosaic" ? "像素颗粒" : "模糊强度"} <strong>{strength}px</strong></span>
                <input type="range" min="6" max="48" value={strength} disabled={!sourceImage || drawing} onChange={(event) => setStrength(Number(event.target.value))} />
              </label>
            )}

            <div className="redactor-export-grid">
              <label>
                <span>导出格式</span>
                <select value={outputFormat} disabled={!sourceImage || drawing} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPG</option>
                </select>
              </label>
              {outputFormat === "image/jpeg" ? (
                <label>
                  <span>图片质量</span>
                  <select value={quality} disabled={!sourceImage || drawing} onChange={(event) => setQuality(Number(event.target.value))}>
                    <option value="80">80%</option>
                    <option value="90">90%</option>
                    <option value="92">92%</option>
                    <option value="100">100%</option>
                  </select>
                </label>
              ) : null}
            </div>

            <p className="sensitive-redactor-note">按住并拖动即可涂抹。每次松开视为一步，可撤销或重做。</p>
            <button className="convert-button sensitive-redactor-download" type="button" onClick={downloadImage} disabled={!sourceImage || !sourceFile || drawing}>
              <FiDownload aria-hidden="true" />
              下载已打码图片
            </button>
          </section>
        </div>

        {message ? <p className="message" role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
