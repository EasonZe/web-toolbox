import { loadRaster } from "./local-images";
import { checkRasterWork, toolLimits } from "./resource-limits";
import { inspectStaticRaster } from "./static-raster";

export type RoundedCorners = { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
export type RoundedImageOptions = {
  shape: "rounded" | "circle";
  radiusUnit: "percent" | "pixels";
  corners: RoundedCorners;
  border: "none" | "inside" | "outside";
  borderWidth: number;
  borderColor: string;
};
export const defaultRoundedImage: RoundedImageOptions = {
  shape: "rounded", radiusUnit: "percent",
  corners: { topLeft: 15, topRight: 15, bottomRight: 15, bottomLeft: 15 },
  border: "none", borderWidth: 8, borderColor: "#507d91",
};
export function planRoundedImage(width: number, height: number, options: RoundedImageOptions) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || width * height > toolLimits.image.pixels)
    throw new Error("原图尺寸无效或超过安全处理范围。");
  const values = options.corners && [options.corners.topLeft, options.corners.topRight, options.corners.bottomRight, options.corners.bottomLeft];
  if (!["rounded", "circle"].includes(options.shape) || !["percent", "pixels"].includes(options.radiusUnit)
    || !["none", "inside", "outside"].includes(options.border) || !/^#[\da-f]{6}$/i.test(options.borderColor)
    || !Number.isSafeInteger(options.borderWidth) || options.borderWidth < 0 || options.borderWidth > toolLimits.raster.edge
    || !values || Object.keys(options.corners).length !== 4 || values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("圆角或边框设置无效。");
  const maximum = Math.min(width, height) / 2, radiusLimit = options.radiusUnit === "percent" ? 50 : maximum;
  if (options.shape === "rounded" && values.some((n) => n > radiusLimit))
    throw new Error(options.radiusUnit === "percent" ? "圆角百分比须在 0–50% 之间。" : `圆角最多为短边的一半（${maximum}px）。`);
  const corners = Object.fromEntries(Object.entries(options.corners).map(([key, value]) => [key, options.radiusUnit === "percent" ? value / 100 * Math.min(width, height) : value])) as RoundedCorners;
  const borderWidth = options.border === "none" ? 0 : options.borderWidth;
  if (options.border === "inside" && borderWidth > maximum) throw new Error("内边框宽度不能超过短边的一半。");
  const offset = options.border === "outside" ? borderWidth : 0, outputWidth = width + offset * 2, outputHeight = height + offset * 2;
  if (outputWidth > toolLimits.raster.edge || outputHeight > toolLimits.raster.edge)
    throw new Error(`导出图片最长边不能超过 ${toolLimits.raster.edge}px，请先缩小图片或减少外边框。`);
  // One decoded source, the output backing store and a possible encoding copy.
  checkRasterWork(outputWidth, outputHeight, 2 + width * height / (outputWidth * outputHeight));
  return { width: outputWidth, height: outputHeight, sourceWidth: width, sourceHeight: height, offset, borderWidth, corners };
}

function roundedPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, corners: RoundedCorners) {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;
  context.moveTo(x + tl, y); context.lineTo(x + width - tr, y); context.arcTo(x + width, y, x + width, y + tr, tr);
  context.lineTo(x + width, y + height - br); context.arcTo(x + width, y + height, x + width - br, y + height, br);
  context.lineTo(x + bl, y + height); context.arcTo(x, y + height, x, y + height - bl, bl);
  context.lineTo(x, y + tl); context.arcTo(x, y, x + tl, y, tl); context.closePath();
}
function shapePath(context: CanvasRenderingContext2D, options: RoundedImageOptions, plan: ReturnType<typeof planRoundedImage>, inset: number) {
  const { offset, sourceWidth: width, sourceHeight: height, corners } = plan;
  if (options.shape === "circle") {
    const radius = Math.min(width, height) / 2 - inset;
    if (radius <= 0) return;
    const x = offset + width / 2, y = offset + height / 2;
    context.moveTo(x + radius, y); context.arc(x, y, radius, 0, Math.PI * 2); context.closePath();
  } else {
    const w = width - inset * 2, h = height - inset * 2;
    if (w <= 0 || h <= 0) return;
    const radii = Object.fromEntries(Object.entries(corners).map(([key, value]) => [key, Math.max(0, value - inset)])) as RoundedCorners;
    roundedPath(context, offset + inset, offset + inset, w, h, radii);
  }
}
export async function renderRoundedImage(file: File, options: RoundedImageOptions, signal: AbortSignal) {
  signal.throwIfAborted();
  const header = await inspectStaticRaster(file, signal);
  if (header.width && header.height) planRoundedImage(header.width, header.height, options);
  const bitmap = await loadRaster(file, signal);
  let canvas: HTMLCanvasElement | undefined;
  try {
    const plan = planRoundedImage(bitmap.width, bitmap.height, options); signal.throwIfAborted();
    canvas = document.createElement("canvas"); canvas.width = plan.width; canvas.height = plan.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建圆角图片画布。");
    context.save(); context.beginPath(); shapePath(context, options, plan, 0); context.clip();
    context.drawImage(bitmap, plan.offset, plan.offset); context.restore();
    if (plan.borderWidth > 0) {
      context.beginPath(); shapePath(context, options, plan, options.border === "outside" ? -plan.borderWidth : 0);
      shapePath(context, options, plan, options.border === "outside" ? 0 : plan.borderWidth);
      context.fillStyle = options.borderColor; context.fill("evenodd");
    }
    signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 图片编码失败。")), "image/png"));
    signal.throwIfAborted();
    if (blob.type !== "image/png" || blob.size > toolLimits.image.fileBytes) throw new Error("PNG 导出失败或结果超过 100 MB，请先缩小图片。");
    return { blob, width: plan.width, height: plan.height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
}
