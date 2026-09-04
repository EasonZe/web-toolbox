"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import figlet from "figlet";
import ansiCompactFont from "figlet/fonts/ANSI Compact";
import ansiRegularFont from "figlet/fonts/ANSI Regular";
import ansiShadowFont from "figlet/fonts/ANSI Shadow";
import doomFont from "figlet/fonts/Doom";
import {
  FiCheck,
  FiClipboard,
  FiDownload,
  FiRefreshCw,
  FiType,
} from "react-icons/fi";

figlet.parseFont("ANSI Shadow", ansiShadowFont);
figlet.parseFont("ANSI Regular", ansiRegularFont);
figlet.parseFont("ANSI Compact", ansiCompactFont);
figlet.parseFont("Doom", doomFont);
figlet.defaults({ fetchFontIfMissing: false });

const bannerFonts = [
  { id: "ANSI Shadow", label: "粗体方块", figletFont: "ANSI Shadow", italic: false },
  { id: "ANSI Regular", label: "粗体大字", figletFont: "ANSI Regular", italic: false },
  { id: "Doom", label: "标准", figletFont: "Doom", italic: false },
  { id: "ANSI Italic", label: "斜体", figletFont: "ANSI Regular", italic: true },
  { id: "ANSI Compact", label: "紧凑", figletFont: "ANSI Compact", italic: false },
] as const;

const layoutOptions = [
  { id: "default", label: "标准" },
  { id: "fitted", label: "紧凑" },
  { id: "full", label: "宽松" },
] as const;

type BannerFont = (typeof bannerFonts)[number]["id"];
type BannerLayout = (typeof layoutOptions)[number]["id"];
type FrameStyle = "double" | "single" | "none";

type AsciiResult = {
  text: string;
  columns: number;
  rows: number;
  mode: "figlet" | "unicode";
};

type PreviewMetrics = {
  height: number;
  scale: number;
  width: number;
};

function getResultSize(text: string) {
  const lines = text.split("\n");
  return {
    columns: Math.max(0, ...lines.map((line) => Array.from(line).length)),
    rows: lines.length,
  };
}

function getDisplayWidth(text: string) {
  return Array.from(text).reduce((width, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isWide =
      codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff01 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6));
    return width + (isWide ? 2 : 1);
  }, 0);
}

