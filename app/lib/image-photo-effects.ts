import { useMode as registerColorMode, modeRgb, modeLrgb, converter } from "culori/fn";
import { loadRaster } from "./local-images";
import { inspectStaticRaster } from "./static-raster";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
import { validatePhotoEffect, type PhotoEffectKind, type PhotoEffectOptions } from "./image-photo-effects-options";

// Culori's mode registration is not a React Hook. Only the two used color spaces are bundled.
registerColorMode(modeRgb); registerColorMode(modeLrgb);
const linear = converter("lrgb");
const linearByte = Float64Array.from({ length: 256 }, (_, byte) => linear({ mode: "rgb", r: byte / 255, g: 0, b: 0 })!.r);
const encode = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);
const bounded = (v: number, end: number) => Math.max(0, Math.min(end - 1, v));
type Report = (progress: number, status: string) => void;
export type PhotoEffectSource = { thumbnail: Blob; width: number; height: number };
export type PhotoEffectResult = PhotoEffectSource & { blob: Blob };

export function checkPhotoEffectWork(width: number, height: number, kind: PhotoEffectKind, constrained = false) {
  if (typeof constrained !== "boolean") throw new Error("设备预算参数无效。");
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= toolLimits.raster.edge) || width * height > toolLimits.image.pixels || !["duotone", "sharpen"].includes(kind)) throw new Error("图片尺寸无效；单边最多 8192px，总像素最多 100 MP。");
  // Sharpen: two Float32 RGBA planes = eight RGBA8 buffers, source/result pixels = two,
  // plus decoded bitmap and drawing canvas = two. Duotone has no Float32 image planes;
  // five buffers conservatively include the small preview/encoder workspace.
  const buffers = kind === "sharpen" ? 12 : 5;
  checkRasterWork(width, height, buffers);
  // iPadOS desktop mode exposes touch/platform evidence only in Window, not necessarily
  // WorkerNavigator. Carry the stricter Window decision across; false never relaxes local checks.
  if ((constrained || isConstrainedDevice()) && width * height * 4 * buffers > 512 * 1024 * 1024) throw new Error("此图像操作的预计工作空间超过当前设备预算，请先裁剪或缩小图片。");
}

export function applyPhotoEffectPixels(input: Uint8ClampedArray, width: number, height: number, options: PhotoEffectOptions, signal?: AbortSignal, report?: Report, constrained = false) {
  validatePhotoEffect(options); checkPhotoEffectWork(width, height, options.kind, constrained); signal?.throwIfAborted();
  if (!(input instanceof Uint8ClampedArray) || input.length !== width * height * 4) throw new Error("图片像素数据无效。");
  const output = input.slice();
  if (options.kind === "duotone") {
    if (options.strength === 0) return output;
    const channels = (hex: string) => [1, 3, 5].map((at) => linearByte[parseInt(hex.slice(at, at + 2), 16)]);
    const dark = channels(options.shadow), light = channels(options.highlight), strength = options.strength / 100;
    for (let y = 0; y < height; y++) {
      signal?.throwIfAborted();
      for (let i = y * width * 4; i < (y + 1) * width * 4; i += 4) {
        if (!input[i + 3]) continue;
        const luma = 0.2126 * linearByte[input[i]] + 0.7152 * linearByte[input[i + 1]] + 0.0722 * linearByte[input[i + 2]];
        for (let c = 0; c < 3; c++) output[i + c] = encode(linearByte[input[i + c]] * (1 - strength) + (dark[c] * (1 - luma) + light[c] * luma) * strength);
      }
      if (!(y % 64)) report?.(10 + 65 * y / height, "正在映射双色调…");
    }
    return output;
  }
  if (options.amount === 0) return output;
  const horizontal = new Float32Array(input.length), blurred = new Float32Array(input.length), radius = options.radius, diameter = radius * 2 + 1;
  // Alpha-weighted separable box blur: hidden RGB in transparent pixels cannot darken edges.
  // Sliding windows keep time O(width × height), independent of the chosen radius.
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted(); const sum = [0, 0, 0, 0];
    const add = (x: number, weight: number) => { const at = (y * width + bounded(x, width)) * 4, alpha = input[at + 3] / 255; for (let c = 0; c < 3; c++) sum[c] += input[at + c] * alpha * weight; sum[3] += alpha * weight; };
    for (let x = -radius; x <= radius; x++) add(x, 1);
    for (let x = 0; x < width; x++) { const at = (y * width + x) * 4; for (let c = 0; c < 4; c++) horizontal[at + c] = sum[c] / diameter; add(x - radius, -1); add(x + radius + 1, 1); }
    if (!(y % 64)) report?.(10 + 25 * y / height, "正在计算横向邻域…");
  }
  for (let x = 0; x < width; x++) {
    signal?.throwIfAborted(); const sum = [0, 0, 0, 0];
    const add = (y: number, weight: number) => { const at = (bounded(y, height) * width + x) * 4; for (let c = 0; c < 4; c++) sum[c] += horizontal[at + c] * weight; };
    for (let y = -radius; y <= radius; y++) add(y, 1);
    for (let y = 0; y < height; y++) { const at = (y * width + x) * 4; for (let c = 0; c < 4; c++) blurred[at + c] = sum[c] / diameter; add(y - radius, -1); add(y + radius + 1, 1); }
    if (!(x % 64)) report?.(35 + 25 * x / width, "正在计算纵向邻域…");
  }
  for (let i = 0; i < input.length; i += 4) {
    if (!(i % 65536)) signal?.throwIfAborted();
    const alpha = blurred[i + 3]; if (!input[i + 3] || alpha <= 1e-8) continue;
    const dr = input[i] - blurred[i] / alpha, dg = input[i + 1] - blurred[i + 1] / alpha, db = input[i + 2] - blurred[i + 2] / alpha;
    if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) <= options.threshold) continue;
    output[i] = input[i] + dr * options.amount / 100; output[i + 1] = input[i + 1] + dg * options.amount / 100; output[i + 2] = input[i + 2] + db * options.amount / 100;
  }
  report?.(75, "锐化像素已生成…"); return output;
}

