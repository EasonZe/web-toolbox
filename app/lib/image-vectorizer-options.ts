export type ImageVectorizerOptions = { edge: 512 | 1024 | 2048; colors: number; fitting: number; speckles: number; background: "transparent" | "white" };
export const defaultImageVectorizer: ImageVectorizerOptions = { edge: 512, colors: 12, fitting: 1, speckles: 8, background: "transparent" };
export const vectorizerLimits = { bytes: 8 * 1024 * 1024, paths: 20000, segments: 300000, timeoutMs: 120000 } as const;
export function validateImageVectorizer(options: ImageVectorizerOptions) {
  if (!options || ![512, 1024, 2048].includes(options.edge) || !Number.isInteger(options.colors) || options.colors < 2 || options.colors > 32 || !Number.isFinite(options.fitting) || options.fitting < 0.1 || options.fitting > 5 || !Number.isInteger(options.speckles) || options.speckles < 0 || options.speckles > 64 || !["transparent", "white"].includes(options.background)) throw new Error("请检查处理尺寸、颜色数量、线条拟合与小斑点过滤参数。");
}
export function vectorizerDimensions(width: number, height: number, edge: number) {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0) || ![512, 1024, 2048].includes(edge)) throw new Error("图片尺寸或处理最长边无效。");
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
