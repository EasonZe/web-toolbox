"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiDownload, FiImage, FiMove, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";

type BubbleStyle = "none" | "rounded" | "speech-left" | "speech-right" | "thought" | "caption";
type OutputFormat = "image/png" | "image/jpeg";
type FontFamily = "sans" | "serif" | "kaiti" | "fangsong" | "rounded" | "mono" | "arial" | "georgia";

const fontFamilies: Record<FontFamily, string> = {
  sans: '"PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", SimSun, serif',
  kaiti: 'KaiTi, "STKaiti", "Kaiti SC", serif',
  fangsong: 'FangSong, "STFangsong", "FangSong SC", serif',
  rounded: '"Yuanti SC", YouYuan, "Microsoft YaHei", sans-serif',
  mono: '"Cascadia Mono", Consolas, monospace',
  arial: 'Arial, "Helvetica Neue", "Microsoft YaHei", sans-serif',
  georgia: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片。"));
    image.src = url;
  });
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const result: string[] = [];
  for (const sourceLine of value.split("\n").slice(0, 8)) {
    if (!sourceLine) {
      result.push(" ");
      continue;
    }
    let line = "";
    for (const character of Array.from(sourceLine)) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        result.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) result.push(line);
  }
  if (result.length > 8) {
    result.length = 8;
    result[7] = `${result[7].slice(0, -1)}…`;
  }
  return result;
}

function colorWithOpacity(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
}

