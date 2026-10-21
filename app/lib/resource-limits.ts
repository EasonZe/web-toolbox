/** Local workload safeguards, not server upload quotas. */
const MiB = 1024 * 1024;
export const toolLimits = {
  image: { fileBytes: 100 * MiB, pixels: 100_000_000, batchFiles: 200, batchBytes: 1024 * MiB },
  media: { fileBytes: 2 * 1024 * MiB, videoReverseSeconds: 3600 },
  decodedAudio: { fileBytes: 512 * MiB, files: 200, seconds: 3 * 3600, samples: 192_000_000 },
  archive: { fileBytes: 512 * MiB, expandedBytes: 512 * MiB, entryBytes: 256 * MiB, entries: 2000 },
  unity: { fileBytes: 512 * MiB, expandedBytes: 1024 * MiB, entryBytes: 256 * MiB, assets: 20_000, entries: 100_000, textPreviewBytes: MiB },
  document: { fileBytes: 200 * MiB, pages: 1000, layoutPages: 200, expandedBytes: 512 * MiB },
  pdf: { files: 100, bytes: 200 * MiB, sourcePages: 1000, outputPages: 2000 },
  model: { fileBytes: 512 * MiB, exportEdge: 3840 },
  text: { fileBytes: 32 * MiB, editorChars: 8_000_000, formatChars: 5_000_000, jsonChars: 5_000_000, diffChars: 2_000_000, diffRows: 100_000, markdownChars: 2_000_000, unicodePoints: 100_000, subtitleCues: 50_000, shortChars: 2000, morseChars: 20000, baseDigits: 10000 },
  gif: { files: 200, batchBytes: 512 * MiB, duration: 60, width: 1920, workPixels: 200_000_000 },
  base64: { fileBytes: 50 * MiB },
  raster: { edge: 8192 },
  math: { expressionChars: 2000, matrixEdge: 12, statisticsItems: 100_000 },
  lottery: { entries: 5000, nameChars: 200, columns: 1000, cells: 1_000_000, excelExpandedBytes: 128 * MiB },
  pageRows: 200,
} as const;
export function isConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (typeof memory === "number" && memory <= 4) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function audioSampleBudget() { return isConstrainedDevice() ? 64_000_000 : toolLimits.decodedAudio.samples; }
export function checkDecodedAudio(duration: number, sampleRate: number, channels: number, existingSamples = 0) {
  if (![duration, sampleRate, channels, existingSamples].every(Number.isFinite) || duration <= 0 || sampleRate <= 0 || channels < 1 || existingSamples < 0)
    throw new Error("无法确认音频采样信息，请更换文件。");
  const samples = Math.ceil(duration * sampleRate) * Math.min(2, channels);
  if (duration > toolLimits.decodedAudio.seconds || samples + existingSamples > audioSampleBudget())
    throw new Error("音频解码后的采样量超过本设备的内存保护预算，请先缩短区间或使用音频格式转换工具；此限制按采样率、声道和设备计算，不是固定分钟数。");
  return samples;
}
export function largeFilesWarning(files: readonly { size: number }[], stream = false) {
  if (stream) return "";
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= (isConstrainedDevice() ? 128 : 512) * MiB && files.every((file) => file.size <= (isConstrainedDevice() ? 25 : 100) * MiB) && files.length <= (isConstrainedDevice() ? 40 : 100)) return "";
  return `本次选择 ${files.length} 个文件，共 ${(total / MiB).toFixed(1)} MB。大文件或大量文件处理可能较慢，并占用较多内存。可以继续，也可以取消后分批处理；原文件不会被修改。`;
}
let approvedImagePixels = 0;
export function checkImagePixels(width: number, height: number) {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || width <= 0 || height <= 0 || pixels > toolLimits.image.pixels)
    throw new Error("图片尺寸无效或超过 1 亿像素的安全处理范围。");
  const warning = isConstrainedDevice() ? 24_000_000 : 50_000_000;
  if (pixels > Math.max(warning, approvedImagePixels) && typeof window !== "undefined") {
    if (!window.confirm(`这张图片约 ${(pixels / 1_000_000).toFixed(1)} 百万像素，一份像素缓冲约 ${(pixels * 4 / MiB).toFixed(0)} MB，处理时还会产生额外缓冲。继续按原尺寸处理吗？`))
      throw new Error("已取消大图处理，原文件未改变。");
    approvedImagePixels = pixels;
  }
}
export function checkGifWork(width: number, height: number, frames: number) {
  const budget = isConstrainedDevice() ? toolLimits.gif.workPixels / 2 : toolLimits.gif.workPixels;
  if (![width, height, frames].every(Number.isFinite) || width < 1 || height < 1 || frames < 1 || width * height * frames > budget)
    throw new Error("GIF 的尺寸、帧率和时长组合过大，请降低其中一项；不自动降低导出质量。");
}
export function checkRasterWork(width: number, height: number, buffers = 3) {
  const bytes = width * height * 4 * buffers, budget = (isConstrainedDevice() ? 512 : 2048) * MiB;
  if (![width, height, buffers].every(Number.isFinite) || width < 1 || height < 1 || buffers < 1 || bytes > budget)
    throw new Error("此图像操作的预计工作空间超过当前设备预算，请降低输出尺寸、先裁剪图片或减少来源通道；输入文件大小不是唯一判断依据。");
}
