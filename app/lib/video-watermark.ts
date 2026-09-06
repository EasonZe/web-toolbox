export type WatermarkSettings = {
  type: "text" | "image";
  text: string;
  color: string;
  size: number;
  opacity: number;
  x: number;
  y: number;
};

export const defaultWatermark: WatermarkSettings = { type: "text", text: "多功能工具箱", color: "#ffffff", size: 5, opacity: 75, x: 95, y: 95 };

export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, settings: WatermarkSettings, logo: HTMLImageElement | null) {
  ctx.save();
  ctx.globalAlpha = settings.opacity / 100;
  const margin = Math.min(width, height) * 0.02;
  if (settings.type === "image") {
    if (logo?.naturalWidth && logo.naturalHeight) {
      const scale = Math.min((width * settings.size / 100) / logo.naturalWidth, (height - margin * 2) / logo.naturalHeight);
      const w = logo.naturalWidth * scale;
      const h = logo.naturalHeight * scale;
      ctx.drawImage(logo, margin + (width - w - 2 * margin) * settings.x / 100, margin + (height - h - 2 * margin) * settings.y / 100, w, h);
    }
  } else {
    const lines = settings.text.split("\n").slice(0, 4);
    let fontSize = Math.max(8, height * settings.size / 100);
    ctx.font = `600 ${fontSize}px sans-serif`;
    const naturalWidth = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
    fontSize *= Math.min(1, (width - margin * 2) / naturalWidth, (height - margin * 2) / (lines.length * fontSize * 1.25));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const h = fontSize * lines.length * 1.25;
    const x = margin + (width - w - margin * 2) * settings.x / 100;
    const y = margin + (height - h - margin * 2) * settings.y / 100;
    ctx.textBaseline = "top";
    ctx.fillStyle = settings.color;
    ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = fontSize * 0.12;
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * fontSize * 1.25));
  }
  ctx.restore();
}
