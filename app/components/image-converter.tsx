"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiDownload, FiImage, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";
type ConversionStatus = "ready" | "converting" | "done" | "error";
type ConversionItem = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  status: ConversionStatus;
  resultBlob: Blob | null;
  resultUrl: string;
  error: string;
};

const maxFileSize = 25 * 1024 * 1024;
const maxTotalSize = 150 * 1024 * 1024;
const maxFiles = 20;
const maxImagePixels = 30_000_000;
const formatOptions: Array<{ value: OutputFormat; label: string; extension: string }> = [
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/jpeg", label: "JPG", extension: "jpg" },
  { value: "image/webp", label: "WebP", extension: "webp" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function looksLikeImage(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取图片"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("浏览器未能生成转换结果"));
      if (blob.type && blob.type !== type) return reject(new Error("当前浏览器不支持导出该格式"));
      resolve(blob);
    }, type, type === "image/png" ? undefined : quality / 100);
  });
}

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

export default function ImageConverter() {
  const itemsRef = useRef<ConversionItem[]>([]);
  const jobRef = useRef(0);
  const [items, setItems] = useState<ConversionItem[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState("#ffffff");
  const [message, setMessage] = useState("");
  const [converting, setConverting] = useState(false);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    jobRef.current += 1;
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
  }, []);

  useEffect(() => {
    jobRef.current += 1;
    setConverting(false);
    setItems((current) => current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      return { ...item, status: "ready", resultBlob: null, resultUrl: "", error: "" };
    }));
    setMessage("");
  }, [background, outputFormat, quality]);

  const selectedFormat = formatOptions.find((option) => option.value === outputFormat) ?? formatOptions[0];
  const completedItems = useMemo(
    () => items.filter((item) => item.status === "done" && item.resultUrl),
    [items],
  );

  async function addFiles(files: File[]) {
    const existingKeys = new Set(items.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
    const remainingCount = Math.max(0, maxFiles - items.length);
    const existingSize = items.reduce((sum, item) => sum + item.file.size, 0);
    let acceptedSize = 0;
    let skipped = 0;
    const accepted: ConversionItem[] = [];

    for (const file of files.slice(0, remainingCount)) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (existingKeys.has(key) || !looksLikeImage(file) || file.size > maxFileSize || existingSize + acceptedSize + file.size > maxTotalSize) {
        skipped += 1;
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      try {
        const image = await loadImage(previewUrl);
        if (image.naturalWidth * image.naturalHeight > maxImagePixels) throw new Error("图片像素过大");
        accepted.push({
          id: createId(), file, previewUrl, width: image.naturalWidth, height: image.naturalHeight,
          status: "ready", resultBlob: null, resultUrl: "", error: "",
        });
        acceptedSize += file.size;
        existingKeys.add(key);
      } catch {
        URL.revokeObjectURL(previewUrl);
        skipped += 1;
      }
    }

    skipped += Math.max(0, files.length - remainingCount);
    if (accepted.length) setItems((current) => [...current, ...accepted]);
    setMessage(skipped ? `已跳过${skipped}个文件；单张最大25 MB，一次最多20张，总计不超过150 MB。` : "");
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);
      }
      return current.filter((item) => item.id !== id);
    });
    setMessage("");
  }

  function clearItems() {
    jobRef.current += 1;
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    setItems([]);
    setConverting(false);
    setMessage("");
  }

  async function convertItem(item: ConversionItem) {
    const image = await loadImage(item.previewUrl);
    const canvas = document.createElement("canvas");
    canvas.width = item.width;
    canvas.height = item.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建转换画布");
    if (outputFormat === "image/jpeg") {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, outputFormat, quality);
  }

  async function runConversion() {
    if (converting) return;
    if (!items.length) return setMessage("请先选择需要转换的图片。");
    const job = jobRef.current + 1;
    jobRef.current = job;
    setConverting(true);
    setMessage("");
    let succeeded = 0;

    for (const sourceItem of items) {
      if (jobRef.current !== job) return;
      setItems((current) => current.map((item) => item.id === sourceItem.id ? { ...item, status: "converting", error: "" } : item));
      try {
        const blob = await convertItem(sourceItem);
        if (jobRef.current !== job) return;
        const resultUrl = URL.createObjectURL(blob);
        succeeded += 1;
        setItems((current) => current.map((item) => {
          if (item.id !== sourceItem.id) return item;
          if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
          return { ...item, status: "done", resultBlob: blob, resultUrl, error: "" };
        }));
      } catch (error) {
        setItems((current) => current.map((item) => item.id === sourceItem.id ? {
          ...item, status: "error", error: error instanceof Error ? error.message : "图片转换失败",
        } : item));
      }
    }
    if (jobRef.current === job) {
      setConverting(false);
      setMessage(succeeded === items.length
        ? `转换完成，共${succeeded}张图片。`
        : `转换完成：成功${succeeded}张，失败${items.length - succeeded}张。`);
    }
  }

  function outputFileName(file: File) {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "converted-image";
    return `${baseName}.${selectedFormat.extension}`;
  }
  function downloadOne(item: ConversionItem) {
    if (item.resultUrl) triggerDownload(item.resultUrl, outputFileName(item.file));
  }
  async function downloadAll() {
    for (const item of completedItems) {
      triggerDownload(item.resultUrl, outputFileName(item.file));
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }

  return (
    <main className="tool-shell image-converter-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> Eason的工具箱</Link>
      <header className="tool-header image-converter-header">
        <h1>图片格式转换工具</h1>
        <p>支持批量转换PNG、JPG和WebP格式。</p>
      </header>

      <section className="converter-card image-converter-card" aria-label="批量图片格式转换">
        <FileDropZone className="image-converter-picker" accept="image/*" multiple onFiles={addFiles} disabled={converting} ariaLabel="选择或拖入多张图片">
          <FiUploadCloud aria-hidden="true" />
          <strong>{items.length ? "继续添加图片" : "选择多张图片"}</strong>
          <span>点击选择或直接拖入，支持PNG、JPG、WebP、BMP、AVIF等常见格式；单张最大25 MB，最多20张</span>
        </FileDropZone>

        <div className="image-converter-workbench">
          <section className="image-converter-preview image-converter-list-panel" aria-labelledby="image-converter-list-title">
            <div className="image-converter-section-heading">
              <h2 id="image-converter-list-title">图片列表</h2>
              <span>{items.length} / {maxFiles} 张</span>
            </div>
            {items.length ? (
              <div className="image-converter-list">
                {items.map((item) => (
                  <article className="image-converter-item" key={item.id}>
                    <div className="image-converter-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Blob URLs are created in this page. */}
                      <img src={item.resultUrl || item.previewUrl} alt={`${item.file.name}预览`} />
                    </div>
                    <div className="image-converter-item-info">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>{item.width} × {item.height} · {formatFileSize(item.file.size)}</span>
                      <span className={`image-converter-status is-${item.status}`}>
                        {item.status === "ready" ? "等待转换" : null}
                        {item.status === "converting" ? "正在转换…" : null}
                        {item.status === "done" ? <><FiCheck aria-hidden="true" />转换完成 · {formatFileSize(item.resultBlob?.size ?? 0)}</> : null}
                        {item.status === "error" ? item.error : null}
                      </span>
                    </div>
                    <div className="image-converter-item-actions">
                      {item.resultUrl ? <button type="button" onClick={() => downloadOne(item)} aria-label={`下载${item.file.name}`} title="下载转换结果"><FiDownload aria-hidden="true" /></button> : null}
                      <button type="button" onClick={() => removeItem(item.id)} disabled={converting} aria-label={`移除${item.file.name}`} title="移除图片"><FiX aria-hidden="true" /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="file-tool-empty image-converter-list-empty">
                <FiImage aria-hidden="true" /><strong>尚未选择图片</strong><span>添加的图片会逐张显示在这里</span>
              </div>
            )}
            <button className="image-converter-clear" type="button" onClick={clearItems} disabled={!items.length || converting}><FiTrash2 aria-hidden="true" />清空列表</button>
          </section>

          <section className="image-converter-settings" aria-labelledby="image-converter-settings-title">
            <h2 id="image-converter-settings-title">转换设置</h2>
            <fieldset className="image-format-options" disabled={converting}>
              <legend>目标格式</legend>
              <div>{formatOptions.map((option) => (
                <button className={outputFormat === option.value ? "is-selected" : ""} type="button" key={option.value} onClick={() => setOutputFormat(option.value)} aria-pressed={outputFormat === option.value}>{option.label}</button>
              ))}</div>
            </fieldset>
            {outputFormat !== "image/png" ? (
              <label className="image-converter-control"><span>图片质量<strong>{quality}%</strong></span><input type="range" min="20" max="100" step="1" value={quality} disabled={converting} onChange={(event) => setQuality(Number(event.target.value))} /></label>
            ) : <p className="image-converter-note">PNG为无损格式，不需要设置质量。</p>}
            {outputFormat === "image/jpeg" ? (
              <label className="image-converter-control"><span>透明区域背景</span><span className="image-converter-color-picker"><input type="color" value={background} disabled={converting} onChange={(event) => setBackground(event.target.value)} /><code>{background.toUpperCase()}</code></span></label>
            ) : null}
            <div className="image-converter-file"><FiImage aria-hidden="true" /><div>
              <strong>{items.length ? `已选择${items.length}张图片` : "尚未选择图片"}</strong>
              <span>{items.length ? `共${formatFileSize(items.reduce((sum, item) => sum + item.file.size, 0))}` : "选择后可统一转换并下载"}</span>
            </div></div>
            <div className="image-converter-main-actions">
              <button className="convert-button image-converter-download" type="button" onClick={runConversion} disabled={converting || !items.length}><FiImage aria-hidden="true" />{converting ? "正在逐张转换…" : "开始批量转换"}</button>
              <button className="secondary-action image-converter-download-all" type="button" onClick={downloadAll} disabled={converting || !completedItems.length}><FiDownload aria-hidden="true" />下载全部</button>
            </div>
          </section>
        </div>
        {message ? <p className="message" role={message.startsWith("转换完成") ? "status" : "alert"}>{message}</p> : null}
      </section>
    </main>
  );
}
