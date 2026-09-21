export type WatermarkSettings = {
  type: "text" | "image";
  layout: "single" | "tile" | "grid";
  text: string;
  color: string;
  size: number;
  opacity: number;
  spacing: number;
  x: number;
  y: number;
};

export const defaultWatermark: WatermarkSettings = {
  type: "text",
  layout: "single",
  text: "多功能工具箱",
  color: "#ffffff",
  size: 5,
  opacity: 75,
  spacing: 16,
  x: 95,
  y: 95,
};

type WatermarkPosition = { x: number; y: number };

export function watermarkPositions(
  width: number,
  height: number,
  markWidth: number,
  markHeight: number,
  settings: WatermarkSettings,
): WatermarkPosition[] {
  const margin = Math.min(width, height) * 0.02;
  if (settings.layout === "single") {
    return [{
      x: margin + Math.max(0, width - markWidth - margin * 2) * settings.x / 100,
      y: margin + Math.max(0, height - markHeight - margin * 2) * settings.y / 100,
    }];
  }

  const gap = Math.max(12, Math.min(width, height) * Math.max(4, settings.spacing) / 100);
  const stepX = Math.max(markWidth + gap, 24);
  const stepY = Math.max(markHeight + gap, 24);
  const positions: WatermarkPosition[] = [];
  let row = 0;
  for (let y = margin; y < height - margin && positions.length < 600; y += stepY) {
    const offset = settings.layout === "tile" && row % 2 ? stepX / 2 : 0;
    for (let x = margin - offset; x < width - margin && positions.length < 600; x += stepX) {
      if (x + markWidth > margin && y + markHeight > margin) positions.push({ x, y });
    }
    row += 1;
  }
  return positions;
}

export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WatermarkSettings, logo: HTMLImageElement | null) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(100, settings.opacity)) / 100;
  if (ctx.globalAlpha === 0) {
    ctx.restore();
    return;
  }
  const margin = Math.min(width, height) * 0.02;
  if (settings.type === "image") {
    if (logo?.naturalWidth && logo.naturalHeight) {
      const scale = Math.min((width * settings.size / 100) / logo.naturalWidth, (height - margin * 2) / logo.naturalHeight);
      const w = logo.naturalWidth * scale;
      const h = logo.naturalHeight * scale;
      for (const position of watermarkPositions(width, height, w, h, settings)) {
        ctx.drawImage(logo, position.x, position.y, w, h);
      }
    }
  } else {
    const lines = settings.text.split("\n").slice(0, 4).filter(Boolean);
    if (!lines.length) {
      ctx.restore();
      return;
    }
    let fontSize = Math.max(8, height * settings.size / 100);
    ctx.font = `600 ${fontSize}px sans-serif`;
    const naturalWidth = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
    fontSize *= Math.min(1, (width - margin * 2) / naturalWidth, (height - margin * 2) / (lines.length * fontSize * 1.25));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const h = fontSize * lines.length * 1.25;
    ctx.textBaseline = "top";
    ctx.fillStyle = settings.color;
    ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = fontSize * 0.12;
    for (const position of watermarkPositions(width, height, w, h, settings)) {
      lines.forEach((line, index) => ctx.fillText(line, position.x, position.y + index * fontSize * 1.25));
    }
  }
  ctx.restore();
}
