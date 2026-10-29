import type { PdfScanOptions } from "./pdf-scan-options";
import { toolLimits } from "./resource-limits";
export function scanPixels(pixels: Uint8ClampedArray, mode: PdfScanOptions["mode"], threshold: number) {
  if (pixels.length % 4 || pixels.length > toolLimits.pdfExport.desktopPixels * 4 || !["color", "grayscale", "threshold"].includes(mode) || !Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new Error("扫描效果参数或像素量无效。");
  if (mode === "color") return pixels;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255, light = Math.round((0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) * alpha + 255 * (1 - alpha));
    const value = mode === "threshold" ? light >= threshold ? 255 : 0 : light;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value; pixels[i + 3] = 255;
  }
  return pixels;
}
