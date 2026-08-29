export const imagesToGifLimits = {
  maxFiles: 30,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxOutputWidth: 1080,
} as const;

export const supportedGifImageText = "PNG、JPG、WebP、GIF、BMP、AVIF";

const supportedGifImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/avif",
]);

export function isSupportedGifImage(file: File) {
  const type = file.type.toLowerCase();
  if (type) return supportedGifImageTypes.has(type);
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
}

export function validateGifImages(files: File[], existing: File[] = []) {
  const accepted: File[] = [];
  const errors: string[] = [];
  let total = existing.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (existing.length + accepted.length >= imagesToGifLimits.maxFiles) {
      errors.push(`最多选择${imagesToGifLimits.maxFiles}张图片`);
      break;
    }
    if (!isSupportedGifImage(file)) {
      errors.push(`${file.name}：不支持这种图片格式`);
      continue;
    }
    if (!file.size) {
      errors.push(`${file.name}：文件内容为空`);
      continue;
    }
    if (file.size > imagesToGifLimits.maxFileBytes) {
      errors.push(`${file.name}：单张图片不能超过20 MB`);
      continue;
    }
    if (total + file.size > imagesToGifLimits.maxTotalBytes) {
      errors.push("图片总大小不能超过100 MB");
      break;
    }
    accepted.push(file);
    total += file.size;
  }
  return { accepted, errors };
}

export function gifCanvasSize(sourceWidth: number, sourceHeight: number, requestedWidth: number) {
  if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > imagesToGifLimits.maxPixels) {
    throw new Error("首张图片尺寸无效或超过4000万像素");
  }
  const width = Math.max(1, Math.min(sourceWidth, requestedWidth || sourceWidth, imagesToGifLimits.maxOutputWidth));
  return { width, height: Math.max(1, Math.round(width * sourceHeight / sourceWidth)) };
}

export function gifFrameRect(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  mode: "contain" | "cover",
) {
  if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效");
  const scale = mode === "cover"
    ? Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    : Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = sourceWidth * scale, height = sourceHeight * scale;
  return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}
