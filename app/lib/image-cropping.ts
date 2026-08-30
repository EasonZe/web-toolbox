export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropPoint = {
  x: number;
  y: number;
};

export type CropImageSize = {
  width: number;
  height: number;
};

export const imageCropLimits = {
  maxFileSize: 25 * 1024 * 1024,
  maxPixels: 40_000_000,
  minCropSize: 8,
} as const;

const supportedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);

export const supportedCropImageText = "支持JPG、PNG、WebP、GIF、BMP、AVIF";

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedType(file: File) {
  const type = file.type.toLowerCase();
  if (supportedTypes.has(type)) return type;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  if (/\.gif$/i.test(file.name)) return "image/gif";
  if (/\.bmp$/i.test(file.name)) return "image/bmp";
  if (/\.avif$/i.test(file.name)) return "image/avif";
  return "";
}

export function validateCropImage(file: File) {
  if (!normalizedType(file)) return "不支持这种图片格式";
  if (file.size === 0) return "图片文件为空";
  if (file.size > imageCropLimits.maxFileSize) return "图片不能超过25 MB";
  return "";
}

export function normalizeCropRect(
  rect: CropRect,
  image: CropImageSize,
  aspectRatio: number | null = null,
): CropRect {
  const imageWidth = Math.max(1, Math.round(finite(image.width, 1)));
  const imageHeight = Math.max(1, Math.round(finite(image.height, 1)));
  const minSize = Math.min(imageCropLimits.minCropSize, imageWidth, imageHeight);
  let width = clamp(finite(rect.width, minSize), minSize, imageWidth);
  let height = clamp(finite(rect.height, minSize), minSize, imageHeight);

  if (aspectRatio && aspectRatio > 0) {
    if (width / height > aspectRatio) width = height * aspectRatio;
    else height = width / aspectRatio;
    if (width > imageWidth) {
      width = imageWidth;
      height = width / aspectRatio;
    }
    if (height > imageHeight) {
      height = imageHeight;
      width = height * aspectRatio;
    }
  }

  width = Math.max(minSize, Math.round(width));
  height = Math.max(minSize, Math.round(height));
  const x = Math.round(clamp(finite(rect.x, 0), 0, Math.max(0, imageWidth - width)));
  const y = Math.round(clamp(finite(rect.y, 0), 0, Math.max(0, imageHeight - height)));
  return { x, y, width, height };
}

export function createInitialCrop(image: CropImageSize, aspectRatio: number | null = null) {
  const imageWidth = Math.max(1, Math.round(image.width));
  const imageHeight = Math.max(1, Math.round(image.height));
  let width = Math.max(1, Math.round(imageWidth * 0.9));
  let height = Math.max(1, Math.round(imageHeight * 0.9));

  if (aspectRatio && aspectRatio > 0) {
    if (width / height > aspectRatio) width = Math.round(height * aspectRatio);
    else height = Math.round(width / aspectRatio);
  }

  return normalizeCropRect({
    x: Math.round((imageWidth - width) / 2),
    y: Math.round((imageHeight - height) / 2),
    width,
    height,
  }, image, aspectRatio);
}

export function moveCropRect(
  rect: CropRect,
  delta: CropPoint,
  image: CropImageSize,
) {
  return normalizeCropRect({
    ...rect,
    x: rect.x + finite(delta.x, 0),
    y: rect.y + finite(delta.y, 0),
  }, image);
}

export function createCropFromPoints(
  anchor: CropPoint,
  pointer: CropPoint,
  image: CropImageSize,
  aspectRatio: number | null = null,
): CropRect {
  const imageWidth = Math.max(1, Math.round(image.width));
  const imageHeight = Math.max(1, Math.round(image.height));
  const start = {
    x: clamp(finite(anchor.x, 0), 0, imageWidth),
    y: clamp(finite(anchor.y, 0), 0, imageHeight),
  };
  const end = {
    x: clamp(finite(pointer.x, start.x), 0, imageWidth),
    y: clamp(finite(pointer.y, start.y), 0, imageHeight),
  };
  const directionX = end.x >= start.x ? 1 : -1;
  const directionY = end.y >= start.y ? 1 : -1;
  let width = Math.max(imageCropLimits.minCropSize, Math.abs(end.x - start.x));
  let height = Math.max(imageCropLimits.minCropSize, Math.abs(end.y - start.y));

  if (aspectRatio && aspectRatio > 0) {
    if (width / height > aspectRatio) height = width / aspectRatio;
    else width = height * aspectRatio;
  }

  const maxWidth = directionX > 0 ? imageWidth - start.x : start.x;
  const maxHeight = directionY > 0 ? imageHeight - start.y : start.y;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  width *= scale;
  height *= scale;
  const x = directionX > 0 ? start.x : start.x - width;
  const y = directionY > 0 ? start.y : start.y - height;

  return normalizeCropRect({ x, y, width, height }, image, aspectRatio);
}
