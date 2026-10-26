import { useMode as registerColorMode, modeRgb, modeOklab, converter, interpolateWithPremultipliedAlpha } from "culori/fn";
import { designColor, type GradientOptions } from "./design-generator-options";
import { isConstrainedDevice, checkRasterWork, toolLimits } from "./resource-limits";
// Culori's useMode registers a color space; it is not a React Hook.
registerColorMode(modeRgb); registerColorMode(modeOklab);
const rgb = converter("rgb");
export function gradientSamples(options: GradientOptions) {
  if (!Number.isFinite(options.angle) || options.angle < 0 || options.angle > 360 || !["rgb", "oklab"].includes(options.space) || options.stops.length < 2 || options.stops.length > 8) throw new Error("渐变角度须为 0–360°，色标须为 2–8 个。");
  const colors = options.stops.map((stop, index) => {
    if (!Number.isFinite(stop.position) || stop.position < 0 || stop.position > 100 || index > 0 && stop.position <= options.stops[index - 1].position || !Number.isFinite(stop.opacity) || stop.opacity < 0 || stop.opacity > 100) throw new Error("色标位置须严格递增，不透明度须为 0–100%。");
    const hex = designColor(stop.color);
    return [{ mode: "rgb" as const, r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255, alpha: stop.opacity / 100 }, stop.position / 100] as const;
  });
  if (options.stops[0].position !== 0 || options.stops.at(-1)!.position !== 100) throw new Error("首尾色标位置须为 0% 和 100%。");
  const interpolate = interpolateWithPremultipliedAlpha(colors.map(([color, position]) => [color, position]), options.space);
  // Include original stops so narrow intervals are not lost between regular samples.
  const positions = [...new Set([...Array.from({ length: 65 }, (_, i) => i / 64), ...options.stops.map((s) => s.position / 100)])].sort((a, b) => a - b);
  return positions.map((position) => {
    const color = rgb(interpolate(position));
    const channel = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)));
    if (!color || ![color.r, color.g, color.b, color.alpha ?? 1].every(Number.isFinite)) throw new Error("无法计算此渐变色。");
    const [r, g, b] = [channel(color.r), channel(color.g), channel(color.b)], alpha = Math.max(0, Math.min(1, color.alpha ?? 1));
    return { position, r, g, b, alpha, css: `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(5))})` };
  });
}
export function gradientCss(options: GradientOptions) { return `linear-gradient(${options.angle}deg, ${gradientSamples(options).map((s) => `${s.css} ${Number((s.position * 100).toFixed(6))}%`).join(", ")})`; }
export function gradientDimensions(width: number, height: number) {
  const max = isConstrainedDevice() ? 16_000_000 : 32_000_000;
  if (![width, height].every((v) => Number.isSafeInteger(v) && v >= 1 && v <= toolLimits.raster.edge) || width * height > max) throw new Error("尺寸须为 1–8192px，总像素桌面不超过 32 MP、移动端不超过 16 MP。");
  checkRasterWork(width, height, 2);
}
export function gradientLine(angle: number, width: number, height: number) {
  if (!Number.isFinite(angle) || angle < 0 || angle > 360 || ![width, height].every((v) => Number.isFinite(v) && v > 0)) throw new Error("渐变方向或尺寸无效。");
  const dx = Math.sin(angle * Math.PI / 180), dy = -Math.cos(angle * Math.PI / 180), length = Math.abs(width * dx) + Math.abs(height * dy);
  return [width / 2 - dx * length / 2, height / 2 - dy * length / 2, width / 2 + dx * length / 2, height / 2 + dy * length / 2];
}
export function gradientSvg(options: GradientOptions, width: number, height: number) {
  gradientDimensions(width, height); const samples = gradientSamples(options), [x1, y1, x2, y2] = gradientLine(options.angle, width, height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="gradient" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${samples.map((s) => `<stop offset="${s.position}" stop-color="rgb(${s.r},${s.g},${s.b})" stop-opacity="${s.alpha}"/>`).join("")}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#gradient)"/></svg>`;
}
export async function exportGradientPng(options: GradientOptions, width: number, height: number, signal: AbortSignal) {
  signal.throwIfAborted(); gradientDimensions(width, height); const samples = gradientSamples(options), canvas = document.createElement("canvas");
  try {
    canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("浏览器无法创建画布。");
    const [x1, y1, x2, y2] = gradientLine(options.angle, width, height), gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    samples.forEach((s) => gradient.addColorStop(s.position, s.css)); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 编码失败。")), "image/png")); signal.throwIfAborted(); return blob;
  } finally { canvas.width = canvas.height = 0; }
}
