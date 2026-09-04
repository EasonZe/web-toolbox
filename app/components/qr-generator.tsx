"use client";

import QRCode from "qrcode";
import NextImage from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiDownload, FiImage, FiUploadCloud, FiX } from "react-icons/fi";
import { TbQrcode } from "react-icons/tb";
import { FileDropZone } from "./file-drop-zone";

type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
type DecorationKind = "logo" | "background";
type ColorKind = "foreground" | "background";

const sizeOptions = [256, 512, 768, 1024];

const errorLevelOptions: Array<{
  value: ErrorCorrectionLevel;
  label: string;
  detail: string;
}> = [
  { value: "L", label: "低", detail: "约7%" },
  { value: "M", label: "中", detail: "约15%" },
  { value: "Q", label: "较高", detail: "约25%" },
  { value: "H", label: "高", detail: "约30%" },
];

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片"));
    image.src = url;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;

  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

export default function QrGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoUrlRef = useRef("");
  const backgroundImageUrlRef = useRef("");
  const [content, setContent] = useState("");
  const [size, setSize] = useState(512);
  const [errorLevel, setErrorLevel] =
    useState<ErrorCorrectionLevel>("M");
  const [margin, setMargin] = useState(2);
  const [foreground, setForeground] = useState("#183442");
  const [foregroundInput, setForegroundInput] = useState("#183442");
  const [background, setBackground] = useState("#ffffff");
  const [backgroundInput, setBackgroundInput] = useState("#FFFFFF");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoName, setLogoName] = useState("");
  const [logoScale, setLogoScale] = useState(18);
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [backgroundImageName, setBackgroundImageName] = useState("");
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(16);
  const [message, setMessage] = useState("");
  const [rendering, setRendering] = useState(false);

  const normalizedContent = content.trim();

  useEffect(() => {
    return () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      if (backgroundImageUrlRef.current) {
        URL.revokeObjectURL(backgroundImageUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !normalizedContent) return;

    let active = true;
    setRendering(true);
    setMessage("");

    async function renderQrCode() {
      const qrCanvas = document.createElement("canvas");

      await QRCode.toCanvas(qrCanvas, normalizedContent, {
        width: size,
        margin,
        errorCorrectionLevel: logoImage ? "H" : errorLevel,
        color: {
          dark: foreground,
          light: "#00000000",
        },
      });

      if (!active || !canvas) return;

      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法创建二维码画布");

      context.clearRect(0, 0, size, size);
      if (!transparentBackground) {
        context.fillStyle = background;
        context.fillRect(0, 0, size, size);
      }

      if (backgroundImage) {
        context.save();
        context.globalAlpha = backgroundImageOpacity / 100;
        drawImageCover(context, backgroundImage, 0, 0, size, size);
        context.restore();
      }

      context.drawImage(qrCanvas, 0, 0, size, size);

      if (logoImage) {
        const logoSize = Math.round(size * (logoScale / 100));
        const logoX = (size - logoSize) / 2;
        const logoY = (size - logoSize) / 2;
        drawImageContain(context, logoImage, logoX, logoY, logoSize, logoSize);
      }

      if (!active) return;

      // 预览完整适配容器，下载仍保留 canvas 的原始像素尺寸。
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      setRendering(false);
    }

    renderQrCode().catch((error: unknown) => {
      if (!active) return;
      setRendering(false);
      setMessage(
        error instanceof Error
          ? `二维码生成失败：${error.message}`
          : "二维码生成失败，请缩短输入内容。",
      );
    });

    return () => {
      active = false;
    };
  }, [
    background,
    backgroundImage,
    backgroundImageOpacity,
    errorLevel,
    foreground,
    logoImage,
    logoScale,
    margin,
    normalizedContent,
    size,
    transparentBackground,
  ]);

  function updateColor(kind: ColorKind, value: string) {
    const nextValue = value.toUpperCase().slice(0, 7);
    const normalizedValue = nextValue.startsWith("#")
      ? nextValue
      : `#${nextValue}`;

    if (kind === "foreground") setForegroundInput(normalizedValue);
    else setBackgroundInput(normalizedValue);

    if (!/^#[0-9A-F]{6}$/.test(normalizedValue)) return;
    if (kind === "foreground") setForeground(normalizedValue);
    else setBackground(normalizedValue);
  }

  function resetColorInput(kind: ColorKind) {
    if (kind === "foreground") setForegroundInput(foreground.toUpperCase());
    else setBackgroundInput(background.toUpperCase());
  }

  async function handleDecorationImage(
    kind: DecorationKind,
    file: File,
  ) {
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);

    if (!isImage) {
      setMessage("请选择PNG、JPG、WebP等常见图片格式。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("装饰图片不能超过10 MB。");
      return;
    }

    const nextUrl = URL.createObjectURL(file);

    try {
      const image = await loadImage(nextUrl);

      if (kind === "logo") {
        if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
        logoUrlRef.current = nextUrl;
        setLogoImage(image);
        setLogoUrl(nextUrl);
        setLogoName(file.name);
      } else {
        if (backgroundImageUrlRef.current) {
          URL.revokeObjectURL(backgroundImageUrlRef.current);
        }
        backgroundImageUrlRef.current = nextUrl;
        setBackgroundImage(image);
        setBackgroundImageUrl(nextUrl);
        setBackgroundImageName(file.name);
      }

      setMessage("");
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      setMessage(
        error instanceof Error ? `${error.message}。` : "装饰图片读取失败。",
      );
    }
  }

  function removeDecorationImage(kind: DecorationKind) {
    if (kind === "logo") {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = "";
      setLogoImage(null);
      setLogoUrl("");
      setLogoName("");
    } else {
      if (backgroundImageUrlRef.current) {
        URL.revokeObjectURL(backgroundImageUrlRef.current);
      }
      backgroundImageUrlRef.current = "";
      setBackgroundImage(null);
      setBackgroundImageUrl("");
      setBackgroundImageName("");
    }
    setMessage("");
  }

  function downloadQrCode() {
    const canvas = canvasRef.current;
    if (!canvas || !normalizedContent || rendering) {
      setMessage("请先输入需要生成二维码的内容。");
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage("二维码导出失败，请重试。");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eason-qrcode.png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  return (
    <main className="tool-shell qr-generator-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header qr-generator-header">
        <h1>二维码生成工具</h1>
        <p>生成支持颜色、Logo与背景图片的二维码。</p>
      </header>

      <section
        className="converter-card qr-generator-card"
        aria-label="二维码生成"
      >
        <div className="qr-generator-workbench">
          <section
            className="qr-preview-panel"
            aria-labelledby="qr-preview-title"
          >
            <div className="qr-section-heading">
              <h2 id="qr-preview-title">二维码预览</h2>
              {normalizedContent ? <span>{size} × {size} px</span> : null}
            </div>

            <div
              className={`qr-preview-frame${
                transparentBackground ? " is-transparent" : ""
              }`}
            >
              {normalizedContent ? (
                <canvas
                  ref={canvasRef}
                  aria-label="生成的二维码预览"
                />
              ) : (
                <div className="qr-empty-state">
                  <TbQrcode aria-hidden="true" />
                  <strong>输入内容后生成</strong>
                  <span>支持文字、网址及其他文本内容</span>
                </div>
              )}
            </div>

            <button
              className="convert-button qr-download-button"
              type="button"
              onClick={downloadQrCode}
              disabled={!normalizedContent || rendering || Boolean(message)}
            >
              <FiDownload aria-hidden="true" />
              {rendering ? "正在生成…" : "下载PNG"}
            </button>
          </section>

          <section
            className="qr-settings-panel"
            aria-labelledby="qr-settings-title"
          >
            <h2 id="qr-settings-title">二维码设置</h2>

            <label className="qr-content-control">
              <span>
                内容
                <strong>{content.length}/2000</strong>
              </span>
              <textarea
                value={content}
                maxLength={2000}
                rows={6}
                onChange={(event) => setContent(event.target.value)}
                placeholder="输入网址、文字或其他内容"
                autoFocus
              />
            </label>

            <div className="qr-settings-grid">
              <label>
                <span>导出尺寸</span>
                <select
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                >
                  {sizeOptions.map((option) => (
                    <option value={option} key={option}>
                      {option} × {option} px
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>
                  留白
                  <strong>{margin}格</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="6"
                  value={margin}
                  onChange={(event) => setMargin(Number(event.target.value))}
                />
              </label>
            </div>

            <fieldset className="qr-error-level">
              <legend>容错级别</legend>
              <div>
                {errorLevelOptions.map((option) => (
                  <button
                    className={errorLevel === option.value ? "is-selected" : ""}
                    type="button"
                    key={option.value}
                    onClick={() => setErrorLevel(option.value)}
                    aria-pressed={errorLevel === option.value}
                    title={`可恢复${option.detail}的数据`}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="qr-color-grid">
              <div className="qr-color-control">
                <span>二维码颜色</span>
                <span className="qr-color-picker">
                  <input
                    type="color"
                    value={foreground}
                    aria-label="选择二维码颜色"
                    onChange={(event) => {
                      const value = event.target.value.toUpperCase();
                      setForeground(value);
                      setForegroundInput(value);
                    }}
                  />
                  <input
                    className="qr-color-value"
                    type="text"
                    value={foregroundInput}
                    maxLength={7}
                    spellCheck={false}
                    aria-label="输入二维码HEX颜色"
                    onChange={(event) =>
                      updateColor("foreground", event.target.value)
                    }
                    onBlur={() => resetColorInput("foreground")}
                  />
                </span>
              </div>

              <div className="qr-color-control">
                <span className="qr-color-heading">
                  <span>背景颜色</span>
                  <label className="qr-transparent-toggle">
                    <input
                      type="checkbox"
                      checked={transparentBackground}
                      onChange={(event) =>
                        setTransparentBackground(event.target.checked)
                      }
                    />
                    <span>透明背景</span>
                  </label>
                </span>
                <span className="qr-color-picker">
                  <input
                    type="color"
                    value={background}
                    disabled={transparentBackground}
                    aria-label="选择二维码背景颜色"
                    onChange={(event) => {
                      const value = event.target.value.toUpperCase();
                      setBackground(value);
                      setBackgroundInput(value);
                    }}
                  />
                  <input
                    className="qr-color-value"
                    type="text"
                    value={backgroundInput}
                    maxLength={7}
                    spellCheck={false}
                    disabled={transparentBackground}
                    aria-label="输入背景HEX颜色"
                    onChange={(event) =>
                      updateColor("background", event.target.value)
                    }
                    onBlur={() => resetColorInput("background")}
                  />
                </span>
              </div>
            </div>

            <fieldset className="qr-decoration-settings">
              <legend>图片装饰</legend>
              <div className="qr-image-grid">
                <div className="qr-image-control">
                  <div className="qr-image-control-heading">
                    <strong>中心 Logo</strong>
                    <span>直接使用原图，不添加底板</span>
                  </div>
                  {logoUrl ? (
                    <div className="qr-image-file">
                      <NextImage
                        src={logoUrl}
                        alt=""
                        width={38}
                        height={38}
                        unoptimized
                      />
                      <span>
                        <strong>{logoName}</strong>
                        <small>已自动启用高容错</small>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDecorationImage("logo")}
                        aria-label="移除中心 Logo"
                      >
                        <FiX aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <FileDropZone
                      className="qr-image-picker"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      onFile={(file) => handleDecorationImage("logo", file)}
                      ariaLabel="选择或拖入中心 Logo"
                    >
                      <FiUploadCloud aria-hidden="true" />
                      <span>上传 Logo（支持拖入）</span>
                    </FileDropZone>
                  )}
                </div>

                <div className="qr-image-control">
                  <div className="qr-image-control-heading">
                    <strong>背景图片</strong>
                    <span>支持自定义背景图片透明度</span>
                  </div>
                  {backgroundImageUrl ? (
                    <div className="qr-image-file">
                      <NextImage
                        src={backgroundImageUrl}
                        alt=""
                        width={38}
                        height={38}
                        unoptimized
                      />
                      <span>
                        <strong>{backgroundImageName}</strong>
                        <small>已铺满二维码背景</small>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDecorationImage("background")}
                        aria-label="移除背景图片"
                      >
                        <FiX aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <FileDropZone
                      className="qr-image-picker"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      onFile={(file) =>
                        handleDecorationImage("background", file)
                      }
                      ariaLabel="选择或拖入二维码背景"
                    >
                      <FiImage aria-hidden="true" />
                      <span>上传背景（支持拖入）</span>
                    </FileDropZone>
                  )}
                </div>
              </div>

              {logoImage || backgroundImage ? (
                <div className="qr-decoration-ranges">
                  {logoImage ? (
                    <label>
                      <span>
                        Logo大小
                        <strong>{logoScale}%</strong>
                      </span>
                      <input
                        type="range"
                        min="12"
                        max="22"
                        value={logoScale}
                        onChange={(event) =>
                          setLogoScale(Number(event.target.value))
                        }
                      />
                    </label>
                  ) : null}

                  {backgroundImage ? (
                    <label>
                      <span>
                        背景图片透明度
                        <strong>{backgroundImageOpacity}%</strong>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={backgroundImageOpacity}
                        onChange={(event) =>
                          setBackgroundImageOpacity(Number(event.target.value))
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            <p className="qr-tip">
              添加Logo时会自动使用高容错；透明背景与浅色背景图请保持二维码颜色对比明显。
            </p>
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
