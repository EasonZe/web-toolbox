import { designColor } from "./design-generator-options";
import { loadRaster, inspectRasterHeader } from "./local-images";
import { checkRasterWork, toolLimits } from "./resource-limits";
export type ColorReplaceOptions = { from: string; to: string; tolerance: number; softness: number; strength: number };
export const defaultColorReplaceOptions: ColorReplaceOptions = { from: "#FFFFFF", to: "#2563EB", tolerance: 10, softness: 30, strength: 100 };
export function replaceColorPixels(input: Uint8ClampedArray, width: number, height: number, options: ColorReplaceOptions) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || width * height > toolLimits.image.pixels || input.length !== width * height * 4) throw new Error("图片像素或尺寸无效。");
  if (![options.tolerance, options.softness, options.strength].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) throw new Error("容差、柔化和替换强度须为 0–100%。");
  const from = designColor(options.from), to = designColor(options.to), channels = (color: string) => [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16)), source = channels(from), target = channels(to);
  checkRasterWork(width, height, 4); const pixels = input.slice(); let changed = 0;
  const limit = options.tolerance / 100 * Math.sqrt(3 * 255 * 255), band = limit * options.softness / 100;
  for (let i = 0; i < input.length; i += 4) {
    if (!input[i + 3]) continue;
    const distance = Math.hypot(input[i] - source[0], input[i + 1] - source[1], input[i + 2] - source[2]); if (distance > limit) continue;
    const weight = (band ? Math.min(1, (limit - distance) / band) : 1) * options.strength / 100; let different = false;
    for (let c = 0; c < 3; c++) { pixels[i + c] = input[i + c] * (1 - weight) + target[c] * weight; different ||= pixels[i + c] !== input[i + c]; }
    if (different) changed++;
  }
  return { pixels, changed };
}
async function bitmapForWork(file: File, signal: AbortSignal, buffers: number) {
  const header = inspectRasterHeader(new Uint8Array(await file.slice(0, 65536).arrayBuffer()), toolLimits.image.pixels); signal.throwIfAborted();
  if (header.width && header.height) checkRasterWork(header.width, header.height, buffers);
  const bitmap = await loadRaster(file, signal);
  try { checkRasterWork(bitmap.width, bitmap.height, buffers); if (bitmap.width > toolLimits.raster.edge || bitmap.height > toolLimits.raster.edge) throw new Error("图片单边超过 8192px，请先缩小图片。"); return bitmap; } catch (error) { bitmap.close(); throw error; }
}
export async function sampleImageColor(file: File, x: number, y: number, signal: AbortSignal) {
  if (typeof OffscreenCanvas === "undefined") throw new Error("浏览器不支持后台画布，请使用新版浏览器。");
  const bitmap = await bitmapForWork(file, signal, 1); let canvas: OffscreenCanvas | undefined;
  try {
    if (![x, y].every(Number.isInteger) || x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) throw new Error("取色位置超出图片。");
    canvas = new OffscreenCanvas(1, 1); const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法取色。"); ctx.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1); const pixel = ctx.getImageData(0, 0, 1, 1).data; signal.throwIfAborted();
    if (!pixel[3]) throw new Error("此处完全透明，没有可见颜色，请选择其他位置。");
    return { hex: `#${[...pixel.slice(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`, alpha: pixel[3], x, y };
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; }
}
export async function replaceImageColor(file: File, options: ColorReplaceOptions, signal: AbortSignal) {
  if (typeof OffscreenCanvas === "undefined") throw new Error("浏览器不支持后台画布，请使用新版浏览器。");
  const bitmap = await bitmapForWork(file, signal, 4); let canvas: OffscreenCanvas | undefined, thumb: OffscreenCanvas | undefined;
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("无法读取像素。"); ctx.drawImage(bitmap, 0, 0); const raw = ctx.getImageData(0, 0, bitmap.width, bitmap.height), result = replaceColorPixels(raw.data, bitmap.width, bitmap.height, options);
    ctx.putImageData(new ImageData(result.pixels, bitmap.width, bitmap.height), 0, 0); signal.throwIfAborted(); const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)); thumb = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale))); const previewContext = thumb.getContext("2d"); if (!previewContext) throw new Error("无法生成预览。"); previewContext.drawImage(canvas, 0, 0, thumb.width, thumb.height); const preview = await thumb.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    return { blob, preview, width: bitmap.width, height: bitmap.height, changed: result.changed };
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; if (thumb) thumb.width = thumb.height = 0; }
}
