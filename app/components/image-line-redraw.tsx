"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  FiDownload,
  FiImage,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

const maxFileSize = 25 * 1024 * 1024;
const maxSourcePixels = 30_000_000;
const maxProcessPixels = 2_500_000;
const maxProcessEdge = 2_000;

type Dimensions = {
  width: number;
  height: number;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片"));
    image.src = url;
  });
}

function processingSize(width: number, height: number): Dimensions {
  const edgeScale = Math.min(1, maxProcessEdge / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(maxProcessPixels / (width * height)));
  const scale = Math.min(edgeScale, pixelScale);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function redrawWithEqualWidthLines(
  image: HTMLImageElement,
  outputCanvas: HTMLCanvasElement,
  sensitivity: number,
  lineWidth: number,
  lineColor: string,
  backgroundColor: string,
) {
  const { width, height } = processingSize(
    image.naturalWidth,
    image.naturalHeight,
  );
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext) throw new Error("浏览器无法创建图片处理画布");

  sourceContext.drawImage(image, 0, 0, width, height);
  const source = sourceContext.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
    gray[pixel] =
      source.data[offset] * 0.299 +
      source.data[offset + 1] * 0.587 +
      source.data[offset + 2] * 0.114;
  }

  const magnitude = new Float32Array(width * height);
  const direction = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const index = row + x;
      const topLeft = gray[index - width - 1];
      const top = gray[index - width];
      const topRight = gray[index - width + 1];
      const left = gray[index - 1];
      const right = gray[index + 1];
      const bottomLeft = gray[index + width - 1];
      const bottom = gray[index + width];
      const bottomRight = gray[index + width + 1];
      const gradientX =
        -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const gradientY =
        topLeft + 2 * top + topRight - bottomLeft - 2 * bottom - bottomRight;
      magnitude[index] = Math.hypot(gradientX, gradientY);

      const absX = Math.abs(gradientX);
      const absY = Math.abs(gradientY);
      if (absY * 0.4142 <= absX) direction[index] = 0;
      else if (absX * 0.4142 <= absY) direction[index] = 2;
      else direction[index] = gradientX * gradientY >= 0 ? 1 : 3;
    }
  }

  const threshold = 310 - sensitivity * 3;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) throw new Error("浏览器无法创建线条画布");
  const mask = maskContext.createImageData(width, height);
  const rgb = hexToRgb(lineColor);

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const index = row + x;
      const value = magnitude[index];
      if (value < threshold) continue;

      let before = 0;
      let after = 0;
      if (direction[index] === 0) {
        before = magnitude[index - 1];
        after = magnitude[index + 1];
      } else if (direction[index] === 1) {
        before = magnitude[index - width - 1];
        after = magnitude[index + width + 1];
      } else if (direction[index] === 2) {
        before = magnitude[index - width];
        after = magnitude[index + width];
      } else {
        before = magnitude[index - width + 1];
        after = magnitude[index + width - 1];
      }
      if (value < before || value < after) continue;

      const offset = index * 4;
      mask.data[offset] = rgb.red;
      mask.data[offset + 1] = rgb.green;
      mask.data[offset + 2] = rgb.blue;
      mask.data[offset + 3] = 255;
    }
  }
  maskContext.putImageData(mask, 0, 0);

  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("浏览器无法创建输出画布");
  outputContext.fillStyle = backgroundColor;
  outputContext.fillRect(0, 0, width, height);

  const radius = Math.floor(lineWidth / 2);
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius + 0.5) {
        continue;
      }
      outputContext.drawImage(maskCanvas, offsetX, offsetY);
    }
  }

  return { width, height };
}