function centerLine(text: string, width: number) {
  const remaining = Math.max(0, width - getDisplayWidth(text));
  const left = Math.floor(remaining / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(remaining - left)}`;
}

function placeBlockLine(text: string, blockWidth: number, containerWidth: number) {
  const blockOffset = Math.max(0, Math.floor((containerWidth - blockWidth) / 2));
  const remaining = Math.max(0, containerWidth - blockOffset - getDisplayWidth(text));
  return `${" ".repeat(blockOffset)}${text}${" ".repeat(remaining)}`;
}

function decorateBanner(
  result: AsciiResult,
  subtitle: string,
  frameStyle: FrameStyle,
): AsciiResult {
  const artLines = result.text.split("\n").map((line) => line.replace(/\s+$/u, ""));
  const normalizedSubtitle = subtitle.trim();
  const artWidth = Math.max(1, ...artLines.map(getDisplayWidth));
  const contentWidth = Math.max(
    artWidth,
    getDisplayWidth(normalizedSubtitle),
  );

  if (frameStyle === "none") {
    const width = contentWidth;
    const lines = [...artLines];
    if (normalizedSubtitle) {
      lines.push("", centerLine(normalizedSubtitle, width).replace(/\s+$/u, ""));
    }
    const text = lines.join("\n");
    return { text, ...getResultSize(text), mode: result.mode };
  }

  const innerWidth = Math.max(62, contentWidth + 8);
  const frame = frameStyle === "double"
    ? { topLeft: "╔", horizontal: "═", topRight: "╗", vertical: "║", bottomLeft: "╚", bottomRight: "╝" }
    : { topLeft: "┌", horizontal: "─", topRight: "┐", vertical: "│", bottomLeft: "└", bottomRight: "┘" };
  const lines = [
    `${frame.topLeft}${frame.horizontal.repeat(innerWidth)}${frame.topRight}`,
    `${frame.vertical}${" ".repeat(innerWidth)}${frame.vertical}`,
    ...artLines.map((line) => `${frame.vertical}${placeBlockLine(line, artWidth, innerWidth)}${frame.vertical}`),
  ];
  if (normalizedSubtitle) {
    lines.push(`${frame.vertical}${centerLine(normalizedSubtitle, innerWidth)}${frame.vertical}`);
  }
  lines.push(`${frame.bottomLeft}${frame.horizontal.repeat(innerWidth)}${frame.bottomRight}`);
  const text = lines.join("\n");
  return { text, ...getResultSize(text), mode: result.mode };
}

function skewBannerRows(text: string) {
  const rows = text.split("\n");
  const lastVisibleRow = rows.reduce(
    (last, row, index) => (row.trim() ? index : last),
    0,
  );
  return rows
    .map((row, index) => {
      if (!row.trim()) return "";
      const indent = Math.max(0, lastVisibleRow - index);
      return `${" ".repeat(indent)}${row}`;
    })
    .join("\n");
}

function createFigletBanner(
  sourceText: string,
  font: BannerFont,
  layout: BannerLayout,
): AsciiResult {
  const selectedFont = bannerFonts.find((option) => option.id === font) ?? bannerFonts[0];
  const lines = sourceText.replace(/\r/g, "").split("\n").slice(0, 4);
  let text = lines
    .map((line) => {
      if (!line) return "";
      const gap = layout === "fitted" ? 0 : layout === "full" ? 3 : 1;
      const glyphs = Array.from(line).map((character) => {
        const rows = figlet
          .textSync(character, {
            font: selectedFont.figletFont,
            horizontalLayout: "full",
            verticalLayout: "full",
          })
          .split("\n");
        const width = Math.max(0, ...rows.map((row) => row.length));
        return {
          rows: rows.map((row) => row.padEnd(width, " ")),
          width,
        };
      });
      const height = Math.max(0, ...glyphs.map((glyph) => glyph.rows.length));
      return Array.from({ length: height }, (_, rowIndex) =>
        glyphs
          .map((glyph) => glyph.rows[rowIndex] ?? " ".repeat(glyph.width))
          .join(" ".repeat(gap)),
      ).join("\n");
    })
    .join("\n")
    .replace(/[ \t]+$/gmu, "")
    .replace(/^\n+|\n+$/gu, "");

  if (selectedFont.italic) {
    text = skewBannerRows(text);
  }

  if (!text) throw new Error("当前文字没有生成可见字符");
  return { text, ...getResultSize(text), mode: "figlet" };
}

function createUnicodeBlockBanner(sourceText: string): AsciiResult {
  const normalizedText = sourceText.replace(/\r/g, "");
  const lines = normalizedText.split("\n").slice(0, 4);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建字符画画布");

  const fontSize = 160;
  const lineHeight = 192;
  const padding = 28;
  const fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif';
  context.font = `800 ${fontSize}px ${fontFamily}`;
  const measuredWidth = Math.max(
    1,
    ...lines.map((line) => context.measureText(line || " ").width),
  );

  canvas.width = Math.ceil(measuredWidth + padding * 2);
  canvas.height = Math.ceil(lines.length * lineHeight + padding * 2);
  const drawContext = canvas.getContext("2d", { willReadFrequently: true });
  if (!drawContext) throw new Error("浏览器无法读取字符画画布");
  drawContext.clearRect(0, 0, canvas.width, canvas.height);
  drawContext.fillStyle = "#ffffff";
  drawContext.font = `800 ${fontSize}px ${fontFamily}`;
  drawContext.textBaseline = "top";
  lines.forEach((line, index) => {
    drawContext.fillText(line || " ", padding, padding + index * lineHeight);
  });

  const imageData = drawContext.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = imageData.data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("当前文字没有生成可见字符");

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const rows = Math.max(14, Math.min(42, lines.length * 18));
  const columns = Math.max(
    12,
    Math.min(120, Math.round((cropWidth / cropHeight) * rows * 1.72)),
  );
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = columns;
  sampleCanvas.height = rows;
  const sampleContext = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sampleContext) throw new Error("浏览器无法读取字符画画布");
  sampleContext.imageSmoothingEnabled = true;
  sampleContext.drawImage(
    canvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    0,
    0,
    columns,
    rows,
  );
  const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
  const outputLines: string[] = [];
  for (let y = 0; y < rows; y += 1) {
    let line = "";
    for (let x = 0; x < columns; x += 1) {
      const alpha = pixels[(y * columns + x) * 4 + 3];
      line += alpha > 72 ? "█" : " ";
    }
    outputLines.push(line.replace(/\s+$/u, ""));
  }
  while (outputLines[0] === "") outputLines.shift();
  while (outputLines.at(-1) === "") outputLines.pop();
  const text = outputLines.join("\n");
  return { text, ...getResultSize(text), mode: "unicode" };
}

function createTextAsciiArt(
  sourceText: string,
  font: BannerFont,
  layout: BannerLayout,
  subtitle: string,
  frameStyle: FrameStyle,
): AsciiResult {
  if (!sourceText.trim()) throw new Error("请输入要生成的文字");
  const result = /^[\x00-\x7F\r\n]*$/u.test(sourceText)
    ? createFigletBanner(sourceText, font, layout)
    : createUnicodeBlockBanner(sourceText);
  return decorateBanner(result, subtitle, frameStyle);
}

function copyWithFallback(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

export default function AsciiArtGenerator() {
  const [sourceText, setSourceText] = useState("Eason");
  const [subtitle, setSubtitle] = useState("");
  const [font, setFont] = useState<BannerFont>("ANSI Shadow");
  const [layout, setLayout] = useState<BannerLayout>("default");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("double");
  const [textColor, setTextColor] = useState("#203641");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [result, setResult] = useState<AsciiResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [previewMetrics, setPreviewMetrics] = useState<PreviewMetrics | null>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLPreElement>(null);

  const containsUnicode = useMemo(
    () => /[^\x00-\x7F]/u.test(sourceText),
    [sourceText],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!sourceText.trim()) {
        setResult(null);
        setGenerating(false);
        setMessage("");
        return;
      }

      setGenerating(true);
      try {
        const nextResult = createTextAsciiArt(
          sourceText,
          font,
          layout,
          subtitle,
          frameStyle,
        );
        if (!cancelled) {
          setResult(nextResult);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setResult(null);
          setMessage(
            error instanceof Error ? `${error.message}。` : "字符画生成失败。",
          );
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [font, frameStyle, layout, sourceText, subtitle]);

  useLayoutEffect(() => {
    const frame = previewFrameRef.current;
    const preview = previewTextRef.current;
    if (!frame || !preview || !result) {
      setPreviewMetrics(null);
      return;
    }

    let animationFrame = 0;
    let disposed = false;

    const updatePreviewSize = () => {
      const frameStyle = window.getComputedStyle(frame);
      const availableWidth = Math.max(
        1,
        frame.clientWidth -
          Number.parseFloat(frameStyle.paddingLeft) -
          Number.parseFloat(frameStyle.paddingRight),
      );
      const availableHeight = Math.max(
        1,
        frame.clientHeight -
          Number.parseFloat(frameStyle.paddingTop) -
          Number.parseFloat(frameStyle.paddingBottom),
      );
      const naturalWidth = Math.max(1, preview.scrollWidth);
      const naturalHeight = Math.max(1, preview.scrollHeight);
      const scale = Math.min(
        1,
        availableWidth / naturalWidth,
        availableHeight / naturalHeight,
      );
      const next = {
        width: naturalWidth * scale,
        height: naturalHeight * scale,
        scale,
      };

      if (!disposed) {
        setPreviewMetrics((current) =>
          current &&
          Math.abs(current.width - next.width) < 0.5 &&
          Math.abs(current.height - next.height) < 0.5 &&
          Math.abs(current.scale - next.scale) < 0.001
            ? current
            : next,
        );
      }
    };

    animationFrame = window.requestAnimationFrame(updatePreviewSize);
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(frame);
    document.fonts?.ready.then(updatePreviewSize).catch(() => undefined);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [result]);

  function restoreDefaults() {
    setSubtitle("");
    setFont("ANSI Shadow");
    setLayout("default");
    setFrameStyle("double");
    setTextColor("#203641");
    setBackgroundColor("#ffffff");
  }

  async function copyResult() {
    if (!result) return;
    try {
      await copyWithFallback(result.text);
      setMessage("字符画已复制。");
    } catch {
      setMessage("复制失败，请手动选择字符画内容。");
    }
  }

  function downloadResult() {
    if (!result) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ascii-text.txt";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="tool-shell ascii-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header ascii-header">
        <h1>ASCII字符画生成工具</h1>
        <p>输入文字，生成粗体方块字、边框与居中副标题。</p>
      </header>

      <section className="converter-card ascii-card" aria-label="ASCII字符画生成">
        <label className="ascii-text-source">
          <span className="ascii-text-source-label">输入文字</span>
          <textarea
            value={sourceText}
            maxLength={80}
            rows={3}
            autoFocus
            placeholder="输入英文、数字或中文"
            onChange={(event) => setSourceText(event.target.value)}
          />
          <span className="ascii-text-source-meta">
            <span>英文和数字使用FIGlet大字，中文自动使用方块兼容模式</span>
            <span>{sourceText.length}/80</span>
          </span>
        </label>

        <div className="ascii-workbench">
          <section className="ascii-preview" aria-labelledby="ascii-preview-title">
            <div className="image-line-section-heading">
              <h2 id="ascii-preview-title">字符画预览</h2>
              <span>
                {result
                  ? `${result.columns}列 × ${result.rows}行`
                  : generating
                    ? "正在生成"
                    : "等待输入"}
              </span>
            </div>
            <div
              ref={previewFrameRef}
              className="ascii-output-frame"
              style={{ color: textColor, backgroundColor }}
            >
              {result ? (
                <div
                  className="ascii-output-fit"
                  style={
                    previewMetrics
                      ? {
                          width: `${previewMetrics.width}px`,
                          height: `${previewMetrics.height}px`,
                        }
                      : undefined
                  }
                >
                  <pre
                    ref={previewTextRef}
                    style={{
                      visibility: previewMetrics ? "visible" : "hidden",
                      transform: `scale(${previewMetrics?.scale ?? 1})`,
                    }}
                  >
                    {result.text}
                  </pre>
                </div>
              ) : (
                <span className="file-tool-empty ascii-empty">
                  <FiType aria-hidden="true" />
                  <strong>{generating ? "正在生成…" : "输入文字开始生成"}</strong>
                  <span>生成结果会实时显示在这里</span>
                </span>
              )}
            </div>
            <div className="ascii-actions">
              <button type="button" className="open-button" onClick={copyResult} disabled={!result}>
                <FiClipboard aria-hidden="true" />
                复制字符画
              </button>
              <button type="button" className="convert-button" onClick={downloadResult} disabled={!result}>
                <FiDownload aria-hidden="true" />
                下载TXT
              </button>
            </div>
          </section>

          <section className="ascii-settings" aria-labelledby="ascii-settings-title">
            <div className="image-line-section-heading">
              <h2 id="ascii-settings-title">生成设置</h2>
              <button type="button" className="image-line-reset" onClick={restoreDefaults}>
                <FiRefreshCw aria-hidden="true" />
                恢复默认
              </button>
            </div>

            {containsUnicode ? (
              <p className="ascii-mode-note">
                已启用中文方块兼容模式，横幅字体与间距设置仅适用于英文和数字。
              </p>
            ) : null}

            <fieldset className="ascii-presets" disabled={containsUnicode}>
              <legend>横幅字体</legend>
              <div className="ascii-font-options">
                {bannerFonts.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={font === option.id ? "is-selected" : ""}
                    aria-pressed={font === option.id}
                    onClick={() => setFont(option.id)}
                  >
                    {font === option.id ? <FiCheck aria-hidden="true" /> : null}
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="ascii-presets" disabled={containsUnicode}>
              <legend>字符间距</legend>
              <div className="ascii-layout-options">
                {layoutOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={layout === option.id ? "is-selected" : ""}
                    aria-pressed={layout === option.id}
                    onClick={() => setLayout(option.id)}
                  >
                    {layout === option.id ? <FiCheck aria-hidden="true" /> : null}
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="ascii-character-input ascii-subtitle-input">
              <span>副标题</span>
              <input
                value={subtitle}
                maxLength={40}
                placeholder="留空则不显示副标题"
                onChange={(event) => setSubtitle(event.target.value)}
              />
              <small>副标题会自动在边框内居中。</small>
            </label>

            <fieldset className="ascii-presets">
              <legend>边框样式</legend>
              <div className="ascii-layout-options">
                {([
                  { id: "double", label: "双线" },
                  { id: "single", label: "单线" },
                  { id: "none", label: "无边框" },
                ] as const).map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={frameStyle === option.id ? "is-selected" : ""}
                    aria-pressed={frameStyle === option.id}
                    onClick={() => setFrameStyle(option.id)}
                  >
                    {frameStyle === option.id ? <FiCheck aria-hidden="true" /> : null}
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="image-line-color-grid ascii-color-grid">
              <label>
                <span>字符颜色</span>
                <span className="image-line-color-picker">
                  <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} />
                  <code>{textColor.toUpperCase()}</code>
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
          </section>
        </div>

        {message ? <p className="message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
