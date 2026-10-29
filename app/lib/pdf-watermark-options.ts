export type PdfWatermarkOptions = {
  text: string; range: string; layout: "single" | "grid" | "staggered";
  size: number; angle: number; opacity: number; color: string;
  x: number; y: number; gapX: number; gapY: number;
};
export const defaultPdfWatermark: PdfWatermarkOptions = {
  text: "仅供预览", range: "", layout: "single", size: 32, angle: 35,
  opacity: 20, color: "#64748b", x: 50, y: 50, gapX: 20, gapY: 20,
};
export function validatePdfWatermark(options: PdfWatermarkOptions) {
  if (typeof options.text !== "string" || !options.text.trim() || options.text.length > 120 || /[\u0000-\u001f\u007f]/.test(options.text)) throw new Error("水印须为非空单行文字，最多 120 字符。");
  if (typeof options.range !== "string" || options.range.length > 10000 || !["single", "grid", "staggered"].includes(options.layout)) throw new Error("页码范围或水印排列方式无效。");
  for (const [value, min, max] of [[options.size, 8, 120], [options.angle, -90, 90], [options.opacity, 0, 100], [options.x, 0, 100], [options.y, 0, 100], [options.gapX, 0, 200], [options.gapY, 0, 200]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("水印字号、角度、不透明度、位置或间隔超出范围。");
  }
  if (!/^#[\da-f]{6}$/i.test(options.color)) throw new Error("请选择有效的六位十六进制水印颜色。");
}

/** Display-space centers; fit the complete rotated text inside the visible page. */
export function planPdfWatermarks(width: number, height: number, textWidth: number, textHeight: number, options: PdfWatermarkOptions) {
  validatePdfWatermark(options);
  if (![width, height, textWidth, textHeight].every((n) => Number.isFinite(n) && n > 0)) throw new Error("页面或水印尺寸无效。");
  const angle = options.angle * Math.PI / 180;
  const boxWidth = Math.abs(textWidth * Math.cos(angle)) + Math.abs(textHeight * Math.sin(angle));
  const boxHeight = Math.abs(textWidth * Math.sin(angle)) + Math.abs(textHeight * Math.cos(angle));
  if (boxWidth > width || boxHeight > height) throw new Error("当前页面放不下完整水印，请减小字号或调整角度。");
  if (options.layout === "single") return [{ x: boxWidth / 2 + (width - boxWidth) * options.x / 100, y: boxHeight / 2 + (height - boxHeight) * options.y / 100 }];
  const gapX = options.gapX * 72 / 25.4, gapY = options.gapY * 72 / 25.4;
  const columns = Math.max(1, Math.floor((width + gapX) / (boxWidth + gapX))), rows = Math.max(1, Math.floor((height + gapY) / (boxHeight + gapY)));
  if (columns * rows > 500) throw new Error("水印过于密集（每页最多 500 个），请增大字号或间隔。");
  const result: { x: number; y: number }[] = [], stepX = boxWidth + gapX, stepY = boxHeight + gapY;
  for (let row = 0; row < rows; row++) {
    const shifted = options.layout === "staggered" && row % 2 === 1 && columns > 1, count = shifted ? columns - 1 : columns;
    const start = (width - (count - 1) * stepX) / 2;
    for (let column = 0; column < count; column++) result.push({ x: start + column * stepX, y: (height - (rows - 1) * stepY) / 2 + row * stepY });
  }
  return result;
}

/** Offset of the baseline from the visual center, using ascent and descent. */
export function watermarkBaseline(x: number, y: number, width: number, ascent: number, height: number, angle: number) {
  const radians = angle * Math.PI / 180, middle = ascent - height / 2;
  return { u: x - Math.cos(radians) * width / 2 + Math.sin(radians) * middle, v: y + Math.sin(radians) * width / 2 + Math.cos(radians) * middle };
}
