import { PDFDocument, rgb } from "pdf-lib";
import { checkFiles } from "./local-files";
import { loadRaster } from "./local-images";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
import type { ImagePdfOptions } from "./extra-tool-options";
export type PreparedPdfImage = { data: Uint8Array; width: number; height: number; format: "png" | "jpeg" };
function validateOptions(options: ImagePdfOptions) {
  if (!["a4", "a5", "letter", "image"].includes(options.page) || !["auto", "portrait", "landscape"].includes(options.orientation) || !["png", "jpeg"].includes(options.format)
    || !Number.isFinite(options.margin) || options.margin < 0 || options.margin > 50 || !Number.isFinite(options.dpi) || options.dpi < 36 || options.dpi > 600
    || !Number.isFinite(options.quality) || options.quality < 0.5 || options.quality > 1 || ![0, 4096, 2048].includes(options.edge)) throw new Error("PDF 页面或图像参数无效。");
}
export function imagePdfLayout(width: number, height: number, options: ImagePdfOptions) {
  validateOptions(options);
  if (![width, height].every((v) => Number.isSafeInteger(v) && v > 0) || width * height > toolLimits.image.pixels) throw new Error("图片尺寸无效或过大。");
  const margin = options.margin * 72 / 25.4;
  let pageWidth: number, pageHeight: number;
  if (options.page === "image") { pageWidth = width * 72 / options.dpi + margin * 2; pageHeight = height * 72 / options.dpi + margin * 2; }
  else {
    [pageWidth, pageHeight] = options.page === "letter" ? [612, 792] : options.page === "a5" ? [419.5276, 595.2756] : [595.2756, 841.8898];
    if (options.orientation === "landscape" || (options.orientation === "auto" && width > height)) [pageWidth, pageHeight] = [pageHeight, pageWidth];
  }
  if (pageWidth > 14400 || pageHeight > 14400 || pageWidth <= margin * 2 || pageHeight <= margin * 2) throw new Error("PDF 纸张过大或边距超过可用范围，请调整 DPI 或边距。");
  const scale = Math.min((pageWidth - 2 * margin) / width, (pageHeight - 2 * margin) / height);
  const drawWidth = width * scale, drawHeight = height * scale;
  return { pageWidth, pageHeight, x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight };
}
export async function preparePdfImage(file: File, options: ImagePdfOptions, signal: AbortSignal): Promise<PreparedPdfImage> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("当前浏览器不支持后台图片处理，请使用新版浏览器。");
  const bitmap = await loadRaster(file, signal);
  let canvas: OffscreenCanvas | undefined;
  try {
    const scale = options.edge ? Math.min(1, options.edge / Math.max(bitmap.width, bitmap.height)) : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    checkRasterWork(bitmap.width, bitmap.height, 1 + 2 * width * height / (bitmap.width * bitmap.height));
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片绘制环境。");
    if (options.format === "jpeg") { context.fillStyle = "white"; context.fillRect(0, 0, width, height); }
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: `image/${options.format}`, quality: options.quality });
    signal.throwIfAborted();
    if (blob.type !== `image/${options.format}`) throw new Error("浏览器无法按所选图片格式编码。");
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height, format: options.format };
  } finally { bitmap.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}
export async function buildImagesPdf(files: File[], options: ImagePdfOptions, signal: AbortSignal, report: (value: number, text: string) => void = () => {}, prepare = preparePdfImage) {
  validateOptions(options);
  checkFiles(files, toolLimits.image.batchBytes, toolLimits.image.batchFiles);
  if (files.some((file) => file.size > toolLimits.image.fileBytes)) throw new Error("每张图片最多 100 MB。");
  signal.throwIfAborted();
  const doc = await PDFDocument.create(); doc.setTitle("图片合成 PDF"); doc.setCreator("多功能工具箱");
  let memory = 0;
  const budget = toolLimits.pdf.imageWorkBytes / (isConstrainedDevice() ? 2 : 1);
  for (let index = 0; index < files.length; index++) {
    signal.throwIfAborted(); report(index / files.length * 90, `正在处理第 ${index + 1} / ${files.length} 张`);
    const image = await prepare(files[index], options, signal);
    signal.throwIfAborted();
    const layout = imagePdfLayout(image.width, image.height, options);
    memory += image.data.byteLength + image.width * image.height * 4;
    if (memory > budget) throw new Error("图片合成预计占用超过本设备内存预算，请选择 2048 / 4096px、JPEG 或分批导出；未自动降低画质。");
    const embedded = image.format === "png" ? await doc.embedPng(image.data) : await doc.embedJpg(image.data);
    if (embedded.width !== image.width || embedded.height !== image.height) throw new Error("图片编码尺寸不一致。");
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: layout.pageWidth, height: layout.pageHeight, color: rgb(1, 1, 1) });
    page.drawImage(embedded, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
    // Embedding each image before the next source avoids retaining decoded bitmaps.
    await embedded.embed();
  }
  signal.throwIfAborted(); report(95, "正在生成 PDF…");
  const data = await doc.save(); signal.throwIfAborted();
  if (data.byteLength > toolLimits.pdf.bytes) throw new Error("PDF 输出超过 200 MB，请降低尺寸或分批导出。");
  return data;
}
