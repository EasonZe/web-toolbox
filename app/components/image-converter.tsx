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

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

const maxFileSize = 25 * 1024 * 1024;
const maxImagePixels = 30_000_000;

const formatOptions: Array<{
  value: OutputFormat;
  label: string;
  extension: string;
}> = [
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/jpeg", label: "JPG", extension: "jpg" },
  { value: "image/webp", label: "WebP", extension: "webp" },
];

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

export default function ImageConverter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef("");
  const outputUrlRef = useRef("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState("#ffffff");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [message, setMessage] = useState("");
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage || !sourceFile) return;

    let cancelled = false;
    setConverting(true);
    setMessage("");

    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setConverting(false);
      setMessage("浏览器无法创建转换画布。");
      return;
    }

    context.clearRect(0, 0, width, height);
    if (outputFormat === "image/jpeg") {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(sourceImage, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (cancelled) return;
        setConverting(false);

        if (!blob) {
          setOutputBlob(null);
          setMessage("图片转换失败，请更换格式后重试。");
          return;
        }
        if (blob.type && blob.type !== outputFormat) {
          setOutputBlob(null);
          setMessage("当前浏览器不支持导出这个格式。");
          return;
        }

        if (outputUrlRef.current) {
          URL.revokeObjectURL(outputUrlRef.current);
        }
        const nextUrl = URL.createObjectURL(blob);
        outputUrlRef.current = nextUrl;
        setOutputBlob(blob);
        setOutputUrl(nextUrl);
      },
      outputFormat,
      outputFormat === "image/png" ? undefined : quality / 100,
    );

    return () => {
      cancelled = true;
    };
  }, [
    background,
    outputFormat,
    quality,
    sourceFile,
    sourceImage,
  ]);

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
        throw new Error("图片像素不能超过3000万");
      }
      setSourceFile(file);
      setSourceImage(image);
      setOutputBlob(null);
      setMessage("");

      const sourceType = file.type.toLowerCase();
      if (sourceType === "image/jpeg") setOutputFormat("image/png");
      else if (sourceType === "image/png") setOutputFormat("image/webp");
      else setOutputFormat("image/jpeg");
    } catch (error) {
      URL.revokeObjectURL(url);
      sourceUrlRef.current = "";
      setMessage(
        error instanceof Error ? `${error.message}。` : "图片读取失败。",
      );
    }
  }

  function downloadImage() {
    if (!outputBlob || !outputUrl || !sourceFile) {
      setMessage("请先选择一张需要转换的图片。");
      return;
    }

    const selectedFormat =
      formatOptions.find((option) => option.value === outputFormat) ??
      formatOptions[0];
    const baseName =
      sourceFile.name.replace(/\.[^.]+$/, "") || "converted-image";
    const link = document.createElement("a");
    link.href = outputUrl;
    link.download = `${baseName}.${selectedFormat.extension}`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  const selectedFormat =
    formatOptions.find((option) => option.value === outputFormat) ??
    formatOptions[0];

  return (
    <main className="tool-shell image-converter-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header image-converter-header">
        <h1>图片格式转换工具</h1>
        <p>将图片转换为PNG、JPG或WebP格式。</p>
      </header>

      <section
        className="converter-card image-converter-card"
        aria-label="图片格式转换"
      >
        <FileDropZone
          className="image-converter-picker"
          accept="image/*"
          onFile={handleSourceFile}
          ariaLabel="选择或拖入图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{sourceFile ? "重新选择图片" : "选择图片"}</strong>
          <span>
            点击选择或拖入图片，支持PNG、JPG、WebP、BMP、AVIF等常见格式，最大25 MB
          </span>
        </FileDropZone>

        <div className="image-converter-workbench">
            <section
              className="image-converter-preview"
              aria-labelledby="image-converter-preview-title"
            >
              <div className="image-converter-section-heading">
                <h2 id="image-converter-preview-title">转换预览</h2>
                <span>
                  {sourceImage
                    ? `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight}`
                    : "尚未选择图片"}
                </span>
              </div>

              <div className="image-converter-preview-frame">
                {outputUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- The preview uses a browser-created blob URL.
                  <img src={outputUrl} alt="转换后的图片预览" />
                ) : (
                  <div className="file-tool-empty image-preview-empty">
                    <FiImage aria-hidden="true" />
                    <strong>图片预览</strong>
                    <span>选择图片后在这里查看转换效果</span>
                  </div>
                )}
              </div>

              <div className="image-converter-summary">
                <div>
                  <span>原始图片</span>
                  <strong>
                    {sourceFile ? formatFileSize(sourceFile.size) : "等待图片"}
                  </strong>
                </div>
                <FiRefreshCw aria-hidden="true" />
                <div>
                  <span>{selectedFormat.label}</span>
                  <strong>
                    {outputBlob
                      ? formatFileSize(outputBlob.size)
                      : sourceFile
                        ? "生成中"
                        : "等待图片"}
                  </strong>
                </div>
              </div>
            </section>

            <section
              className="image-converter-settings"
              aria-labelledby="image-converter-settings-title"
            >
              <h2 id="image-converter-settings-title">转换设置</h2>

              <fieldset className="image-format-options">
                <legend>目标格式</legend>
                <div>
                  {formatOptions.map((option) => (
                    <button
                      className={
                        outputFormat === option.value ? "is-selected" : ""
                      }
                      type="button"
                      key={option.value}
                      onClick={() => setOutputFormat(option.value)}
                      aria-pressed={outputFormat === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {outputFormat !== "image/png" ? (
                <label className="image-converter-control">
                  <span>
                    图片质量
                    <strong>{quality}%</strong>
                  </span>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={quality}
                    onChange={(event) =>
                      setQuality(Number(event.target.value))
                    }
                  />
                </label>
              ) : (
                <p className="image-converter-note">
                  PNG为无损格式，不需要设置质量。
                </p>
              )}

              {outputFormat === "image/jpeg" ? (
                <label className="image-converter-control">
                  <span>透明区域背景</span>
                  <span className="image-converter-color-picker">
                    <input
                      type="color"
                      value={background}
                      onChange={(event) => setBackground(event.target.value)}
                    />
                    <code>{background.toUpperCase()}</code>
                  </span>
                </label>
              ) : null}

              <div className="image-converter-file">
                <FiImage aria-hidden="true" />
                <div>
                  {sourceFile && sourceImage ? (
                    <>
                      <strong>{sourceFile.name}</strong>
                      <span>
                        {formatFileSize(sourceFile.size)} ·{" "}
                        {sourceImage.naturalWidth} × {sourceImage.naturalHeight}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>尚未选择图片</strong>
                      <span>选择图片后显示文件信息</span>
                    </>
                  )}
                </div>
              </div>

              <button
                className="convert-button image-converter-download"
                type="button"
                onClick={downloadImage}
                disabled={converting || !outputBlob}
              >
                <FiDownload aria-hidden="true" />
                {converting
                  ? "正在转换…"
                  : `下载${selectedFormat.label}图片`}
              </button>
            </section>
        </div>

        <canvas ref={canvasRef} hidden />

        {message ? (
          <p className="message" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