export default function ImageLineRedraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sensitivity, setSensitivity] = useState(65);
  const [lineWidth, setLineWidth] = useState(3);
  const [lineColor, setLineColor] = useState("#203641");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [outputSize, setOutputSize] = useState<Dimensions | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sourceImage || !canvasRef.current) return;
    let cancelled = false;
    setProcessing(true);
    setResultReady(false);
    const timer = window.setTimeout(() => {
      try {
        const size = redrawWithEqualWidthLines(
          sourceImage,
          canvasRef.current as HTMLCanvasElement,
          sensitivity,
          lineWidth,
          lineColor,
          backgroundColor,
        );
        if (!cancelled) {
          setOutputSize(size);
          setResultReady(true);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? `${error.message}。` : "线稿生成失败。");
        }
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [backgroundColor, lineColor, lineWidth, sensitivity, sourceImage]);

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

    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      if (image.naturalWidth * image.naturalHeight > maxSourcePixels) {
        throw new Error("图片像素不能超过3000万");
      }
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = url;
      setSourceFile(file);
      setSourceImage(image);
      setSourceUrl(url);
      setOutputSize(null);
      setResultReady(false);
      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(error instanceof Error ? `${error.message}。` : "图片读取失败。");
    }
  }

  function restoreDefaults() {
    setSensitivity(65);
    setLineWidth(3);
    setLineColor("#203641");
    setBackgroundColor("#ffffff");
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || !resultReady || !sourceFile) {
      setMessage("请先选择一张需要重绘的图片。");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage("线稿导出失败，请重试。");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "") || "line-art";
      link.href = url;
      link.download = `${baseName}-equal-width-lines.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  return (
    <main className="tool-shell image-line-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header image-line-header">
        <h1>图片等宽线条重绘工具</h1>
        <p>提取图片轮廓并用统一粗细的线条重绘。</p>
      </header>

      <section className="converter-card image-line-card" aria-label="图片等宽线条重绘">
        <FileDropZone
          className="image-line-picker"
          accept="image/*"
          onFile={handleSourceFile}
          ariaLabel="选择或拖入图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{sourceFile ? "重新选择图片" : "选择图片"}</strong>
          <span>点击选择或直接拖入图片，支持PNG、JPG、WebP等常见格式，最大25 MB</span>
        </FileDropZone>

        <div className="image-line-workbench">
          <section className="image-line-preview" aria-labelledby="image-line-preview-title">
            <div className="image-line-section-heading">
              <h2 id="image-line-preview-title">重绘预览</h2>
              <span>
                {outputSize ? `${outputSize.width} × ${outputSize.height}` : "尚未选择图片"}
              </span>
            </div>

            <div className="image-line-compare">
              <figure>
                <figcaption>原图</figcaption>
                <div className="image-line-preview-frame">
                  {sourceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- The preview uses a browser-created blob URL.
                    <img src={sourceUrl} alt="原始图片预览" />
                  ) : (
                    <span className="file-tool-empty image-line-empty">
                      <FiImage aria-hidden="true" />
                      <strong>原图预览</strong>
                      <span>选择图片后在这里显示</span>
                    </span>
                  )}
                </div>
              </figure>

              <figure>
                <figcaption>等宽线稿</figcaption>
                <div className="image-line-preview-frame is-result">
                  <canvas ref={canvasRef} className={resultReady ? "is-ready" : ""} />
                  {!resultReady ? (
                    <span className="file-tool-empty image-line-empty">
                      <FiRefreshCw aria-hidden="true" />
                      <strong>{processing ? "正在重绘…" : "线稿预览"}</strong>
                      <span>{processing ? "正在提取并统一线条粗细" : "重绘结果会显示在这里"}</span>
                    </span>
                  ) : null}
                </div>
              </figure>
            </div>
          </section>

          <section className="image-line-settings" aria-labelledby="image-line-settings-title">
            <div className="image-line-section-heading">
              <h2 id="image-line-settings-title">重绘设置</h2>
              <button type="button" className="image-line-reset" onClick={restoreDefaults}>
                <FiRefreshCw aria-hidden="true" />
                恢复默认
              </button>
            </div>

            <label className="image-line-control">
              <span>线条粗细 <strong>{lineWidth}px</strong></span>
              <input
                type="range"
                min="1"
                max="13"
                step="2"
                value={lineWidth}
                onChange={(event) => setLineWidth(Number(event.target.value))}
              />
            </label>

            <label className="image-line-control">
              <span>轮廓灵敏度 <strong>{sensitivity}%</strong></span>
              <input
                type="range"
                min="20"
                max="90"
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
              />
              <small>数值越高，保留的细节越多。</small>
            </label>

            <div className="image-line-color-grid">
              <label>
                <span>线条颜色</span>
                <span className="image-line-color-picker">
                  <input type="color" value={lineColor} onChange={(event) => setLineColor(event.target.value)} />
                  <code>{lineColor.toUpperCase()}</code>
                </span>
              </label>
              <label>
                <span>背景颜色</span>
                <span className="image-line-color-picker">
                  <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />
                  <code>{backgroundColor.toUpperCase()}</code>
                </span>
              </label>
            </div>

            <div className="image-line-file">
              <FiImage aria-hidden="true" />
              <div>
                {sourceFile && sourceImage ? (
                  <>
                    <strong>{sourceFile.name}</strong>
                    <span>{formatFileSize(sourceFile.size)} · {sourceImage.naturalWidth} × {sourceImage.naturalHeight}</span>
                  </>
                ) : (
                  <>
                    <strong>尚未选择图片</strong>
                    <span>选择图片后自动生成线稿</span>
                  </>
                )}
              </div>
            </div>

            <p className="image-line-note">为保持处理流畅，大图会等比缩放，最长边不超过2000px。</p>

            <button
              className="convert-button image-line-download"
              type="button"
              onClick={downloadImage}
              disabled={!resultReady || processing}
            >
              <FiDownload aria-hidden="true" />
              下载PNG线稿
            </button>
          </section>
        </div>

        {message ? <p className="message" role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
