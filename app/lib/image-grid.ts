import { loadRaster } from "./local-images";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
import { LocalZipWriter } from "./local-zip-writer";
import type { GridSplitOptions } from "./image-grid-options";
import { gridSplitPlan } from "./image-grid-plan";
export async function splitImageGrid(file: File, options: GridSplitOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}) {
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台画布，请使用新版浏览器。");
  const bitmap = await loadRaster(file, signal);
  const zip = new LocalZipWriter(toolLimits.archive.expandedBytes / (isConstrainedDevice() ? 2 : 1));
  let canvas: OffscreenCanvas | undefined;
  try {
    const plan = gridSplitPlan(bitmap.width, bitmap.height, options);
    for (let i = 0; i < plan.tiles.length; i++) {
      signal.throwIfAborted(); const tile = plan.tiles[i];
      checkRasterWork(bitmap.width, bitmap.height, 1 + 2 * tile.width * tile.height / (bitmap.width * bitmap.height));
      canvas = new OffscreenCanvas(tile.width, tile.height); const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建图片画布。");
      if (options.format === "jpeg") { context.fillStyle = "white"; context.fillRect(0, 0, tile.width, tile.height); }
      context.drawImage(bitmap, plan.offsetX - tile.x, plan.offsetY - tile.y);
      const blob = await canvas.convertToBlob({ type: `image/${options.format}`, quality: options.quality });
      if (blob.type !== `image/${options.format}`) throw new Error("浏览器不支持所选图片格式。");
      await zip.add(tile.name, blob, signal); canvas.width = canvas.height = 0;
      report((i + 1) / plan.tiles.length * 95, `正在切分 ${i + 1} / ${plan.tiles.length} 张`);
    }
    await zip.add("grid.json", new Blob([JSON.stringify({ sourceWidth: bitmap.width, sourceHeight: bitmap.height, mode: options.mode, ...plan }, null, 2)], { type: "application/json" }), signal);
    signal.throwIfAborted(); return zip.finish();
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; zip.dispose(); }
}
