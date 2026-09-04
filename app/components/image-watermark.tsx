"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiDownload,
  FiImage,
  FiType,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type WatermarkMode = "text" | "image";
type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-right"
  | "tile"
  | "grid";
type OutputFormat = "image/png" | "image/jpeg";

const maxFileSize = 25 * 1024 * 1024;
const maxImagePixels = 24_000_000;

const positionOptions: Array<{
  value: WatermarkPosition;
  label: string;
}> = [
  { value: "grid", label: "网格" },
  { value: "tile", label: "平铺" },
  { value: "top-left", label: "左上角" },
  { value: "top-right", label: "右上角" },
  { value: "center", label: "居中" },
  { value: "bottom-left", label: "左下角" },
  { value: "bottom-right", label: "右下角" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isLightColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return true;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片"));
    image.src = url;
  });
}

function getAnchorPosition(
  position: Exclude<WatermarkPosition, "tile" | "grid">,
  canvasWidth: number,
  canvasHeight: number,
  itemWidth: number,
  itemHeight: number,
) {
  const margin = Math.max(12, Math.min(canvasWidth, canvasHeight) * 0.04);

  switch (position) {
    case "top-left":
      return { x: margin + itemWidth / 2, y: margin + itemHeight / 2 };
    case "top-right":
      return {
        x: canvasWidth - margin - itemWidth / 2,
        y: margin + itemHeight / 2,
      };
    case "center":
      return { x: canvasWidth / 2, y: canvasHeight / 2 };
    case "bottom-left":
      return {
        x: margin + itemWidth / 2,
        y: canvasHeight - margin - itemHeight / 2,
      };
    case "bottom-right":
      return {
        x: canvasWidth - margin - itemWidth / 2,
        y: canvasHeight - margin - itemHeight / 2,
      };
  }

  return { x: canvasWidth / 2, y: canvasHeight / 2 };
}

