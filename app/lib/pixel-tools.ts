import { applyPalette, buildPalette, utils } from "image-q";

export type RgbColor = { r: number; g: number; b: number };
export type PaletteEntry = RgbColor & { hex: string; count: number; percentage: number; code: string };
export type DitherMode = "nearest" | "floyd-steinberg" | "atkinson";

export const maxLocalImageSize = 25 * 1024 * 1024;
export const maxLocalImagePixels = 40_000_000;

export function isSupportedRasterImage(file: File) {
  return /^image\/(png|jpeg|webp|bmp|avif|gif)$/i.test(file.type)
    || (!file.type && /\.(png|jpe?g|webp|bmp|avif|gif)$/i.test(file.name));
}

export function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: RgbColor) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function readableTextColor({ r, g, b }: RgbColor) {
  const channels = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.42 ? "#203641" : "#FFFFFF";
}

export function summarizePixels(imageData: ImageData, codePrefix = "C") {
  const counts = new Map<string, { color: RgbColor; count: number }>();
  let total = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (imageData.data[index + 3] < 16) continue;
    const color = { r: imageData.data[index], g: imageData.data[index + 1], b: imageData.data[index + 2] };
    const key = `${color.r},${color.g},${color.b}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { color, count: 1 });
    total += 1;
  }
  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count)
    .map(({ color, count }, index): PaletteEntry => ({
      ...color,
      hex: rgbToHex(color),
      count,
      percentage: total ? count / total * 100 : 0,
      code: `${codePrefix}${String(index + 1).padStart(2, "0")}`,
    }));
}

export async function quantizeImageData(imageData: ImageData, colors: number, dither: DitherMode) {
  const source = utils.PointContainer.fromImageData(imageData);
  const palette = await buildPalette([source], {
    colors: Math.max(2, Math.min(64, Math.round(colors))),
    colorDistanceFormula: "ciede2000",
    paletteQuantization: "wuquant",
  });
  const quantized = await applyPalette(source.clone(), palette, {
    colorDistanceFormula: "ciede2000",
    imageQuantization: dither,
  });
  return new ImageData(
    new Uint8ClampedArray(quantized.toUint8Array()),
    quantized.getWidth(),
    quantized.getHeight(),
  );
}

export function loadLocalImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片。"));
    image.src = url;
  });
}

export function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("PNG 生成失败。")),
    "image/png",
  ));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "image";
}
