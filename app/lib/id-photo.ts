import { isConstrainedDevice, toolLimits } from "./resource-limits";
import { loadRaster } from "./local-images";
import { setImageDpi } from "./image-dpi";
export type IdPhotoOptions = { widthMm: number; heightMm: number; dpi: number; background: string; zoom: number; focusX: number; focusY: number; format: "png" | "jpeg" };
export type IdPhotoPaper = { widthMm: number; heightMm: number; gapMm: number; marginMm: number; copies: number; guides: boolean };
export const idPhotoPresets = [{ name: "一寸 · 25×35 mm", widthMm: 25, heightMm: 35 }, { name: "小一寸 · 22×32 mm", widthMm: 22, heightMm: 32 }, { name: "二寸 · 35×49 mm", widthMm: 35, heightMm: 49 }, { name: "小二寸 · 33×48 mm", widthMm: 33, heightMm: 48 }, { name: "35×45 mm", widthMm: 35, heightMm: 45 }];
export const defaultIdPhoto: IdPhotoOptions = { widthMm: 25, heightMm: 35, dpi: 300, background: "#ffffff", zoom: 1, focusX: 50, focusY: 50, format: "png" };
export const defaultIdPaper: IdPhotoPaper = { widthMm: 101.6, heightMm: 152.4, gapMm: 3, marginMm: 5, copies: 8, guides: true };
export const mmToPixels = (mm: number, dpi: number) => Math.round(mm / 25.4 * dpi);
function checkCanvas(width: number, height: number, extraPixels = 0) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= toolLimits.raster.edge) || width * height + extraPixels > (isConstrainedDevice() ? toolLimits.idPhoto.mobilePixels : toolLimits.idPhoto.desktopPixels)) throw new Error("照片或相纸像素超过当前设备预算，请降低 DPI 或尺寸；不会自动改变打印规格。");
}
export function idPhotoSize(options: IdPhotoOptions) {
  if (![options.widthMm, options.heightMm, options.dpi, options.zoom, options.focusX, options.focusY].every(Number.isFinite) || options.widthMm < 5 || options.widthMm > 200 || options.heightMm < 5 || options.heightMm > 200 || !Number.isInteger(options.dpi) || options.dpi < 72 || options.dpi > 1200 || options.zoom < 1 || options.zoom > 4 || options.focusX < 0 || options.focusX > 100 || options.focusY < 0 || options.focusY > 100 || !/^#[\da-f]{6}$/i.test(options.background) || !["png", "jpeg"].includes(options.format)) throw new Error("照片尺寸、DPI、裁切位置或背景设置无效。");
  const width = mmToPixels(options.widthMm, options.dpi), height = mmToPixels(options.heightMm, options.dpi); checkCanvas(width, height); return { width, height };
}
export function idPhotoCrop(sourceWidth: number, sourceHeight: number, options: IdPhotoOptions) {
  idPhotoSize(options);
  if (![sourceWidth, sourceHeight].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error("原图尺寸无效。");
  const ratio = options.widthMm / options.heightMm;
  const width = Math.min(sourceWidth, sourceHeight * ratio) / options.zoom, height = width / ratio;
  return { x: (sourceWidth - width) * options.focusX / 100, y: (sourceHeight - height) * options.focusY / 100, width, height };
}
export function idPaperLayout(options: IdPhotoOptions, paper: IdPhotoPaper) {
  const photo = idPhotoSize(options);
  if (![paper.widthMm, paper.heightMm, paper.gapMm, paper.marginMm, paper.copies].every(Number.isFinite) || paper.widthMm < 20 || paper.heightMm < 20 || paper.widthMm > 420 || paper.heightMm > 420 || paper.gapMm < 0 || paper.gapMm > 30 || paper.marginMm < 0 || paper.marginMm > 50 || !Number.isInteger(paper.copies) || paper.copies < 1 || paper.copies > toolLimits.idPhoto.copies || typeof paper.guides !== "boolean") throw new Error("相纸尺寸、间距、边距或张数无效。");
  const width = mmToPixels(paper.widthMm, options.dpi), height = mmToPixels(paper.heightMm, options.dpi), gap = mmToPixels(paper.gapMm, options.dpi), margin = mmToPixels(paper.marginMm, options.dpi);
  checkCanvas(width, height, photo.width * photo.height * 2);
  const columns = Math.max(0, Math.floor((width - 2 * margin + gap) / (photo.width + gap))), rows = Math.max(0, Math.floor((height - 2 * margin + gap) / (photo.height + gap)));
  if (!columns || !rows || paper.copies > columns * rows) throw new Error(`当前相纸最多可排 ${columns * rows} 张，请减少张数、调整边距或换相纸方向。`);
  const usedColumns = Math.min(columns, paper.copies), usedRows = Math.ceil(paper.copies / columns);
  const x = Math.floor((width - usedColumns * photo.width - (usedColumns - 1) * gap) / 2), y = Math.floor((height - usedRows * photo.height - (usedRows - 1) * gap) / 2);
  return { width, height, photo, capacity: columns * rows, columns, rows, gap, positions: Array.from({ length: paper.copies }, (_, i) => ({ x: x + i % columns * (photo.width + gap), y: y + Math.floor(i / columns) * (photo.height + gap) })) };
}
async function photoBlob(canvas: HTMLCanvasElement, options: IdPhotoOptions, signal: AbortSignal) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("无法编码证件照。")), `image/${options.format}`, 0.95)); signal.throwIfAborted();
  if (blob.size > toolLimits.image.fileBytes) throw new Error("导出图片超过 100 MiB，请降低 DPI 或改为 JPEG。");
  const bytes = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted(); return setImageDpi(bytes, options.dpi);
}
export async function makeIdPhoto(file: File, options: IdPhotoOptions, signal: AbortSignal) {
  const size = idPhotoSize(options), bitmap = await loadRaster(file, signal), canvas = document.createElement("canvas");
  try {
    canvas.width = size.width; canvas.height = size.height; const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建照片画布。");
    const crop = idPhotoCrop(bitmap.width, bitmap.height, options); context.fillStyle = options.background; context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height); signal.throwIfAborted();
    return { blob: await photoBlob(canvas, options, signal), ...size, dpi: options.dpi };
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
export async function makeIdPhotoSheet(file: File, options: IdPhotoOptions, paper: IdPhotoPaper, signal: AbortSignal) {
  const layout = idPaperLayout(options, paper), single = await makeIdPhoto(file, options, signal); signal.throwIfAborted();
  const bitmap = await createImageBitmap(single.blob), canvas = document.createElement("canvas");
  try {
    signal.throwIfAborted(); canvas.width = layout.width; canvas.height = layout.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建相纸画布。");
    context.fillStyle = "#fff"; context.fillRect(0, 0, layout.width, layout.height);
    for (const point of layout.positions) { signal.throwIfAborted(); context.drawImage(bitmap, point.x, point.y, layout.photo.width, layout.photo.height); }
    if (paper.guides) {
      // Marks live only in the margin/gap, never over the photo pixels.
      context.strokeStyle = "#888"; context.lineWidth = 1;
      const length = Math.min(12, Math.floor(layout.gap / 2));
      if (length > 1) for (const p of layout.positions) for (const [x, y, dx, dy] of [[p.x, p.y, -1, -1], [p.x + layout.photo.width, p.y, 1, -1], [p.x, p.y + layout.photo.height, -1, 1], [p.x + layout.photo.width, p.y + layout.photo.height, 1, 1]]) {
        context.beginPath(); context.moveTo(x + dx * 2, y + dy * 2); context.lineTo(x + dx * length, y + dy * 2); context.moveTo(x + dx * 2, y + dy * 2); context.lineTo(x + dx * 2, y + dy * length); context.stroke();
      }
    }
    return { blob: await photoBlob(canvas, options, signal), width: layout.width, height: layout.height, dpi: options.dpi, copies: paper.copies, capacity: layout.capacity };
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
