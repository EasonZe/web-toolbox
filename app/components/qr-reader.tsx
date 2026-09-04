"use client";

import jsQR from "jsqr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiExternalLink,
  FiImage,
  FiUploadCloud,
} from "react-icons/fi";
import { TbScan } from "react-icons/tb";
import { FileDropZone } from "./file-drop-zone";

const maxFileSize = 25 * 1024 * 1024;
const maxDecodeDimension = 2400;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片"));
    };
    image.src = url;
  });
}

function drawLocation(
  context: CanvasRenderingContext2D,
  location: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
  },
) {
  const points = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];

  context.save();
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.lineWidth = Math.max(3, context.canvas.width / 260);
  context.strokeStyle = "#5a85a0";
  context.shadowColor = "rgba(255, 255, 255, 0.9)";
  context.shadowBlur = 2;
  context.stroke();
  context.restore();
}

export default function QrReader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasPreview = Boolean(fileName);
  const resultIsUrl = isHttpUrl(result);

  const decodeFile = useCallback(async (file: File) => {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);

    if (!looksLikeImage) {
      setMessage("请选择PNG、JPG、WebP等常见图片。");
      return;
    }
    if (file.size > maxFileSize) {
      setMessage("图片不能超过25MB。");
      return;
    }

    setProcessing(true);
    setMessage("");
    setResult("");
    setFileName("");
    setCopied(false);

    try {
      const image = await loadImage(file);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("预览区域尚未准备好");

      const scale = Math.min(
        1,
        maxDecodeDimension /
          Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!context) throw new Error("浏览器无法读取图片像素");

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const decoded = jsQR(imageData.data, width, height, {
        inversionAttempts: "attemptBoth",
      });

      setFileName(file.name || "粘贴的二维码图片");

      if (!decoded) {
        setMessage("没有识别到二维码，请尝试更清晰、完整的图片。");
        return;
      }

      drawLocation(context, decoded.location);
      setResult(decoded.data);
    } catch (error) {
      setFileName("");
      setMessage(
        error instanceof Error ? `${error.message}。` : "二维码解析失败。",
      );
    } finally {
      setProcessing(false);
    }
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(
        (item) => item.type.startsWith("image/"),
      );
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void decodeFile(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [decodeFile]);

  async function copyResult() {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = result;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="tool-shell qr-reader-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header qr-reader-header">
        <h1>二维码解析工具</h1>
        <p>支持上传、拖放或粘贴二维码截图。</p>
      </header>

      <section className="converter-card qr-reader-card" aria-label="二维码解析">
        <FileDropZone
          className="qr-reader-picker"
          accept="image/*"
          disabled={processing}
          onFile={decodeFile}
          ariaLabel="选择或拖入二维码图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>
            {processing
              ? "正在解析…"
              : hasPreview
                ? "重新选择二维码图片"
                : "选择二维码图片"}
          </strong>
          <span>点击选择、拖放到这里，或直接粘贴截图</span>
        </FileDropZone>

        <div className="qr-reader-workbench">
          <section
            className="qr-reader-preview"
            aria-labelledby="qr-reader-preview-title"
          >
            <div className="qr-reader-section-heading">
              <h2 id="qr-reader-preview-title">图片预览</h2>
              {fileName ? <span>{fileName}</span> : null}
            </div>
            <div className="qr-reader-preview-frame">
              <canvas
                ref={canvasRef}
                className={hasPreview ? "is-visible" : ""}
                aria-label="二维码图片预览"
              />
              {!hasPreview ? (
                <div className="qr-reader-empty">
                  <FiImage aria-hidden="true" />
                  <strong>等待图片</strong>
                  <span>支持PNG、JPG、WebP等常见格式</span>
                </div>
              ) : null}
            </div>
          </section>

          <section
            className="qr-reader-result"
            aria-labelledby="qr-reader-result-title"
          >
            <div className="qr-reader-section-heading">
              <h2 id="qr-reader-result-title">解析结果</h2>
              {result ? <span>{result.length}个字符</span> : null}
            </div>

            {result ? (
              <>
                <pre>{result}</pre>
                <div className="qr-reader-actions">
                  <button type="button" onClick={copyResult}>
                    {copied ? (
                      <FiCheck aria-hidden="true" />
                    ) : (
                      <FiCopy aria-hidden="true" />
                    )}
                    {copied ? "已复制" : "复制结果"}
                  </button>
                  {resultIsUrl ? (
                    <a
                      href={result}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FiExternalLink aria-hidden="true" />
                      打开链接
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="qr-reader-result-empty">
                <TbScan aria-hidden="true" />
                <strong>识别结果会显示在这里</strong>
                <span>网址、文字和其他二维码内容均可解析</span>
              </div>
            )}
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
