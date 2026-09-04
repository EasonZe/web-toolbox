"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiArchive,
  FiCheck,
  FiDownload,
  FiImage,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import {
  compressionQualityPresets,
  defaultCompressionQuality,
  normalizeCompressionQuality,
  pngColorTable,
} from "../lib/image-compression-quality";

type CompressionStatus = "ready" | "compressing" | "done" | "error";

type CompressionItem = {
  id: string;
  file: File;
  previewUrl: string;
  resultBlob: Blob | null;
  resultUrl: string;
  status: CompressionStatus;
  width: number;
  height: number;
  usedOriginal: boolean;
  error: string;
};

type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
  usedOriginal: boolean;
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maxFileSize = 25 * 1024 * 1024;
const maxFiles = 50;
const maxImagePixels = 30_000_000;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function normalizeImageType(file: File) {
  const type = file.type.toLowerCase();
  if (allowedMimeTypes.has(type)) return type;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return "";
}

function outputExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function outputFileName(file: File) {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}-compressed.${outputExtension(normalizeImageType(file))}`;
}

function createItem(file: File): CompressionItem {
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    resultBlob: null,
    resultUrl: "",
    status: "ready",
    width: 0,
    height: 0,
    usedOriginal: false,
    error: "",
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("浏览器未能生成压缩图片"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function optimizePngPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  quality: number,
) {
  if (quality === 100) return;
  const colors = pngColorTable(quality);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = colors[pixels[index]];
    pixels[index + 1] = colors[pixels[index + 1]];
    pixels[index + 2] = colors[pixels[index + 2]];
  }
  context.putImageData(imageData, 0, 0);
}

async function compressImage(file: File, quality: number): Promise<CompressedImage> {
  quality = normalizeCompressionQuality(quality);
  const type = normalizeImageType(file);
  if (!type) throw new Error("仅支持JPG、PNG和WebP图片");

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    if (width * height > maxImagePixels) {
      throw new Error("图片像素不能超过3000万");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: type !== "image/jpeg" });
    if (!context) throw new Error("浏览器无法创建压缩画布");

    context.drawImage(bitmap, 0, 0, width, height);
    if (type === "image/png") {
      optimizePngPixels(context, width, height, quality);
    }

    const encoded = await canvasToBlob(
      canvas,
      type,
      type === "image/png" ? undefined : quality / 100,
    );
    if (encoded.type && encoded.type !== type) {
      throw new Error("当前浏览器不支持导出这种图片格式");
    }

    const usedOriginal = encoded.size >= file.size;
    return {
      blob: usedOriginal ? file : encoded,
      width,
      height,
      usedOriginal,
    };
  } finally {
    bitmap.close();
  }
}

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function setUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

async function createZip(
  entries: Array<{ name: string; blob: Blob }>,
): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(data);

    const localHeader = new ArrayBuffer(30);
    const local = new DataView(localHeader);
    setUint32(local, 0, 0x04034b50);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    setUint32(local, 14, checksum);
    setUint32(local, 18, data.byteLength);
    setUint32(local, 22, data.byteLength);
    local.setUint16(26, name.byteLength, true);
    local.setUint16(28, 0, true);
    localParts.push(localHeader, name, data);

    const centralHeader = new ArrayBuffer(46);
    const central = new DataView(centralHeader);
    setUint32(central, 0, 0x02014b50);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    setUint32(central, 16, checksum);
    setUint32(central, 20, data.byteLength);
    setUint32(central, 24, data.byteLength);
    central.setUint16(28, name.byteLength, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    setUint32(central, 38, 0);
    setUint32(central, 42, localOffset);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((size, part) => {
    if (part instanceof ArrayBuffer) return size + part.byteLength;
    if (ArrayBuffer.isView(part)) return size + part.byteLength;
    return size;
  }, 0);
  const endHeader = new ArrayBuffer(22);
  const end = new DataView(endHeader);
  setUint32(end, 0, 0x06054b50);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  setUint32(end, 12, centralSize);
  setUint32(end, 16, localOffset);

  return new Blob([...localParts, ...centralParts, endHeader], {
    type: "application/zip",
  });
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

export default function ImageCompressor() {
  const itemsRef = useRef<CompressionItem[]>([]);
  const [items, setItems] = useState<CompressionItem[]>([]);
  const [quality, setQuality] = useState(defaultCompressionQuality);
  const [qualityInput, setQualityInput] = useState(String(defaultCompressionQuality));
  const [compressing, setCompressing] = useState(false);
  const [packing, setPacking] = useState(false);
  const [message, setMessage] = useState("");
  const qualityInputValid = qualityInput.trim() !== ""
    && Number.isInteger(Number(qualityInput))
    && Number(qualityInput) >= 1 && Number(qualityInput) <= 100;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
    };
  }, []);

  const completedItems = useMemo(
    () => items.filter((item) => item.status === "done" && item.resultBlob),
    [items],
  );
  const originalTotal = completedItems.reduce(
    (total, item) => total + item.file.size,
    0,
  );
  const compressedTotal = completedItems.reduce(
    (total, item) => total + (item.resultBlob?.size ?? 0),
    0,
  );
  const savedPercent = originalTotal
    ? Math.max(0, Math.round((1 - compressedTotal / originalTotal) * 100))
    : 0;

  function resetResults(nextQuality: number) {
    if (compressing || packing) return;
    const normalized = normalizeCompressionQuality(nextQuality);
    setQualityInput(String(normalized));
    if (normalized === quality) return;
    setQuality(normalized);
    setItems((current) =>
      current.map((item) => {
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
        return {
          ...item,
          resultBlob: null,
          resultUrl: "",
          status: "ready",
          usedOriginal: false,
          error: "",
        };
      }),
    );
    setMessage("");
  }

  function editQuality(value: string) {
    if (compressing || packing) return;
    const number = Number(value);
    if (value.trim() && Number.isInteger(number) && number >= 1 && number <= 100) {
      resetResults(number);
    }
    setQualityInput(value);
  }

  function commitQuality() {
    const number = Number(qualityInput);
    resetResults(qualityInput.trim() && Number.isFinite(number) ? number : quality);
  }

  function handleFiles(files: File[]) {
    const remaining = Math.max(0, maxFiles - items.length);
    if (remaining === 0) {
      setMessage(`一次最多处理${maxFiles}张图片。`);
      return;
    }

    const accepted: File[] = [];
    let rejected = 0;
    for (const file of files.slice(0, remaining)) {
      if (!normalizeImageType(file) || file.size > maxFileSize) {
        rejected += 1;
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length) {
      setItems((current) => [...current, ...accepted.map(createItem)]);
    }
    const omitted = Math.max(0, files.length - remaining);
    if (rejected || omitted) {
      setMessage(
        `已跳过${rejected + omitted}个文件；仅支持JPG、PNG、WebP，单张最大25 MB，一次最多${maxFiles}张。`,
      );
    } else {
      setMessage("");
    }
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
  }

  function clearItems() {
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    setItems([]);
    setMessage("");
  }

  async function runCompression() {
    if (compressing || packing || !qualityInputValid) return;
    if (!items.length) {
      setMessage("请先选择需要压缩的图片。");
      return;
    }

    setCompressing(true);
    setMessage("");
    for (const sourceItem of items) {
      setItems((current) =>
        current.map((item) =>
          item.id === sourceItem.id
            ? { ...item, status: "compressing", error: "" }
            : item,
        ),
      );

      try {
        const result = await compressImage(sourceItem.file, quality);
        const resultUrl = URL.createObjectURL(result.blob);
        setItems((current) =>
          current.map((item) => {
            if (item.id !== sourceItem.id) return item;
            if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
            return {
              ...item,
              ...result,
              resultBlob: result.blob,
              resultUrl,
              status: "done",
              error: "",
            };
          }),
        );
      } catch (error) {
        setItems((current) =>
          current.map((item) =>
            item.id === sourceItem.id
              ? {
                  ...item,
                  status: "error",
                  error:
                    error instanceof Error ? error.message : "图片压缩失败",
                }
              : item,
          ),
        );
      }
    }
    setCompressing(false);
  }

  function downloadItem(item: CompressionItem) {
    if (!item.resultBlob || !item.resultUrl) return;
    triggerDownload(item.resultUrl, outputFileName(item.file));
  }

  async function downloadAll() {
    const ready = completedItems.filter((item) => item.resultBlob);
    if (!ready.length) return;
    setPacking(true);
    setMessage("");
    try {
      const archive = await createZip(
        ready.map((item) => ({
          name: outputFileName(item.file),
          blob: item.resultBlob as Blob,
        })),
      );
      const url = URL.createObjectURL(archive);
      triggerDownload(url, "compressed-images.zip");
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage("打包图片失败，请使用每张图片右侧的下载按钮。");
    } finally {
      setPacking(false);
    }
  }

  return (
    <main className="tool-shell image-compressor-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header image-compressor-header">
        <h1>图片压缩工具</h1>
        <p>支持批量压缩JPG、PNG和WebP。</p>
      </header>

      <section
        className="converter-card image-compressor-card"
        aria-label="批量图片压缩"
      >
        <FileDropZone
          className="image-compressor-picker"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          disabled={compressing || packing}
          onFiles={handleFiles}
          ariaLabel="选择或拖入多张图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>选择图片</strong>
          <span>点击选择或拖入多张图片，支持JPG、PNG、WebP，单张最大25 MB</span>
        </FileDropZone>

        <section
          className="image-compressor-settings"
          aria-labelledby="image-compressor-settings-title"
        >
          <div className="image-compressor-section-heading">
            <div>
              <h2 id="image-compressor-settings-title">压缩设置</h2>
              <span>{items.length ? `已选择 ${items.length} 张` : "尚未选择图片"}</span>
            </div>
            {items.length ? (
              <button
                className="image-compressor-clear"
                type="button"
                onClick={clearItems}
                disabled={compressing || packing}
              >
                <FiTrash2 aria-hidden="true" />
                清空
              </button>
            ) : null}
          </div>

          <div className="image-compressor-quality">
            <div className="image-compressor-quality-heading">
              <label htmlFor="image-quality-range">压缩质量</label>
              <div className="image-compressor-quality-number">
                <button
                  type="button"
                  aria-label="降低质量1%"
                  disabled={compressing || packing || quality <= 1}
                  onClick={() => resetResults(quality - 1)}
                >−</button>
                <input
                  id="image-quality-number"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  value={qualityInput}
                  aria-label="压缩质量百分比"
                  aria-describedby="image-quality-help"
                  aria-invalid={!qualityInputValid}
                  disabled={compressing || packing}
                  onChange={(event) => editQuality(event.target.value)}
                  onBlur={commitQuality}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitQuality();
                    }
                    if (event.key === "Escape") resetResults(quality);
                  }}
                />
                <span aria-hidden="true">%</span>
                <button
                  type="button"
                  aria-label="提高质量1%"
                  disabled={compressing || packing || quality >= 100}
                  onClick={() => resetResults(quality + 1)}
                >+</button>
              </div>
            </div>
            <input
              id="image-quality-range"
              type="range"
              min="1"
              max="100"
              step="1"
              value={quality}
              aria-valuetext={`${quality}%`}
              aria-describedby="image-quality-help"
              disabled={compressing || packing}
              onChange={(event) => resetResults(Number(event.target.value))}
            />
            <div className="image-compressor-quality-scale" aria-hidden="true">
              <span>1% · 更小体积</span><span>100% · 更多细节</span>
            </div>
            <div className="image-compressor-quality-presets" role="group" aria-label="常用压缩质量">
              {compressionQualityPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={qualityInputValid && quality === preset}
                  disabled={compressing || packing}
                  onClick={() => resetResults(preset)}
                >{preset}%</button>
              ))}
            </div>
          </div>
          <p id="image-quality-help" className="image-compressor-note">
            {qualityInputValid ? "支持1%～100%，每次微调1%；也可直接输入数值。" : "请输入1～100的整数；离开输入框时会自动校正。"}
            <br />
            JPG/WebP调整编码质量，PNG调整色彩精度并保留透明度。质量百分比不等于体积压缩率，100%不保证无损。
          </p>

          <div className="image-compressor-main-actions">
            <button
              className="convert-button image-compressor-run"
              type="button"
              onClick={runCompression}
              disabled={!items.length || compressing || packing || !qualityInputValid}
            >
              {compressing ? "正在逐张压缩…" : "开始压缩"}
            </button>
            <button
              className="open-button image-compressor-download-all"
              type="button"
              onClick={downloadAll}
              disabled={!completedItems.length || compressing || packing}
            >
              <FiArchive aria-hidden="true" />
              {packing ? "正在打包…" : "下载全部"}
            </button>
          </div>
        </section>

        {items.length ? (
          <section
            className="image-compressor-results"
            aria-labelledby="image-compressor-results-title"
          >
            <div className="image-compressor-results-heading">
              <h2 id="image-compressor-results-title">压缩列表</h2>
              {completedItems.length ? (
                <span>
                  {formatFileSize(originalTotal)} → {formatFileSize(compressedTotal)}
                  {savedPercent > 0 ? ` · 减少 ${savedPercent}%` : ""}
                </span>
              ) : (
                <span>等待压缩</span>
              )}
            </div>

            <div className="image-compressor-list">
              {items.map((item) => {
                const resultSize = item.resultBlob?.size ?? 0;
                const itemSaved = item.resultBlob
                  ? Math.max(
                      0,
                      Math.round((1 - resultSize / item.file.size) * 100),
                    )
                  : 0;

                return (
                  <article className="image-compressor-item" key={item.id}>
                    <div className="image-compressor-thumbnail">
                      {/* eslint-disable-next-line @next/next/no-img-element -- The preview uses a local blob URL. */}
                      <img src={item.resultUrl || item.previewUrl} alt="" />
                    </div>
                    <div className="image-compressor-item-copy">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>
                        {formatFileSize(item.file.size)}
                        {item.resultBlob
                          ? ` → ${formatFileSize(resultSize)}`
                          : ""}
                        {item.width && item.height
                          ? ` · ${item.width} × ${item.height}`
                          : ""}
                      </span>
                      {item.status === "done" ? (
                        <small data-state="done">
                          <FiCheck aria-hidden="true" />
                          {item.usedOriginal
                            ? "原图已是更小版本"
                            : `已压缩${itemSaved ? ` · 减少 ${itemSaved}%` : ""}`}
                        </small>
                      ) : null}
                      {item.status === "compressing" ? (
                        <small data-state="working">正在压缩…</small>
                      ) : null}
                      {item.status === "error" ? (
                        <small data-state="error">{item.error}</small>
                      ) : null}
                    </div>
                    <div className="image-compressor-item-actions">
                      {item.status === "done" ? (
                        <button
                          type="button"
                          onClick={() => downloadItem(item)}
                          aria-label={`下载${item.file.name}`}
                          title="下载压缩图片"
                        >
                          <FiDownload aria-hidden="true" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={compressing || packing}
                        aria-label={`移除${item.file.name}`}
                        title="移除图片"
                      >
                        <FiX aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="image-compressor-empty" aria-live="polite">
            <FiImage aria-hidden="true" />
            <strong>压缩结果会显示在这里</strong>
            <span>可以一次选择或拖入多张图片</span>
          </div>
        )}

        {message ? (
          <p className="message" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
