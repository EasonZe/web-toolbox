export type StitchDirection = "horizontal" | "vertical";
export type StitchSizeMode = "original" | "uniform";
export type StitchAlignment = "start" | "center" | "end";

export type StitchImageSize = {
  width: number;
  height: number;
};

export type StitchOptions = {
  direction: StitchDirection;
  sizeMode: StitchSizeMode;
  crossSize: number;
  gap: number;
  padding: number;
  alignment: StitchAlignment;
};

export type StitchRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StitchLayout = {
  width: number;
  height: number;
  rects: StitchRect[];
};

export const imageStitchingLimits = {
  maxFiles: 30,
  maxFileSize: 25 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxOutputDimension: 16_384,
  maxOutputPixels: 80_000_000,
} as const;

const supportedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);

export const supportedStitchImageText = "支持JPG、PNG、WebP、GIF、BMP、AVIF";

function normalizedType(file: File) {
  if (supportedTypes.has(file.type.toLowerCase())) return file.type.toLowerCase();
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  if (/\.gif$/i.test(file.name)) return "image/gif";
  if (/\.bmp$/i.test(file.name)) return "image/bmp";
  if (/\.avif$/i.test(file.name)) return "image/avif";
  return "";
}

export function validateStitchImages(files: File[], current: File[] = []) {
  const accepted: File[] = [];
  const errors: string[] = [];
  let remaining = Math.max(0, imageStitchingLimits.maxFiles - current.length);

  for (const file of files) {
    if (remaining === 0) {
      errors.push(`最多选择${imageStitchingLimits.maxFiles}张图片`);
      break;
    }
    if (!normalizedType(file)) {
      errors.push(`${file.name}：不支持这种图片格式`);
      continue;
    }
    if (file.size > imageStitchingLimits.maxFileSize) {
      errors.push(`${file.name}：单张图片不能超过25 MB`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}：图片文件为空`);
      continue;
    }
    accepted.push(file);
    remaining -= 1;
  }

  return { accepted, errors };
}

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : fallback;
}

function boundedInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function calculateStitchLayout(
  images: StitchImageSize[],
  options: StitchOptions,
): StitchLayout {
  if (images.length === 0) return { width: 0, height: 0, rects: [] };

  const direction = options.direction === "vertical" ? "vertical" : "horizontal";
  const crossSize = boundedInteger(options.crossSize, 40, 4000);
  const gap = boundedInteger(options.gap, 0, 500);
  const padding = boundedInteger(options.padding, 0, 500);
  const alignment: StitchAlignment = ["start", "center", "end"].includes(options.alignment)
    ? options.alignment
    : "center";

  const sizes = images.map((image) => {
    const width = positiveInteger(image.width, 1);
    const height = positiveInteger(image.height, 1);
    if (options.sizeMode !== "uniform") return { width, height };
    const scale = direction === "horizontal" ? crossSize / height : crossSize / width;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  });

  const contentWidth = direction === "horizontal"
    ? sizes.reduce((total, image) => total + image.width, 0) + gap * (sizes.length - 1)
    : Math.max(...sizes.map((image) => image.width));
  const contentHeight = direction === "vertical"
    ? sizes.reduce((total, image) => total + image.height, 0) + gap * (sizes.length - 1)
    : Math.max(...sizes.map((image) => image.height));

  let cursor = padding;
  const rects = sizes.map((image) => {
    const availableCross = direction === "horizontal" ? contentHeight : contentWidth;
    const imageCross = direction === "horizontal" ? image.height : image.width;
    const crossOffset = alignment === "start"
      ? 0
      : alignment === "end"
        ? availableCross - imageCross
        : Math.round((availableCross - imageCross) / 2);
    const rect = direction === "horizontal"
      ? { x: cursor, y: padding + crossOffset, width: image.width, height: image.height }
      : { x: padding + crossOffset, y: cursor, width: image.width, height: image.height };
    cursor += (direction === "horizontal" ? image.width : image.height) + gap;
    return rect;
  });

  return {
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2,
    rects,
  };
}

export function validateStitchLayout(layout: StitchLayout) {
  if (!layout.width || !layout.height) return "没有可拼接的图片";
  if (
    layout.width > imageStitchingLimits.maxOutputDimension ||
    layout.height > imageStitchingLimits.maxOutputDimension
  ) {
    return "拼接后的图片边长超过16384像素，请使用统一尺寸或减少图片";
  }
  if (layout.width * layout.height > imageStitchingLimits.maxOutputPixels) {
    return "拼接后的图片像素过大，请降低统一尺寸或减少图片";
  }
  return "";
}