export default function ImageTextEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef("");
  const imageJobRef = useRef(0);
  const draggingRef = useRef(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("在这里输入文字");
  const [fontFamily, setFontFamily] = useState<FontFamily>("sans");
  const [fontSize, setFontSize] = useState(8);
  const [bold, setBold] = useState(true);
  const [textColor, setTextColor] = useState("#203641");
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("speech-left");
  const [bubbleColor, setBubbleColor] = useState("#ffffff");
  const [bubbleBorder, setBubbleBorder] = useState("#203641");
  const [bubbleOpacity, setBubbleOpacity] = useState(92);
  const [x, setX] = useState(50);
  const [y, setY] = useState(72);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("image/png");
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    imageJobRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;
    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    if (outputFormat === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    } else {
      context.clearRect(0, 0, width, height);
    }
    context.drawImage(sourceImage, 0, 0, width, height);
    if (!text.trim()) return;

    const size = Math.max(14, Math.min(width, height) * (fontSize / 100));
    context.font = `${bold ? 700 : 400} ${size}px ${fontFamilies[fontFamily]}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    const lines = wrapText(context, text.trim(), width * 0.78);
    const lineHeight = size * 1.28;
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
    const textHeight = lines.length * lineHeight;
    const paddingX = size * 0.62;
    const paddingY = size * 0.42;
    const bubbleWidth = Math.min(width * 0.94, textWidth + paddingX * 2);
    const bubbleHeight = textHeight + paddingY * 2;
    const hasTail = bubbleStyle === "speech-left" || bubbleStyle === "speech-right" || bubbleStyle === "thought";
    const tailHeight = hasTail ? size * 0.65 : 0;
    const centerX = Math.max(bubbleWidth / 2 + 3, Math.min(width - bubbleWidth / 2 - 3, width * x / 100));
    const centerY = Math.max(bubbleHeight / 2 + 3, Math.min(height - bubbleHeight / 2 - tailHeight - 3, height * y / 100));
    const left = centerX - bubbleWidth / 2;
    const top = centerY - bubbleHeight / 2;

    if (bubbleStyle !== "none") {
      context.fillStyle = colorWithOpacity(bubbleColor, bubbleOpacity);
      context.strokeStyle = bubbleBorder;
      context.lineWidth = Math.max(1, size * 0.045);

      if (bubbleStyle === "thought") {
        roundedRectangle(context, left, top, bubbleWidth, bubbleHeight, bubbleHeight / 2);
        context.fill();
        context.stroke();
        const dotX = left + bubbleWidth * 0.28;
        const dotY = top + bubbleHeight + size * 0.13;
        for (const [offsetX, offsetY, radius] of [[0, 0, size * 0.18], [-size * 0.34, size * 0.3, size * 0.11]] as const) {
          context.beginPath();
          context.arc(dotX + offsetX, dotY + offsetY, radius, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
      } else {
        const radius = bubbleStyle === "caption" ? size * 0.12 : size * 0.4;
        roundedRectangle(context, left, top, bubbleWidth, bubbleHeight, radius);
        context.fill();
        context.stroke();
      }

      if (bubbleStyle === "speech-left" || bubbleStyle === "speech-right") {
        const tailX = bubbleStyle === "speech-left"
          ? left + size * 0.95
          : left + bubbleWidth - size * 1.67;
        context.beginPath();
        context.moveTo(tailX, top + bubbleHeight - 1);
        context.lineTo(tailX + size * 0.72, top + bubbleHeight - 1);
        context.lineTo(tailX + size * 0.24, top + bubbleHeight + tailHeight);
        context.closePath();
        context.fillStyle = colorWithOpacity(bubbleColor, bubbleOpacity);
        context.fill();
        context.strokeStyle = bubbleBorder;
        context.lineWidth = Math.max(1, size * 0.045);
        context.stroke();
      }
    }

    context.fillStyle = textColor;
    const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      const lineY = firstY + index * lineHeight;
      context.fillText(line, centerX, lineY, width * 0.86);
    });
  }, [bold, bubbleBorder, bubbleColor, bubbleOpacity, bubbleStyle, fontFamily, fontSize, outputFormat, sourceImage, text, textColor, x, y]);

  useEffect(() => draw(), [draw]);

  async function selectImage(file: File) {
    setMessage("");
    const supported = /^image\/(png|jpeg|webp|bmp|avif|gif)$/i.test(file.type) || (!file.type && /\.(png|jpe?g|webp|bmp|avif|gif)$/i.test(file.name));
    if (!file.size || file.size > 25 * 1024 * 1024 || !supported) {
      setMessage("请选择 25 MB 以内的 PNG、JPG、WebP、BMP、AVIF 或 GIF 图片。");
      return;
    }
    const currentJob = ++imageJobRef.current;
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      if (currentJob !== imageJobRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("图片像素过大，请缩小到 4000 万像素以内。");
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = url;
      setSourceFile(file);
      setSourceImage(image);
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(error instanceof Error ? error.message : "无法读取这张图片。");
    }
  }

  function updatePosition(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setX(Math.round(Math.max(0, Math.min(100, (clientX - bounds.left) / bounds.width * 100))));
    setY(Math.round(Math.max(0, Math.min(100, (clientY - bounds.top) / bounds.height * 100))));
  }

  async function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || !sourceFile || !sourceImage) return;
    draw();
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("图片生成失败。")),
        outputFormat,
        outputFormat === "image/jpeg" ? 0.92 : undefined,
      ));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sourceFile.name.replace(/\.[^.]+$/, "") || "image"}-文字.${outputFormat === "image/png" ? "png" : "jpg"}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("图片已生成。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片生成失败。");
    }
  }

  return (
    <UtilityShell title="图片加文字与对话框工具" description="为图片添加多行文字和多种对话框，并实时调整位置。">
      <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp,image/bmp,image/avif,image/gif" ariaLabel="选择或拖入图片" onFile={selectImage}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{sourceFile ? "重新选择图片" : "选择图片 / 拖入文件"}</strong>
        <span>{sourceFile ? sourceFile.name : "支持 PNG、JPG、WebP 等格式，最大 25 MB"}</span>
      </FileDropZone>

      <div className="utility-columns image-text-columns">
        <section className="utility-panel utility-controls" aria-labelledby="image-text-preview-title">
          <div className="utility-heading"><h2 id="image-text-preview-title">实时预览</h2>{sourceImage ? <span className="utility-muted">{sourceImage.naturalWidth} × {sourceImage.naturalHeight}</span> : null}</div>
          <div className="image-text-preview">
            {sourceImage ? (
              <canvas
                ref={canvasRef}
                aria-label="图片文字预览，可拖动文字位置"
                onPointerDown={(event) => { draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); updatePosition(event.clientX, event.clientY); }}
                onPointerMove={(event) => { if (draggingRef.current) updatePosition(event.clientX, event.clientY); }}
                onPointerUp={(event) => { draggingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
                onPointerCancel={() => { draggingRef.current = false; }}
              />
            ) : <div className="utility-empty"><span><FiImage aria-hidden="true" /><strong>图片预览</strong><small>选择图片后在这里查看文字和对话框效果</small></span></div>}
          </div>
          <p className="utility-muted image-text-drag-tip"><FiMove aria-hidden="true" />在预览图上拖动可快速调整文字位置。</p>
          <button className="primary-button" type="button" disabled={!sourceImage || !text.trim()} onClick={() => void downloadImage()}><FiDownload aria-hidden="true" />下载图片</button>
        </section>

        <section className="utility-panel utility-controls image-text-settings" aria-labelledby="image-text-settings-title">
          <h2 id="image-text-settings-title">文字设置</h2>
          <label>文字内容<textarea rows={4} maxLength={300} value={text} onChange={(event) => setText(event.target.value.split("\n").slice(0, 8).join("\n"))} placeholder="最多 8 行" /></label>
          <div className="image-text-setting-grid">
            <label>字体<select value={fontFamily} onChange={(event) => setFontFamily(event.target.value as FontFamily)}><option value="sans">黑体</option><option value="serif">宋体</option><option value="kaiti">楷体</option><option value="fangsong">仿宋</option><option value="rounded">圆体</option><option value="mono">等宽体</option><option value="arial">Arial</option><option value="georgia">Georgia</option></select></label>
            <label>字重<select value={bold ? "bold" : "normal"} onChange={(event) => setBold(event.target.value === "bold")}><option value="bold">粗体</option><option value="normal">常规</option></select></label>
          </div>
          <label className="utility-range-control"><span>字号<output>{fontSize}%</output></span><input type="range" min={3} max={24} value={fontSize} onChange={(event) => setFontSize(+event.target.value)} /></label>
          <label>文字颜色<input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label>

          <h2>对话框设置</h2>
          <div className="utility-actions image-text-bubble-options" role="group" aria-label="对话框样式">
            {([['none', '无对话框'], ['rounded', '圆角框'], ['speech-left', '左尾气泡'], ['speech-right', '右尾气泡'], ['thought', '思考气泡'], ['caption', '字幕框']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={bubbleStyle === value} onClick={() => setBubbleStyle(value)}>{label}</button>)}
          </div>
          {bubbleStyle !== "none" ? <>
            <div className="image-text-color-grid">
              <label>填充颜色<input type="color" value={bubbleColor} onChange={(event) => setBubbleColor(event.target.value)} /></label>
              <label>边框颜色<input type="color" value={bubbleBorder} onChange={(event) => setBubbleBorder(event.target.value)} /></label>
            </div>
            <label className="utility-range-control"><span>填充透明度<output>{bubbleOpacity}%</output></span><input type="range" min={10} max={100} value={bubbleOpacity} onChange={(event) => setBubbleOpacity(+event.target.value)} /></label>
          </> : null}

          <h2>位置与导出</h2>
          <label className="utility-range-control"><span>水平位置<output>{x}%</output></span><input type="range" min={0} max={100} value={x} onChange={(event) => setX(+event.target.value)} /></label>
          <label className="utility-range-control"><span>垂直位置<output>{y}%</output></span><input type="range" min={0} max={100} value={y} onChange={(event) => setY(+event.target.value)} /></label>
          <label>导出格式<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option></select></label>
        </section>
      </div>
      {message ? <p className="utility-muted" role="status">{message}</p> : null}
    </UtilityShell>
  );
}
