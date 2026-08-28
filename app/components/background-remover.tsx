"use client";

import Link from "next/link";
import type { BackgroundRemovalPipeline } from "@huggingface/transformers";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiDownload,
  FiImage,
  FiScissors,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type PreviewBackground = "transparent" | "white" | "custom";
type RemovalMode = "fp16" | "q8" | "ben2";
type ProgressInfo = {
  status: string;
  progress?: number;
};

const maxImagePixels = 25_000_000;

const removerModels: Record<
  RemovalMode,
  {
    id: string;
    dtype: "fp16" | "q8";
    label: string;
    model: string;
    download: string;
    performance: string;
    performanceLevel: "high" | "low";
    loadingLabel: string;
  }
> = {
  fp16: {
    id: "onnx-community/ISNet-ONNX",
    dtype: "fp16",
    label: "IS-Net FP16",
    model: "高清度",
    download: "首次下载约 80 MB",
    performance: "性能占用较高",
    performanceLevel: "high",
    loadingLabel: "IS-Net FP16",
  },
  q8: {
    id: "onnx-community/ISNet-ONNX",
    dtype: "q8",
    label: "IS-Net QInt8",
    model: "性能优",
    download: "首次下载约 40 MB",
    performance: "性能占用较低",
    performanceLevel: "low",
    loadingLabel: "IS-Net QInt8",
  },
  ben2: {
    id: "onnx-community/BEN2-ONNX",
    dtype: "fp16",
    label: "BEN2 FP16",
    model: "精细边缘",
    download: "首次下载约 219 MB",
    performance: "性能占用高",
    performanceLevel: "high",
    loadingLabel: "BEN2 FP16",
  },
};

const removerPromises = new Map<
  RemovalMode,
  Promise<BackgroundRemovalPipeline>
>();

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

async function loadRemover(
  mode: RemovalMode,
  onProgress: (info: ProgressInfo) => void,
): Promise<BackgroundRemovalPipeline> {
  const existing = removerPromises.get(mode);
  if (existing) return existing;

  const nextPromise = import("@huggingface/transformers")
    .then(({ pipeline }) =>
      pipeline("background-removal", removerModels[mode].id, {
        dtype: removerModels[mode].dtype,
        progress_callback: onProgress,
      }),
    )
    .catch((error) => {
      removerPromises.delete(mode);
      throw error;
    });

  removerPromises.set(mode, nextPromise);
  return nextPromise;
}

