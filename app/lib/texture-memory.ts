export const textureFormats = [
  { id: "r8", label: "R8 · 8 位单通道", blockWidth: 1, blockHeight: 1, blockBytes: 1 },
  { id: "rg8", label: "RG8 · 8 位双通道", blockWidth: 1, blockHeight: 1, blockBytes: 2 },
  { id: "rgb8", label: "RGB8 · 24 位", blockWidth: 1, blockHeight: 1, blockBytes: 3 },
  { id: "rgba8", label: "RGBA8 · 32 位", blockWidth: 1, blockHeight: 1, blockBytes: 4 },
  { id: "rgba16f", label: "RGBA16F · 64 位", blockWidth: 1, blockHeight: 1, blockBytes: 8 },
  { id: "rgba32f", label: "RGBA32F · 128 位", blockWidth: 1, blockHeight: 1, blockBytes: 16 },
  { id: "bc1", label: "BC1 / DXT1 · 4×4 / 8 B", blockWidth: 4, blockHeight: 4, blockBytes: 8 },
  { id: "bc3", label: "BC3 / DXT5 · 4×4 / 16 B", blockWidth: 4, blockHeight: 4, blockBytes: 16 },
  { id: "bc4", label: "BC4 · 单通道 / 4×4 / 8 B", blockWidth: 4, blockHeight: 4, blockBytes: 8 },
  { id: "bc5", label: "BC5 · 双通道 / 4×4 / 16 B", blockWidth: 4, blockHeight: 4, blockBytes: 16 },
  { id: "bc6h", label: "BC6H · HDR / 4×4 / 16 B", blockWidth: 4, blockHeight: 4, blockBytes: 16 },
  { id: "bc7", label: "BC7 · 4×4 / 16 B", blockWidth: 4, blockHeight: 4, blockBytes: 16 },
  { id: "etc2-rgb", label: "ETC2 RGB · 4×4 / 8 B", blockWidth: 4, blockHeight: 4, blockBytes: 8 },
  { id: "etc2-rgba", label: "ETC2 RGBA8 · 4×4 / 16 B", blockWidth: 4, blockHeight: 4, blockBytes: 16 },
  ...[[4, 4], [5, 5], [6, 6], [8, 8], [10, 10], [12, 12]].map(([blockWidth, blockHeight]) => ({ id: `astc-${blockWidth}x${blockHeight}`, label: `ASTC ${blockWidth}×${blockHeight} · 16 B / 块`, blockWidth, blockHeight, blockBytes: 16 })),
] as const;
export type TextureMemoryOptions = {
  width: number; height: number; count: number; layers: number;
  kind: "2d" | "array" | "cube";
  format: string; mipmaps: "none" | "full" | "custom"; levels: number;
};
export type TextureMip = { level: number; width: number; height: number; blocksX: number; blocksY: number; bytes: string; totalBytes: string };
export type TextureMemoryResult = {
  options: TextureMemoryOptions; format: (typeof textureFormats)[number]; faces: number; mipLevels: number;
  baseBytes: string; mipBytes: string; textureBytes: string; totalBytes: string; rows: TextureMip[];
};
export function positiveTextureInteger(text: string, label: string): number {
  if (!/^\d{1,16}$/u.test(text.trim())) throw new Error(`${label}须为正整数，不使用小数或科学计数法。`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label}须为安全范围内的正整数。`);
  return number;
}
export function fullTextureMipLevels(width: number, height: number): number {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("贴图尺寸须为安全范围内的正整数。");
  let levels = 1;
  while (width > 1 || height > 1) { width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2)); levels++; }
  return levels;
}
export function estimateTextureMemory(options: TextureMemoryOptions): TextureMemoryResult {
  if (![options.width, options.height, options.count, options.layers].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("尺寸、数量和层数须为安全范围内的正整数。");
  if (!["2d", "array", "cube"].includes(options.kind) || !["none", "full", "custom"].includes(options.mipmaps)) throw new Error("贴图类型或 Mipmap 模式无效。");
  if (options.kind !== "array" && options.layers !== 1) throw new Error("普通 2D 与立方体贴图的层数须为 1；立方体的 6 个面会单独计算。");
  if (options.kind === "cube" && options.width !== options.height) throw new Error("立方体贴图每个面须为正方形。");
  const format = textureFormats.find((value) => value.id === options.format);
  if (!format) throw new Error("请选择受支持的纹理格式。");
  const maximum = fullTextureMipLevels(options.width, options.height);
  if (options.mipmaps === "custom" && (!Number.isInteger(options.levels) || options.levels < 1 || options.levels > maximum)) throw new Error(`此尺寸的 Mipmap 层级须为 1–${maximum}（包含原图）。`);
  const mipLevels = options.mipmaps === "none" ? 1 : options.mipmaps === "full" ? maximum : options.levels;
  const faces = options.kind === "cube" ? 6 : 1, multiplier = BigInt(options.layers) * BigInt(faces) * BigInt(options.count);
  let width = options.width, height = options.height, sum = BigInt(0);
  const rows: TextureMip[] = [];
  for (let level = 0; level < mipLevels; level++) {
    const blockWidth = BigInt(format.blockWidth), blockHeight = BigInt(format.blockHeight), one = BigInt(1);
    const exactX = (BigInt(width) + blockWidth - one) / blockWidth, exactY = (BigInt(height) + blockHeight - one) / blockHeight;
    const blocksX = Number(exactX), blocksY = Number(exactY), bytes = exactX * exactY * BigInt(format.blockBytes);
    sum += bytes; rows.push({ level, width, height, blocksX, blocksY, bytes: String(bytes), totalBytes: String(bytes * multiplier) });
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
  const baseBytes = BigInt(rows[0].bytes) * multiplier, totalBytes = sum * multiplier;
  return { options: { ...options }, format, faces, mipLevels, baseBytes: String(baseBytes), mipBytes: String(totalBytes - baseBytes), textureBytes: String(sum * BigInt(options.layers) * BigInt(faces)), totalBytes: String(totalBytes), rows };
}
export function formatTextureBytes(bytes: string): string {
  if (!/^\d+$/u.test(bytes)) throw new Error("字节数无效。");
  const value = BigInt(bytes), units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  const base = BigInt(1024), hundred = BigInt(100);
  let unit = 0, divisor = BigInt(1);
  while (unit < units.length - 1 && value >= divisor * base) { unit++; divisor *= base; }
  if (!unit) return `${value} B`;
  const hundredths = (value * hundred + divisor / BigInt(2)) / divisor;
  return `${hundredths / hundred}.${String(hundredths % hundred).padStart(2, "0")} ${units[unit]}`;
}
