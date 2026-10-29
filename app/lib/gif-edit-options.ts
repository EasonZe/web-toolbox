import { checkGifWork, isConstrainedDevice, toolLimits } from "./resource-limits";

export type GifTimelineRow = { frame: number; delay: string; included: boolean };
export type GifEditFrame = { frame: number; delay: number; blob: Blob };
export type GifEditOptions = { width: number; height: number; repeat: number; frames: GifEditFrame[] };
export type GifEditResult = { blob: Blob; width: number; height: number; frames: number; duration: number; repeat: number; quantizedFrames: number };

export function parseGifDelay(text: string) {
  if (!text.trim()) throw new Error("请填写帧延迟；0 ms 也是有效值。");
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0 || value > 655350 || value % 10) throw new Error("帧延迟须为 0–655350 ms，且是 10 ms 的整数倍；不会自动取整。");
  return value;
}
export function moveGifRow(rows: GifTimelineRow[], index: number, offset: -1 | 1) {
  if (!Number.isInteger(index) || index < 0 || index >= rows.length || ![-1, 1].includes(offset)) return rows;
  const target = index + offset;
  if (target < 0 || target >= rows.length) return rows;
  const result = [...rows]; [result[index], result[target]] = [result[target], result[index]];
  return result;
}
export function gifEditOutputBudget() { return toolLimits.archive.expandedBytes / (isConstrainedDevice() ? 4 : 2); }
export function validateGifEditOptions(options: GifEditOptions) {
  if (![options.width, options.height, options.repeat].every(Number.isSafeInteger) || options.width < 1 || options.height < 1 || options.width > toolLimits.raster.edge || options.height > toolLimits.raster.edge || options.repeat < -1 || options.repeat > 65535) throw new Error("GIF 尺寸或循环计数无效。");
  if (!Array.isArray(options.frames) || !options.frames.length || options.frames.length > toolLimits.gifExtract.outputs) throw new Error("请勾选 1–200 帧导出。");
  checkGifWork(options.width, options.height, options.frames.length);
  const seen = new Set<number>(); let inputBytes = 0;
  for (const frame of options.frames) {
    if (!Number.isSafeInteger(frame.frame) || frame.frame < 1 || frame.frame > toolLimits.gifExtract.frames || seen.has(frame.frame) || !(frame.blob instanceof Blob) || frame.blob.type !== "image/png" || !frame.blob.size) throw new Error("编辑帧来源无效、重复或不是提取后的 PNG。");
    seen.add(frame.frame); parseGifDelay(String(frame.delay)); inputBytes += frame.blob.size;
  }
  if (inputBytes > gifEditOutputBudget()) throw new Error("编辑帧 PNG 总量超过当前设备预算，请缩小提取范围。");
  return inputBytes;
}
export function checkGifEditWorkspace(width: number, height: number, inputBytes: number, outputBytes: number) {
  // Canvas/bitmap/RGBA/index, quantizer and one frame's growing encoder stream.
  // Include retained compressed inputs and output/copy allowance, not just pixels.
  const bytes = width * height * 40 + inputBytes + outputBytes * 2 + 2 * 1024 * 1024;
  if (![width, height, inputBytes, outputBytes].every((value) => Number.isSafeInteger(value) && value >= 0) || width < 1 || height < 1 || bytes > (isConstrainedDevice() ? 512 : 2048) * 1024 * 1024) throw new Error("GIF 编辑工作空间超过当前设备预算，请缩小提取范围；不会自动缩小画面。");
}