export default function BackgroundRemover() {
  const sourceUrlRef = useRef("");
  const outputUrlRef = useRef("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [removalMode, setRemovalMode] = useState<RemovalMode>("fp16");
  const [previewBackground, setPreviewBackground] =
    useState<PreviewBackground>("transparent");
  const [customBackground, setCustomBackground] = useState("#cfe2f1");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("等待开始");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  async function handleSourceFile(file: File) {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
    if (!looksLikeImage) {
      setMessage("请选择PNG、JPG、WebP等常见图片。");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage("图片不能超过20 MB。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);

    const nextSourceUrl = URL.createObjectURL(file);
    sourceUrlRef.current = nextSourceUrl;
    outputUrlRef.current = "";

    try {
      const image = await loadImage(nextSourceUrl);
      if (image.naturalWidth * image.naturalHeight > maxImagePixels) {
        throw new Error("图片像素不能超过2500万");
      }
      setSourceFile(file);
      setSourceImage(image);
      setSourceUrl(nextSourceUrl);
      setOutputBlob(null);
      setOutputUrl("");
      setProgress(0);
      setStatus("等待开始");
      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(nextSourceUrl);
      sourceUrlRef.current = "";
      setMessage(
        error instanceof Error ? `${error.message}。` : "图片读取失败。",
      );
    }
  }

  async function removeBackground() {
    if (!sourceFile) {
      setMessage("请先选择一张图片。");
      return;
    }

    setProcessing(true);
    setProgress(0);
    setStatus(`正在加载${removerModels[removalMode].loadingLabel}…`);
    setMessage("");

    try {
      const remover = await loadRemover(removalMode, (info) => {
        if (info.status !== "progress" || info.progress === undefined) return;
        setProgress((current) =>
          Math.max(current, Math.min(100, Math.round(info.progress ?? 0))),
        );
      });

      setProgress(100);
      setStatus("正在识别主体与细节边缘…");
      const [result] = await remover(sourceFile);
      if (!result) throw new Error("模型没有返回抠图结果");

      const blob = await result.toBlob("image/png");
      if (!blob) throw new Error("无法生成透明PNG");

      if (outputUrlRef.current) {
        URL.revokeObjectURL(outputUrlRef.current);
      }
      const nextOutputUrl = URL.createObjectURL(blob);
      outputUrlRef.current = nextOutputUrl;
      setOutputBlob(blob);
      setOutputUrl(nextOutputUrl);
      setStatus("抠图完成");
    } catch (error) {
      setProgress(0);
      setStatus("处理失败");
      setMessage(
        error instanceof Error
          ? `抠图失败：${error.message}。请检查网络后重试。`
          : "抠图失败，请检查网络后重试。",
      );
    } finally {
      setProcessing(false);
    }
  }

  function downloadImage() {
    if (!outputBlob || !outputUrl || !sourceFile) {
      setMessage("请先完成抠图。");
      return;
    }

    const baseName =
      sourceFile.name.replace(/\.[^.]+$/, "") || "background-removed";
    const link = document.createElement("a");
    link.href = outputUrl;
    link.download = `${baseName}-透明背景.png`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function selectRemovalMode(mode: RemovalMode) {
    if (mode === removalMode || processing) return;

    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = "";
    }
    setRemovalMode(mode);
    setOutputBlob(null);
    setOutputUrl("");
    setProgress(0);
    setStatus("等待开始");
    setMessage("");
  }

  const previewStyle =
    previewBackground === "custom"
      ? ({ "--cutout-preview-bg": customBackground } as CSSProperties)
      : undefined;

  return (
    <main className="tool-shell background-remover-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header background-remover-header">
        <h1>智能抠图工具</h1>
      </header>

      <section
        className="converter-card background-remover-card"
        aria-label="智能抠图"
      >
        <FileDropZone
          className="background-remover-picker"
          accept="image/*"
          onFile={handleSourceFile}
          ariaLabel="选择或拖入图片"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{sourceFile ? "重新选择图片" : "选择图片"}</strong>
          <span>点击选择或拖入图片，支持PNG、JPG、WebP等格式，最大20 MB</span>
        </FileDropZone>

        <div className="background-remover-workbench">
            <section
              className="background-remover-preview"
              aria-labelledby="background-remover-preview-title"
            >
              <div className="background-remover-section-heading">
                <h2 id="background-remover-preview-title">抠图预览</h2>
                <span>
                  {sourceImage
                    ? `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight}`
                    : "尚未选择图片"}
                </span>
              </div>

              <div className="background-remover-compare">
                <figure>
                  <figcaption>原图</figcaption>
                  <div className="background-remover-preview-frame is-original">
                    {sourceUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- The preview uses a browser-created blob URL.
                      <img src={sourceUrl} alt="待抠图的原始图片" />
                    ) : (
                      <span className="background-remover-empty">
                        <FiImage aria-hidden="true" />
                        选择图片后在这里预览
                      </span>
                    )}
                  </div>
                </figure>

                <figure>
                  <figcaption>透明背景</figcaption>
                  <div
                    className={`background-remover-preview-frame is-result is-${previewBackground}`}
                    style={previewStyle}
                  >
                    {outputUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- The preview uses a browser-created blob URL.
                      <img src={outputUrl} alt="智能抠图结果预览" />
                    ) : (
                      <span className="background-remover-empty">
                        <FiImage aria-hidden="true" />
                        完成后在这里预览
                      </span>
                    )}
                  </div>
                </figure>
              </div>
            </section>

            <section
              className="background-remover-settings"
              aria-labelledby="background-remover-settings-title"
            >
              <h2 id="background-remover-settings-title">抠图设置</h2>

              <fieldset className="background-remover-models">
                <legend>AI 模型</legend>
                <div>
                  {(Object.keys(removerModels) as RemovalMode[]).map((mode) => {
                    const model = removerModels[mode];
                    return (
                      <button
                        key={mode}
                        className={removalMode === mode ? "is-selected" : ""}
                        type="button"
                        onClick={() => selectRemovalMode(mode)}
                        aria-pressed={removalMode === mode}
                        disabled={processing}
                      >
                        <span>
                          <strong>{model.label}</strong>
                          <small>{model.download} · {model.performance.replace("性能占用", "占用")}</small>
                        </span>
                        {removalMode === mode && <FiCheck aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <button
                className="convert-button background-remover-run"
                type="button"
                onClick={removeBackground}
                disabled={!sourceFile || processing}
              >
                <FiScissors aria-hidden="true" />
                {!sourceFile
                  ? "请先选择图片"
                  : processing
                    ? status
                    : outputUrl
                      ? "重新精细抠图"
                      : "开始精细抠图"}
              </button>

              {processing ? (
                <div
                  className="background-remover-progress"
                  aria-label={status}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  role="progressbar"
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              ) : null}

              <fieldset className="background-remover-backgrounds">
                <legend>预览背景</legend>
                <div>
                  {(
                    [
                      ["transparent", "透明"],
                      ["white", "白色"],
                      ["custom", "自定义"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      className={
                        previewBackground === value ? "is-selected" : ""
                      }
                      type="button"
                      key={value}
                      onClick={() => setPreviewBackground(value)}
                      aria-pressed={previewBackground === value}
                    >
                      {previewBackground === value ? (
                        <FiCheck aria-hidden="true" />
                      ) : null}
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {previewBackground === "custom" ? (
                <label className="background-remover-color">
                  <span>背景颜色</span>
                  <span>
                    <input
                      type="color"
                      value={customBackground}
                      onChange={(event) =>
                        setCustomBackground(event.target.value)
                      }
                    />
                    <code>{customBackground.toUpperCase()}</code>
                  </span>
                </label>
              ) : null}

              {sourceFile && sourceImage ? (
                <div className="background-remover-file">
                  <FiImage aria-hidden="true" />
                  <div>
                    <strong>{sourceFile.name}</strong>
                    <span>
                      {formatFileSize(sourceFile.size)} ·{" "}
                      {sourceImage.naturalWidth} × {sourceImage.naturalHeight}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="background-remover-file is-empty">
                  <FiImage aria-hidden="true" />
                  <div>
                    <strong>尚未选择图片</strong>
                    <span>选择图片后可开始抠图</span>
                  </div>
                </div>
              )}

              <button
                className="convert-button background-remover-download"
                type="button"
                onClick={downloadImage}
                disabled={!outputBlob || processing}
              >
                <FiDownload aria-hidden="true" />
                下载透明PNG
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
