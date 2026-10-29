import { loadRaster } from "./local-images";
import { inspectStaticRaster } from "./static-raster";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
import { imageBlurRegion, validateImageBlur, type ImageBlurOptions } from "./image-blur-options";

type Report = (progress: number, status: string) => void;
export type ImageBlurSource = { thumbnail: Blob; width: number; height: number };
export type ImageBlurResult = ImageBlurSource & { blob: Blob };

export function checkImageBlurWork(width: number, height: number, constrained = false) {
  if (typeof constrained !== "boolean") throw new Error("设备预算参数无效。");
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= toolLimits.raster.edge) || width * height > toolLimits.image.pixels) throw new Error("图片尺寸无效；单边最多 8192px，总像素最多 100 MP。");
  // RGBA8 input/output + Float32 RGBA horizontal plane + decoded bitmap/canvas,
  // plus two conservative RGBA8-equivalent preview/encoder buffers.
  const buffers = 10;
  checkRasterWork(width, height, buffers);
  if ((constrained || isConstrainedDevice()) && width * height * 4 * buffers > 512 * 1024 * 1024) throw new Error("此图像操作的预计工作空间超过当前设备预算，请先裁剪或缩小图片。");
}

/** Separable, alpha-weighted box mean, not a Gaussian filter. Retains source alpha. */
export function applyImageBlurPixels(input: Uint8ClampedArray, width: number, height: number, options: ImageBlurOptions, signal?: AbortSignal, report?: Report, constrained = false) {
  validateImageBlur(options); checkImageBlurWork(width, height, constrained); signal?.throwIfAborted();
  if (!(input instanceof Uint8ClampedArray) || input.length !== width * height * 4) throw new Error("图片像素数据无效。");
  const output = input.slice();
  if (options.strength === 0) return output;
  const horizontal = new Float32Array(input.length), radius = options.radius, diameter = radius * 2 + 1, strength = options.strength / 100, region = imageBlurRegion(width, height, options);
  const bound = (value: number, end: number) => Math.max(0, Math.min(end - 1, value));
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted(); const sum = [0, 0, 0, 0];
    const add = (x: number, weight: number) => { const at = (y * width + bound(x, width)) * 4, alpha = input[at + 3] / 255; for (let c = 0; c < 3; c++) sum[c] += input[at + c] * alpha * weight; sum[3] += alpha * weight; };
    // Replicated edges, with O(min(radius, width)) initialization even for 1px images.
    add(0, radius + 1); for (let x = 1; x <= Math.min(radius, width - 1); x++) add(x, 1); if (radius >= width) add(width - 1, radius - width + 1);
    for (let x = 0; x < width; x++) { const at = (y * width + x) * 4; for (let c = 0; c < 4; c++) horizontal[at + c] = sum[c] / diameter; add(x - radius, -1); add(x + radius + 1, 1); }
    if (!(y % 64)) report?.(8 + 32 * y / height, "正在计算横向均值…");
  }
  for (let x = region.left; x < region.right; x++) {
    signal?.throwIfAborted(); const sum = [0, 0, 0, 0];
    const add = (y: number, weight: number) => { const at = (bound(y, height) * width + x) * 4; for (let c = 0; c < 4; c++) sum[c] += horizontal[at + c] * weight; };
    const first = region.top;
    // Starting inside a region still samples its surrounding source pixels.
    const low = Math.max(0, first - radius), high = Math.min(height - 1, first + radius);
    if (first - radius < 0) add(0, radius - first);
    for (let y = low; y <= high; y++) add(y, 1);
    if (first + radius >= height) add(height - 1, first + radius - height + 1);
    for (let y = region.top; y < region.bottom; y++) {
      const at = (y * width + x) * 4;
      if (input[at + 3] && sum[3] > 1e-8) for (let c = 0; c < 3; c++) output[at + c] = input[at + c] * (1 - strength) + sum[c] / sum[3] * strength;
      add(y - radius, -1); add(y + radius + 1, 1);
    }
    if (!(x % 64)) report?.(40 + 35 * (x - region.left) / Math.max(1, region.right - region.left), "正在计算纵向均值与混合…");
  }
  signal?.throwIfAborted(); return output;
}

async function workBitmap(file: File, signal: AbortSignal, constrained: boolean) {
  signal.throwIfAborted(); const header = await inspectStaticRaster(file, signal); signal.throwIfAborted();
  if (header.width && header.height) checkImageBlurWork(header.width, header.height, constrained);
  const bitmap = await loadRaster(file, signal);
  try { checkImageBlurWork(bitmap.width, bitmap.height, constrained); return bitmap; } catch (cause) { bitmap.close(); throw cause; }
}
async function thumbnail(source: ImageBitmap | OffscreenCanvas, width: number, height: number, signal: AbortSignal) {
  signal.throwIfAborted(); const scale = Math.min(1, 1280 / Math.max(width, height)), canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  try { const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建预览画布。"); context.drawImage(source, 0, 0, canvas.width, canvas.height); const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted(); return blob; }
  finally { canvas.width = canvas.height = 1; }
}
export async function prepareImageBlurSource(file: File, signal: AbortSignal, constrained = false): Promise<ImageBlurSource> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await workBitmap(file, signal, constrained);
  try { return { thumbnail: await thumbnail(bitmap, bitmap.width, bitmap.height, signal), width: bitmap.width, height: bitmap.height }; } finally { bitmap.close(); }
}
export async function processImageBlur(file: File, options: ImageBlurOptions, signal: AbortSignal, report?: Report, constrained = false): Promise<ImageBlurResult> {
  validateImageBlur(options);
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await workBitmap(file, signal, constrained); let canvas: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted(); report?.(3, "正在读取原尺寸像素…"); canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法读取图片像素。");
    context.drawImage(bitmap, 0, 0); const raw = context.getImageData(0, 0, bitmap.width, bitmap.height), pixels = applyImageBlurPixels(raw.data, bitmap.width, bitmap.height, options, signal, report, constrained);
    context.putImageData(new ImageData(pixels, bitmap.width, bitmap.height), 0, 0); signal.throwIfAborted(); report?.(80, "正在编码原尺寸 PNG…");
    const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    if (blob.size > toolLimits.image.fileBytes) throw new Error("导出 PNG 超过 100 MiB，请先缩小图片或裁剪后重试。");
    return { blob, thumbnail: await thumbnail(canvas, bitmap.width, bitmap.height, signal), width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
}
