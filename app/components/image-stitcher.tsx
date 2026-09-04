"use client";

/* eslint-disable @next/next/no-img-element -- 预览图来自用户本地选择的 Blob URL。 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowDown,
  FiArrowUp,
  FiDownload,
  FiImage,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import {
  calculateStitchLayout,
  imageStitchingLimits,
  supportedStitchImageText,
  validateStitchImages,
  validateStitchLayout,
  type StitchAlignment,
  type StitchDirection,
  type StitchSizeMode,
} from "../lib/image-stitching";
import { FileDropZone } from "./file-drop-zone";

type ImageItem = {
  id: string;
  file: File;
  url: string;
};

type StitchResult = {
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
};

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

const acceptedImages = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function resultExtension(format: OutputFormat) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/webp") return "webp";
  return "png";
}

async function decodeImage(item: ImageItem): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Safari 的部分图片格式不支持 createImageBitmap，继续使用 img 解码。
    }
  }

  const image = new Image();
  image.decoding = "async";
  image.src = item.url;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => undefined,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("浏览器无法导出拼接图片")),
      format,
      format === "image/png" ? undefined : quality / 100,
    );
  });
}

export default function ImageStitcher() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [direction, setDirection] = useState<StitchDirection>("vertical");
  const [sizeMode, setSizeMode] = useState<StitchSizeMode>("uniform");
  const [crossSize, setCrossSize] = useState(1080);
  const [gap, setGap] = useState(0);
  const [padding, setPadding] = useState(0);
  const [alignment, setAlignment] = useState<StitchAlignment>("center");
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [quality, setQuality] = useState(92);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<StitchResult | null>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const resultUrlRef = useRef("");
  const jobRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    jobRef.current += 1;
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setStatus("");
  }

  function changeSetting(action: () => void) {
    clearResult();
    setError("");
    action();
  }

  function addFiles(files: File[]) {
    const currentFiles = itemsRef.current.map((item) => item.file);
    const { accepted, errors } = validateStitchImages(files, currentFiles);
    if (accepted.length) {
      clearResult();
      setItems((current) => [
        ...current,
        ...accepted.map((file) => ({
          id: typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          url: URL.createObjectURL(file),
        })),
      ]);
    }
    setError(errors[0] ?? "");
  }

  function moveItem(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    clearResult();
    setError("");
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(index: number) {
    const item = items[index];
    if (!item) return;
    URL.revokeObjectURL(item.url);
    clearResult();
    setError("");
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearAll() {
    jobRef.current += 1;
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    clearResult();
    setError("");
    setWorking(false);
  }

  async function stitchImages() {
    if (items.length < 2 || working) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setError("浏览器无法创建拼接画布");
      return;
    }

    const job = ++jobRef.current;
    const decoded: DecodedImage[] = [];
    clearResult();
    setError("");
    setWorking(true);

    try {
      for (let index = 0; index < items.length; index += 1) {
        setStatus(`正在读取第 ${index + 1} / ${items.length} 张图片`);
        const image = await decodeImage(items[index]);
        if (job !== jobRef.current) {
          image.close();
          return;
        }
        if (!image.width || !image.height || image.width * image.height > imageStitchingLimits.maxInputPixels) {
          image.close();
          throw new Error(`${items[index].file.name}：图片尺寸无效或超过4000万像素`);
        }
        decoded.push(image);
      }

      const layout = calculateStitchLayout(decoded, {
        direction,
        sizeMode,
        crossSize,
        gap,
        padding,
        alignment,
      });
      const layoutError = validateStitchLayout(layout);
      if (layoutError) throw new Error(layoutError);

      canvas.width = layout.width;
      canvas.height = layout.height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("浏览器无法创建拼接画布");
      context.clearRect(0, 0, layout.width, layout.height);
      if (!transparent || format === "image/jpeg") {
        context.fillStyle = transparent ? "#ffffff" : background;
        context.fillRect(0, 0, layout.width, layout.height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      layout.rects.forEach((rect, index) => {
        context.drawImage(decoded[index].source, rect.x, rect.y, rect.width, rect.height);
      });
      setStatus("正在导出拼接图片");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (job !== jobRef.current) return;

      const blob = await canvasToBlob(canvas, format, quality);
      if (job !== jobRef.current) return;
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({
        url,
        name: `stitched-${items.length}-images.${resultExtension(format)}`,
        size: blob.size,
        width: layout.width,
        height: layout.height,
      });
      setStatus("图片拼接完成");
    } catch (cause) {
      if (job === jobRef.current) {
        setError(cause instanceof Error ? cause.message : "图片拼接失败，请减少图片后重试");
        setStatus("");
      }
    } finally {
      decoded.forEach((image) => image.close());
      if (job === jobRef.current) setWorking(false);
    }
  }

  const crossSizeLabel = direction === "horizontal" ? "统一图片高度" : "统一图片宽度";
  const alignmentLabels = direction === "horizontal"
    ? { start: "顶部", center: "居中", end: "底部" }
    : { start: "左侧", center: "居中", end: "右侧" };

  return (
    <main className="tool-shell image-stitch-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header image-stitch-header">
        <h1>图片拼接工具</h1>
        <p>将多张图片按指定顺序横向或纵向拼接。</p>
      </header>

      <section className="converter-card image-stitch-card" aria-label="图片拼接" aria-busy={working}>
        <FileDropZone
          className="image-compressor-picker"
          accept={acceptedImages}
          multiple
          disabled={working}
          onFiles={addFiles}
          ariaLabel="选择或拖入多张图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>选择图片</strong>
          <span>点击选择或拖入多张图片 · {supportedStitchImageText} · 最多30张</span>
        </FileDropZone>

        {error && <p className="image-stitch-error" role="alert">{error}</p>}

        <div className="image-stitch-layout">
          <section className="image-stitch-panel" aria-labelledby="image-stitch-list-title">
            <div className="image-stitch-heading">
              <div>
                <h2 id="image-stitch-list-title">图片顺序</h2>
                <span>{items.length ? `${items.length}张 · ${formatFileSize(totalSize)}` : "至少选择2张图片"}</span>
              </div>
              {items.length > 0 && (
                <button type="button" disabled={working} onClick={clearAll}>
                  <FiTrash2 aria-hidden="true" />清空
                </button>
              )}
            </div>

            {items.length > 0 ? (
              <div className="image-stitch-list">
                {items.map((item, index) => (
                  <article className="image-stitch-item" key={item.id}>
                    <span className="image-stitch-index">{index + 1}</span>
                    <img src={item.url} alt="" />
                    <div className="image-stitch-file">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>{formatFileSize(item.file.size)}</span>
                    </div>
                    <div className="image-stitch-order">
                      <button type="button" aria-label={`上移${item.file.name}`} disabled={working || index === 0} onClick={() => moveItem(index, -1)}><FiArrowUp aria-hidden="true" /></button>
                      <button type="button" aria-label={`下移${item.file.name}`} disabled={working || index === items.length - 1} onClick={() => moveItem(index, 1)}><FiArrowDown aria-hidden="true" /></button>
                      <button type="button" aria-label={`移除${item.file.name}`} disabled={working} onClick={() => removeItem(index)}><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="file-tool-empty image-stitch-empty">
                <FiImage aria-hidden="true" />
                <strong>尚未选择图片</strong>
                <span>添加图片后可调整拼接顺序</span>
              </div>
            )}
          </section>

          <section className="image-stitch-panel image-stitch-settings" aria-labelledby="image-stitch-settings-title">
            <h2 id="image-stitch-settings-title">拼接设置</h2>
            <fieldset disabled={working}>
              <legend>拼接方向</legend>
              <div className="image-stitch-options" role="group" aria-label="拼接方向">
                <button type="button" aria-pressed={direction === "vertical"} onClick={() => changeSetting(() => setDirection("vertical"))}>纵向拼接</button>
                <button type="button" aria-pressed={direction === "horizontal"} onClick={() => changeSetting(() => setDirection("horizontal"))}>横向拼接</button>
              </div>
            </fieldset>

            <fieldset disabled={working}>
              <legend>图片尺寸</legend>
              <div className="image-stitch-options" role="group" aria-label="图片尺寸">
                <button type="button" aria-pressed={sizeMode === "uniform"} onClick={() => changeSetting(() => setSizeMode("uniform"))}>{direction === "horizontal" ? "统一高度" : "统一宽度"}</button>
                <button type="button" aria-pressed={sizeMode === "original"} onClick={() => changeSetting(() => setSizeMode("original"))}>保持原尺寸</button>
              </div>
            </fieldset>

            {sizeMode === "uniform" && (
              <label className="image-stitch-range">
                <span>{crossSizeLabel}<output>{crossSize}px</output></span>
                <input type="range" min="100" max="3000" step="10" value={crossSize} disabled={working} onChange={(event) => changeSetting(() => setCrossSize(Number(event.target.value)))} />
              </label>
            )}

            <label className="image-stitch-range">
              <span>图片间距<output>{gap}px</output></span>
              <input type="range" min="0" max="100" step="1" value={gap} disabled={working} onChange={(event) => changeSetting(() => setGap(Number(event.target.value)))} />
            </label>

            <label className="image-stitch-range">
              <span>外边距<output>{padding}px</output></span>
              <input type="range" min="0" max="100" step="1" value={padding} disabled={working} onChange={(event) => changeSetting(() => setPadding(Number(event.target.value)))} />
            </label>

            <fieldset disabled={working}>
              <legend>图片对齐</legend>
              <div className="image-stitch-options is-three" role="group" aria-label="图片对齐">
                {(["start", "center", "end"] as StitchAlignment[]).map((value) => (
                  <button type="button" key={value} aria-pressed={alignment === value} onClick={() => changeSetting(() => setAlignment(value))}>{alignmentLabels[value]}</button>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={working}>
              <legend>背景</legend>
              <div className="image-stitch-options" role="group" aria-label="拼接背景">
                <button type="button" aria-pressed={transparent} onClick={() => changeSetting(() => setTransparent(true))}>透明</button>
                <button type="button" aria-pressed={!transparent} onClick={() => changeSetting(() => setTransparent(false))}>自定义颜色</button>
              </div>
              <label className="image-stitch-color">
                <span>背景颜色</span>
                <input type="color" value={background} disabled={working || transparent} onChange={(event) => changeSetting(() => setBackground(event.target.value))} />
              </label>
            </fieldset>

            <label className="image-stitch-select">
              <span>输出格式</span>
              <select value={format} disabled={working} onChange={(event) => changeSetting(() => setFormat(event.target.value as OutputFormat))}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>

            {format !== "image/png" && (
              <label className="image-stitch-range">
                <span>输出质量<output>{quality}%</output></span>
                <input type="range" min="10" max="100" step="1" value={quality} disabled={working} onChange={(event) => changeSetting(() => setQuality(Number(event.target.value)))} />
              </label>
            )}

            <button className="convert-button image-stitch-run" type="button" disabled={items.length < 2 || working} onClick={stitchImages}>
              {working ? "正在拼接…" : "开始拼接"}
            </button>
          </section>
        </div>

        <section className="image-stitch-result" aria-labelledby="image-stitch-result-title">
          <div className="image-stitch-heading">
            <div>
              <h2 id="image-stitch-result-title">拼接预览</h2>
              <span>{result ? `${result.width} × ${result.height} · ${formatFileSize(result.size)}` : "等待拼接"}</span>
            </div>
            {result && (
              <a className="gif-download-button" href={result.url} download={result.name}>
                <FiDownload aria-hidden="true" />下载图片
              </a>
            )}
          </div>
          {status && <p className="image-stitch-status" role="status">{status}</p>}
          {result ? (
            <div className="image-stitch-preview"><img src={result.url} alt="拼接后的图片预览" /></div>
          ) : (
            <div className="file-tool-empty image-stitch-result-empty">
              <FiImage aria-hidden="true" />
              <strong>拼接图片会显示在这里</strong>
              <span>选择至少2张图片并完成拼接</span>
            </div>
          )}
        </section>
      </section>
      <canvas ref={canvasRef} className="video-gif-canvas" aria-hidden="true" />
    </main>
  );
}