export default function ImageWatermark() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef("");
  const watermarkUrlRef = useRef("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkImage, setWatermarkImage] =
    useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<WatermarkMode>("text");
  const [text, setText] = useState("多功能工具箱");
  const [color, setColor] = useState("#ffffff");
  const [opacity, setOpacity] = useState(55);
  const [size, setSize] = useState(9);
  const [position, setPosition] = useState<WatermarkPosition>("grid");
  const [rotation, setRotation] = useState(0);
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>("image/png");
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (watermarkUrlRef.current) URL.revokeObjectURL(watermarkUrlRef.current);
    };
  }, []);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;

    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);
    if (outputFormat === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(sourceImage, 0, 0, width, height);
    context.save();
    context.globalAlpha = opacity / 100;

    const angle = (rotation * Math.PI) / 180;

    if (mode === "text" && text.trim()) {
      let fontSize = Math.max(12, Math.min(width, height) * (size / 100));
      context.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = color;
      context.strokeStyle = isLightColor(color)
        ? "rgba(0, 0, 0, 0.32)"
        : "rgba(255, 255, 255, 0.42)";
      context.lineWidth = Math.max(1, fontSize * 0.055);
      context.lineJoin = "round";

      let textWidth = context.measureText(text.trim()).width;
      if (textWidth > width * 0.9) {
        fontSize *= (width * 0.9) / textWidth;
        context.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        context.lineWidth = Math.max(1, fontSize * 0.055);
        textWidth = context.measureText(text.trim()).width;
      }
      const textHeight = fontSize * 1.15;

      const drawText = (x: number, y: number) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.strokeText(text.trim(), 0, 0);
        context.fillText(text.trim(), 0, 0);
        context.restore();
      };

      if (position === "tile" || position === "grid") {
        const stepX = Math.max(textWidth + fontSize * 2.8, fontSize * 7);
        const stepY = Math.max(textHeight + fontSize * 2.4, fontSize * 4);
        let row = 0;
        for (let y = -stepY; y < height + stepY; y += stepY, row += 1) {
          const rowOffset =
            position === "tile" && row % 2 === 1 ? stepX / 2 : 0;
          for (let x = -stepX; x < width + stepX; x += stepX) {
            drawText(x + rowOffset, y);
          }
        }
      } else {
        const anchor = getAnchorPosition(
          position,
          width,
          height,
          textWidth,
          textHeight,
        );
        drawText(anchor.x, anchor.y);
      }
    }

    if (mode === "image" && watermarkImage) {
      const watermarkWidth = width * (size / 100);
      const watermarkHeight =
        watermarkWidth *
        (watermarkImage.naturalHeight / watermarkImage.naturalWidth);

      const drawWatermarkImage = (x: number, y: number) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.drawImage(
          watermarkImage,
          -watermarkWidth / 2,
          -watermarkHeight / 2,
          watermarkWidth,
          watermarkHeight,
        );
        context.restore();
      };

      if (position === "tile" || position === "grid") {
        const stepX = watermarkWidth * 1.65;
        const stepY = watermarkHeight * 1.75;
        let row = 0;
        for (let y = -stepY; y < height + stepY; y += stepY, row += 1) {
          const rowOffset =
            position === "tile" && row % 2 === 1 ? stepX / 2 : 0;
          for (let x = -stepX; x < width + stepX; x += stepX) {
            drawWatermarkImage(x + rowOffset, y);
          }
        }
      } else {
        const anchor = getAnchorPosition(
          position,
          width,
          height,
          watermarkWidth,
          watermarkHeight,
        );
        drawWatermarkImage(anchor.x, anchor.y);
      }
    }

    context.restore();
  }, [
    color,
    mode,
    opacity,
    position,
    rotation,
    size,
    sourceImage,
    text,
    watermarkImage,
    outputFormat,
  ]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  async function handleSourceFile(file: File) {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
    if (!looksLikeImage) {
      setMessage("请选择PNG、JPG、WebP等常见图片。");
      return;
    }
    if (file.size > maxFileSize) {
      setMessage("图片不能超过25 MB。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;

    try {
      const image = await loadImage(url);
      if (image.naturalWidth * image.naturalHeight > maxImagePixels) {
        throw new Error("图片像素不能超过2400万");
      }
      setSourceFile(file);
      setSourceImage(image);
      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(url);
      sourceUrlRef.current = "";
      setMessage(error instanceof Error ? `${error.message}。` : "图片读取失败。");
    }
  }

  async function handleWatermarkFile(file: File) {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
    if (!looksLikeImage) {
      setMessage("请选择一张图片作为水印。");
      return;
    }
    if (file.size > maxFileSize) {
      setMessage("水印图片不能超过25 MB。");
      return;
    }

    if (watermarkUrlRef.current) URL.revokeObjectURL(watermarkUrlRef.current);
    const url = URL.createObjectURL(file);
    watermarkUrlRef.current = url;

    try {
      const image = await loadImage(url);
      setWatermarkFile(file);
      setWatermarkImage(image);
      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(url);
      watermarkUrlRef.current = "";
      setMessage(
        error instanceof Error ? `${error.message}。` : "水印图片读取失败。",
      );
    }
  }

  async function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || !sourceFile || !sourceImage) {
      setMessage("请先选择一张需要加水印的图片。");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setMessage("请输入水印文字。");
      return;
    }
    if (mode === "image" && !watermarkImage) {
      setMessage("请先选择一张水印图片。");
      return;
    }

    setDownloading(true);
    setMessage("");
    renderPreview();

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("图片生成失败")),
          outputFormat,
          outputFormat === "image/jpeg" ? 0.92 : undefined,
        );
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName =
        sourceFile.name.replace(/\.[^.]+$/, "") || "watermarked-image";
      link.href = downloadUrl;
      link.download = `${baseName}-watermarked.${
        outputFormat === "image/png" ? "png" : "jpg"
      }`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setMessage(
        error instanceof Error ? `${error.message}。` : "图片下载失败。",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="tool-shell image-watermark-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header image-watermark-header">
        <h1>图片加水印工具</h1>
        <p>支持单点水印、平铺水印与网格水印。</p>
      </header>

      <section
        className="converter-card image-watermark-card"
        aria-label="图片加水印"
      >
        <FileDropZone
          className="video-file-picker image-source-picker"
          accept="image/*"
          onFile={handleSourceFile}
          ariaLabel="选择或拖入原图"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{sourceFile ? "重新选择原图" : "选择原图"}</strong>
          <span>点击选择或拖入原图，支持PNG、JPG、WebP等格式，最大25 MB</span>
        </FileDropZone>

        <div className="image-watermark-workbench">
            <section
              className="image-watermark-preview"
              aria-labelledby="watermark-preview-title"
            >
              <div className="image-watermark-preview-header">
                <div>
                  <h2 id="watermark-preview-title">实时预览</h2>
                  <span>
                    {sourceImage && sourceFile
                      ? `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight} · ${formatFileSize(sourceFile.size)}`
                      : "尚未选择图片"}
                  </span>
                </div>
              </div>
              <div className="image-watermark-canvas-frame">
                {sourceImage && sourceFile ? (
                  <canvas ref={canvasRef} aria-label="加水印图片预览" />
                ) : (
                  <div className="file-tool-empty image-preview-empty">
                    <FiImage aria-hidden="true" />
                    <strong>图片预览</strong>
                    <span>选择原图后在这里实时查看水印效果</span>
                  </div>
                )}
              </div>
            </section>

            <section
              className="image-watermark-settings"
              aria-labelledby="watermark-settings-title"
            >
              <h2 id="watermark-settings-title">水印设置</h2>

              <div
                className="watermark-mode-switch"
                role="group"
                aria-label="水印类型"
              >
                <button
                  className={mode === "text" ? "is-selected" : ""}
                  type="button"
                  onClick={() => {
                    setMode("text");
                    setSize(9);
                  }}
                  aria-pressed={mode === "text"}
                >
                  <FiType aria-hidden="true" />
                  文字水印
                </button>
                <button
                  className={mode === "image" ? "is-selected" : ""}
                  type="button"
                  onClick={() => {
                    setMode("image");
                    setSize(25);
                  }}
                  aria-pressed={mode === "image"}
                >
                  <FiImage aria-hidden="true" />
                  图片水印
                </button>
              </div>

              {mode === "text" ? (
                <div className="watermark-control">
                  <label htmlFor="watermark-text">水印文字</label>
                  <input
                    id="watermark-text"
                    value={text}
                    maxLength={80}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="输入水印文字"
                  />
                </div>
              ) : (
                <FileDropZone
                  className="watermark-image-picker"
                  accept="image/*"
                  onFile={handleWatermarkFile}
                  ariaLabel="选择或拖入水印图片"
                >
                  <FiUploadCloud aria-hidden="true" />
                  <span>
                    {watermarkFile
                      ? watermarkFile.name
                      : "选择或拖入水印图片"}
                  </span>
                </FileDropZone>
              )}

              <div className="watermark-settings-grid">
                {mode === "text" ? (
                  <label className="watermark-color-control">
                    <span>文字颜色</span>
                    <span>
                      <input
                        type="color"
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                      />
                      <code>{color.toUpperCase()}</code>
                    </span>
                  </label>
                ) : null}

                <label>
                  <span>布局方式</span>
                  <select
                    value={position}
                    onChange={(event) =>
                      setPosition(event.target.value as WatermarkPosition)
                    }
                  >
                    {positionOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    透明度 <strong>{opacity}%</strong>
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={opacity}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                  />
                </label>

                <label>
                  <span>
                    大小 <strong>{size}%</strong>
                  </span>
                  <input
                    type="range"
                    min={mode === "text" ? "3" : "10"}
                    max={mode === "text" ? "18" : "50"}
                    value={size}
                    onChange={(event) => setSize(Number(event.target.value))}
                  />
                </label>

                <label>
                  <span>
                    旋转 <strong>{rotation}°</strong>
                  </span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={rotation}
                    onChange={(event) => setRotation(Number(event.target.value))}
                  />
                </label>

                <label>
                  <span>导出格式</span>
                  <select
                    value={outputFormat}
                    onChange={(event) =>
                      setOutputFormat(event.target.value as OutputFormat)
                    }
                  >
                    <option value="image/png">PNG</option>
                    <option value="image/jpeg">JPG</option>
                  </select>
                </label>
              </div>

              <button
                className="convert-button image-watermark-download"
                type="button"
                onClick={downloadImage}
                disabled={
                  downloading ||
                  !sourceImage ||
                  !sourceFile ||
                  (mode === "text" ? !text.trim() : !watermarkImage)
                }
              >
                <FiDownload aria-hidden="true" />
                {downloading ? "正在生成…" : "下载加水印图片"}
              </button>
            </section>
        </div>

        {message ? (
          <p className="message" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
