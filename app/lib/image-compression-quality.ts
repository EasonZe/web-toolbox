export const defaultCompressionQuality = 80;
export const compressionQualityPresets = [20, 40, 60, 80, 90, 100] as const;

export function normalizeCompressionQuality(value: number) {
  if (!Number.isFinite(value)) return defaultCompressionQuality;
  return Math.min(100, Math.max(1, Math.round(value)));
}

// 不再将量化步长取整，避免多个相邻质量档位使用同一张颜色表。
// 查表只修改 RGB，透明度由调用方原样保留。
export function pngColorTable(quality: number) {
  const step = 1 + (100 - normalizeCompressionQuality(quality)) / 7;
  const table = new Uint8Array(256);
  for (let value = 0; value < 256; value++) {
    table[value] = Math.min(255, Math.round(Math.round(value / step) * step));
  }
  table[255] = 255;
  return table;
}
