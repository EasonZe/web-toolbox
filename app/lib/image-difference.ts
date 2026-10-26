import pixelmatch from "pixelmatch";
import type { ImageDiffOptions } from "./practical-tool-options";
import { loadRaster } from "./local-images";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
export type ImageDifference = { blob: Blob; preview: Blob; width: number; height: number; differences: number; ratio: number };
export function compareImagePixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, options: ImageDiffOptions) {
  if (![width, height].every((v) => Number.isSafeInteger(v) && v > 0) || width * height > toolLimits.image.pixels || a.length !== width * height * 4 || b.length !== a.length) throw new Error("图片像素或尺寸不一致。");
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) throw new Error("差异阈值须为 0–1。");
  checkRasterWork(width, height, 6);
  const pixels = new Uint8ClampedArray(a.length);
  const differences = pixelmatch(a, b, pixels, width, height, { threshold: options.threshold, includeAA: options.includeAA, diffMask: options.mask, checkerboard: false });
  return { pixels, differences, ratio: differences / (width * height) * 100 };
}
export async function compareImageFiles(left: File, right: File, options: ImageDiffOptions, signal: AbortSignal): Promise<ImageDifference> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图片处理，请使用新版浏览器。");
  let width = 0, height = 0;
  async function read(file: File) {
    const bitmap = await loadRaster(file, signal); let canvas: OffscreenCanvas | undefined;
    try {
      if (width && (bitmap.width !== width || bitmap.height !== height)) throw new Error("两张图片尺寸不同，请先统一尺寸；不会自动拉伸或缩放。");
      width = bitmap.width; height = bitmap.height; checkRasterWork(width, height, 6);
      if (width > toolLimits.raster.edge || height > toolLimits.raster.edge) throw new Error("图片单边超过 8192px，请先缩小图片。");
      canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("无法读取图片像素。"); ctx.drawImage(bitmap, 0, 0); return ctx.getImageData(0, 0, width, height).data;
    } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; }
  }
  const a = await read(left), b = await read(right); signal.throwIfAborted(); const result = compareImagePixels(a, b, width, height, options);
  const canvas = new OffscreenCanvas(width, height), thumb = new OffscreenCanvas(Math.max(1, Math.round(width * Math.min(1, 1280 / Math.max(width, height)))), Math.max(1, Math.round(height * Math.min(1, 1280 / Math.max(width, height)))));
  try {
    const ctx = canvas.getContext("2d"), previewContext = thumb.getContext("2d"); if (!ctx || !previewContext) throw new Error("无法生成差异图。");
    ctx.putImageData(new ImageData(result.pixels, width, height), 0, 0); signal.throwIfAborted();
    const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    if (blob.size > toolLimits.archive.expandedBytes / (isConstrainedDevice() ? 2 : 1)) throw new Error("差异图超过输出预算，请先缩小图片。");
    previewContext.drawImage(canvas, 0, 0, thumb.width, thumb.height); const preview = await thumb.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    return { blob, preview, width, height, differences: result.differences, ratio: result.ratio };
  } finally { canvas.width = canvas.height = thumb.width = thumb.height = 0; }
}
