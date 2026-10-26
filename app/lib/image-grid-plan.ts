import { toolLimits } from "./resource-limits";
import type { GridSplitOptions } from "./image-grid-options";
export function gridSplitPlan(width: number, height: number, options: GridSplitOptions) {
  const { rows, columns, mode, format, quality } = options;
  if (![width, height].every((v) => Number.isSafeInteger(v) && v > 0) || width * height > toolLimits.image.pixels) throw new Error("图片尺寸无效或超过 1 亿像素。");
  if (![rows, columns].every((v) => Number.isInteger(v) && v >= 1 && v <= toolLimits.gridSplit.edge) || rows * columns > toolLimits.gridSplit.tiles) throw new Error("行列各为 1–20，最多切分 200 张。");
  if (!["original", "square-crop", "square-pad"].includes(mode) || !["png", "jpeg"].includes(format) || !Number.isFinite(quality) || quality < 0.5 || quality > 1) throw new Error("切分选项无效。");
  const edge = mode === "square-crop" ? Math.min(width, height) : Math.max(width, height);
  const workWidth = mode === "original" ? width : edge, workHeight = mode === "original" ? height : edge;
  if (workWidth < columns || workHeight < rows) throw new Error("网格数量超过图片像素，无法生成非空图片。");
  const offsetX = Math.floor((workWidth - width) / 2), offsetY = Math.floor((workHeight - height) / 2);
  const tiles = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns;
    const x = Math.floor(column * workWidth / columns), y = Math.floor(row * workHeight / rows);
    const tileWidth = Math.floor((column + 1) * workWidth / columns) - x, tileHeight = Math.floor((row + 1) * workHeight / rows) - y;
    if (tileWidth > toolLimits.raster.edge || tileHeight > toolLimits.raster.edge) throw new Error("单格尺寸超过 8192px，请增加行列或先缩小图片。");
    return { row: row + 1, column: column + 1, x, y, width: tileWidth, height: tileHeight, name: `r${String(row + 1).padStart(2, "0")}-c${String(column + 1).padStart(2, "0")}.${format === "png" ? "png" : "jpg"}` };
  });
  return { width: workWidth, height: workHeight, offsetX, offsetY, tiles };
}
