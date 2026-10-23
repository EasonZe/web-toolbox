import { checkRasterWork, toolLimits } from "./resource-limits";
export type ImageAdjustments = { brightness: number; contrast: number; saturation: number; warmth: number; grayscale: number; invert: number };
export const defaultAdjustments: ImageAdjustments = { brightness: 0, contrast: 0, saturation: 100, warmth: 0, grayscale: 0, invert: 0 };
export const imagePresets: { name: string; settings: ImageAdjustments }[] = [
  { name: "原图", settings: { ...defaultAdjustments } },
  { name: "清新", settings: { ...defaultAdjustments, brightness: 8, contrast: 8, saturation: 115, warmth: -5 } },
  { name: "暖调", settings: { ...defaultAdjustments, brightness: 3, warmth: 25, saturation: 105 } },
  { name: "冷调", settings: { ...defaultAdjustments, contrast: 8, warmth: -25 } },
  { name: "黑白", settings: { ...defaultAdjustments, contrast: 12, grayscale: 100 } },
  { name: "褪色", settings: { ...defaultAdjustments, brightness: 6, contrast: -18, saturation: 75, warmth: 10 } },
  { name: "反色", settings: { ...defaultAdjustments, invert: 100 } },
];
export function adjustImage(pixels: Uint8ClampedArray, width: number, height: number, settings: ImageAdjustments) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > toolLimits.image.pixels || pixels.length !== width * height * 4) throw new Error("图片像素数据无效。");
  const bounds = { brightness: [-100, 100], contrast: [-100, 100], saturation: [0, 200], warmth: [-100, 100], grayscale: [0, 100], invert: [0, 100] };
  for (const key of Object.keys(bounds) as (keyof ImageAdjustments)[]) if (!Number.isFinite(settings[key]) || settings[key] < bounds[key][0] || settings[key] > bounds[key][1]) throw new Error("调色参数超出范围。");
  checkRasterWork(width, height, 2);
  const result = new Uint8ClampedArray(pixels.length), bright = settings.brightness * 2.55;
  const contrast = 2 ** (settings.contrast / 50), saturation = settings.saturation / 100, gray = settings.grayscale / 100, inverted = settings.invert / 100, warmth = settings.warmth * 0.6;
  for (let i = 0; i < pixels.length; i += 4) {
    let r = (pixels[i] - 127.5) * contrast + 127.5 + bright + warmth;
    let g = (pixels[i + 1] - 127.5) * contrast + 127.5 + bright;
    let b = (pixels[i + 2] - 127.5) * contrast + 127.5 + bright - warmth;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = luma + (r - luma) * saturation * (1 - gray); g = luma + (g - luma) * saturation * (1 - gray); b = luma + (b - luma) * saturation * (1 - gray);
    result[i] = r * (1 - inverted) + (255 - r) * inverted;
    result[i + 1] = g * (1 - inverted) + (255 - g) * inverted;
    result[i + 2] = b * (1 - inverted) + (255 - b) * inverted;
    result[i + 3] = pixels[i + 3];
  }
  return result;
}
