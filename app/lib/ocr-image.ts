import { isConstrainedDevice, toolLimits } from "./resource-limits";
import { loadRaster } from "./local-images";
export type OcrImageOptions = { left: number; top: number; width: number; height: number; rotation: 0 | 90 | 180 | 270; scale: 1 | 2 | 3; filter: "original" | "grayscale" | "invert" };
export const defaultOcrImageOptions: OcrImageOptions = { left: 0, top: 0, width: 100, height: 100, rotation: 0, scale: 2, filter: "original" };
export function ocrImageLayout(width: number, height: number, options: OcrImageOptions, constrained = isConstrainedDevice()) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || ![options.left, options.top, options.width, options.height].every(Number.isFinite) || options.left < 0 || options.top < 0 || options.width <= 0 || options.height <= 0 || options.left + options.width > 100 || options.top + options.height > 100 || ![0, 90, 180, 270].includes(options.rotation) || ![1, 2, 3].includes(options.scale) || !["original", "grayscale", "invert"].includes(options.filter)) throw new Error("识别范围或图像处理设置无效。");
  const x = Math.floor(width * options.left / 100), y = Math.floor(height * options.top / 100);
  const cropWidth = Math.max(1, Math.min(width - x, Math.round(width * options.width / 100))), cropHeight = Math.max(1, Math.min(height - y, Math.round(height * options.height / 100)));
  const rotated = options.rotation === 90 || options.rotation === 270, rw = rotated ? cropHeight : cropWidth, rh = rotated ? cropWidth : cropHeight;
  const budget = constrained ? toolLimits.ocr.mobilePixels : toolLimits.ocr.desktopPixels;
  const scale = Math.min(options.scale, toolLimits.ocr.edge / Math.max(rw, rh), Math.sqrt(budget / (rw * rh)));
  return { x, y, cropWidth, cropHeight, width: Math.max(1, Math.floor(rw * scale)), height: Math.max(1, Math.floor(rh * scale)), scale };
}
export async function prepareOcrImage(file: File, options: OcrImageOptions, signal: AbortSignal) {
  signal.throwIfAborted(); const bitmap = await loadRaster(file, signal), canvas = document.createElement("canvas");
  try {
    const layout = ocrImageLayout(bitmap.width, bitmap.height, options); canvas.width = layout.width; canvas.height = layout.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("浏览器无法绘制识别图片。");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2); context.rotate(options.rotation * Math.PI / 180);
    const swapped = options.rotation === 90 || options.rotation === 270;
    const drawWidth = swapped ? canvas.height : canvas.width, drawHeight = swapped ? canvas.width : canvas.height;
    context.imageSmoothingEnabled = drawWidth !== layout.cropWidth || drawHeight !== layout.cropHeight;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, layout.x, layout.y, layout.cropWidth, layout.cropHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    if (options.filter !== "original") for (let i = 0; i < image.data.length; i += 4) {
      if (options.filter === "grayscale") { const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114); image.data[i] = image.data[i + 1] = image.data[i + 2] = gray; }
      else for (let c = 0; c < 3; c++) image.data[i + c] = 255 - image.data[i + c];
    }
    signal.throwIfAborted(); return { image, requestedScale: options.scale, actualScale: layout.scale };
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