async function workBitmap(file: File, kind: PhotoEffectKind, signal: AbortSignal, constrained: boolean) {
  signal.throwIfAborted();
  const header = await inspectStaticRaster(file, signal); signal.throwIfAborted();
  if (header.width && header.height) checkPhotoEffectWork(header.width, header.height, kind, constrained);
  const bitmap = await loadRaster(file, signal);
  try { checkPhotoEffectWork(bitmap.width, bitmap.height, kind, constrained); return bitmap; } catch (cause) { bitmap.close(); throw cause; }
}
async function thumbnail(source: ImageBitmap | OffscreenCanvas, width: number, height: number, signal: AbortSignal) {
  const scale = Math.min(1, 1280 / Math.max(width, height)), canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  try {
    const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建预览画布。");
    context.drawImage(source, 0, 0, canvas.width, canvas.height); const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted(); return blob;
  } finally { canvas.width = canvas.height = 1; }
}
export async function preparePhotoEffectSource(file: File, kind: PhotoEffectKind, signal: AbortSignal, constrained = false): Promise<PhotoEffectSource> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await workBitmap(file, kind, signal, constrained);
  try { return { thumbnail: await thumbnail(bitmap, bitmap.width, bitmap.height, signal), width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
}
export async function processPhotoEffect(file: File, options: PhotoEffectOptions, signal: AbortSignal, report?: Report, constrained = false): Promise<PhotoEffectResult> {
  validatePhotoEffect(options);
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await workBitmap(file, options.kind, signal, constrained); let canvas: OffscreenCanvas | undefined;
  try {
    report?.(3, "正在读取原尺寸像素…"); canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法读取图片像素。");
    context.drawImage(bitmap, 0, 0); const raw = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels = applyPhotoEffectPixels(raw.data, bitmap.width, bitmap.height, options, signal, report, constrained);
    context.putImageData(new ImageData(pixels, bitmap.width, bitmap.height), 0, 0); signal.throwIfAborted(); report?.(80, "正在编码原尺寸 PNG…");
    const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
    if (blob.size > toolLimits.image.fileBytes) throw new Error("导出 PNG 超过 100 MiB，请先缩小图片或裁剪后重试。");
    const preview = await thumbnail(canvas, bitmap.width, bitmap.height, signal);
    return { blob, thumbnail: preview, width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
}
