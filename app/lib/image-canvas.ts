import { loadRaster } from "./local-images";
import { inspectStaticRaster } from "./static-raster";
import { checkRasterWork, toolLimits } from "./resource-limits";

export const canvasAnchors = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type CanvasAnchor = typeof canvasAnchors[number];
export type ImageCanvasOptions = { width: number; height: number; fit: "original" | "contain" | "cover"; anchor: CanvasAnchor; background: string; transparent: boolean };
export const defaultImageCanvas: ImageCanvasOptions = { width: 1280, height: 720, fit: "contain", anchor: "center", background: "#ffffff", transparent: false };
export type CanvasImageSource = { file: File; width: number; height: number; thumbnail: Blob };

export function validateImageCanvas(options: ImageCanvasOptions) {
  if (![options.width, options.height].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= toolLimits.raster.edge)) throw new Error(`画布宽高必须为 1–${toolLimits.raster.edge} 的整数像素。`);
  if (!["original", "contain", "cover"].includes(options.fit) || !canvasAnchors.includes(options.anchor) || (!options.transparent && !/^#[\da-f]{6}$/i.test(options.background)) || typeof options.transparent !== "boolean") throw new Error("画布位置、适配或底色参数无效。");
  // Output surface + encoder + result preview; a source bitmap is added below.
  checkRasterWork(options.width, options.height, 3);
}

export function canvasImagePlacement(width: number, height: number, options: ImageCanvasOptions) {
  validateImageCanvas(options);
  if (![width, height].every((n) => Number.isSafeInteger(n) && n >= 1) || width * height > toolLimits.image.pixels) throw new Error("原图尺寸无效。");
  if (options.fit === "original" && (width > options.width || height > options.height)) throw new Error("原尺寸放置需要画布不小于原图，请扩大画布或选择完整适配 / 填满裁切。");
  const scale = options.fit === "original" ? 1 : options.fit === "contain" ? Math.min(options.width / width, options.height / height) : Math.max(options.width / width, options.height / height);
  const positions: Record<CanvasAnchor, [number, number]> = { "top-left": [0, 0], top: [0.5, 0], "top-right": [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5], "bottom-left": [0, 1], bottom: [0.5, 1], "bottom-right": [1, 1] };
  const [x, y] = positions[options.anchor], drawWidth = width * scale, drawHeight = height * scale;
  checkRasterWork(options.width, options.height, 3 + width * height / (options.width * options.height));
  const left = (options.width - drawWidth) * x, top = (options.height - drawHeight) * y;
  // Unscaled pixels must land on whole pixels: half-pixel centering blurs even
  // with image smoothing off. Odd padding gives the extra pixel to right/bottom.
  return { x: options.fit === "original" ? Math.floor(left) : left, y: options.fit === "original" ? Math.floor(top) : top, width: drawWidth, height: drawHeight, scale };
}

async function canvasPng(canvas: HTMLCanvasElement, signal: AbortSignal) {
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 编码失败，请降低画布尺寸后重试。")), "image/png"));
  signal.throwIfAborted();
  if (blob.type !== "image/png" || blob.size > toolLimits.image.fileBytes) throw new Error("PNG 导出格式无效或超过 100 MiB，请降低画布尺寸。");
  return blob;
}

export async function prepareCanvasSource(file: File, signal: AbortSignal): Promise<CanvasImageSource> {
  const header = await inspectStaticRaster(file, signal);
  signal.throwIfAborted();
  if (header.width && header.height) checkRasterWork(header.width, header.height, 1 + 3 * Math.min(1, 1024 / Math.max(header.width, header.height)) ** 2);
  const image = await loadRaster(file, signal);
  let canvas: HTMLCanvasElement | undefined;
  try {
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    checkRasterWork(image.width, image.height, 1 + 3 * scale ** 2);
    canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("当前浏览器无法创建画布。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await canvasPng(canvas, signal);
    return { file, width: image.width, height: image.height, thumbnail };
  } finally { image.close(); if (canvas) canvas.width = canvas.height = 1; }
}

export async function createImageCanvas(file: File | null, options: ImageCanvasOptions, signal: AbortSignal) {
  validateImageCanvas(options); signal.throwIfAborted();
  let image: ImageBitmap | undefined, canvas: HTMLCanvasElement | undefined;
  try {
    if (file) {
      const header = await inspectStaticRaster(file, signal);
      signal.throwIfAborted();
      // EXIF rotation can swap decoded width/height. Only estimate memory from
      // the header; decide placement from the browser's oriented bitmap.
      if (header.width && header.height) checkRasterWork(options.width, options.height, 3 + header.width * header.height / (options.width * options.height));
      image = await loadRaster(file, signal);
    }
    const placement = image ? canvasImagePlacement(image.width, image.height, options) : null;
    signal.throwIfAborted();
    canvas = document.createElement("canvas"); canvas.width = options.width; canvas.height = options.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("当前浏览器无法创建画布。");
    if (!options.transparent) { context.fillStyle = options.background; context.fillRect(0, 0, canvas.width, canvas.height); }
    if (image && placement) { context.imageSmoothingEnabled = placement.scale !== 1; context.imageSmoothingQuality = "high"; context.drawImage(image, placement.x, placement.y, placement.width, placement.height); }
    const blob = await canvasPng(canvas, signal);
    return { blob, width: canvas.width, height: canvas.height, placement };
  } finally { image?.close(); if (canvas) canvas.width = canvas.height = 1; }
}
