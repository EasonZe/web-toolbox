import type { AudioClip } from "./audio-editing";
import type { ChannelSource } from "./texture-tools";
import type { ImageAdjustments } from "./image-adjustments";
import { runWorkerTask } from "./worker-task";
export type RasterRequest =
  | {
      action: "normal";
      pixels: Uint8ClampedArray;
      width: number;
      height: number;
      strength: number;
      flipX: boolean;
      flipY: boolean;
      wrap: boolean;
    }
  | { action: "pack"; width: number; height: number; channels: ChannelSource[] }
  | { action: "audio"; clips: AudioClip[] }
  | { action: "adjust"; pixels: Uint8ClampedArray; width: number; height: number; settings: ImageAdjustments };
export function runRasterWorker<T>(
  request: RasterRequest,
  signal: AbortSignal,
): Promise<T> {
  return runWorkerTask<T>(() => new Worker(new URL("../workers/raster.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: 900000, timeoutMessage: "处理超时，请缩小图片或音频。",
    loadMessage: "处理引擎加载失败，请刷新后重试。", cancelMessage: "已取消处理。",
    transfer: () => {
      const buffers = request.action === "pack" ? request.channels.flatMap((channel) => channel.pixels ? [channel.pixels.buffer as ArrayBuffer] : []) : request.action === "normal" || request.action === "adjust" ? [request.pixels.buffer as ArrayBuffer] : [];
      // Raster arrays are fresh per task; audio source arrays remain editable and must not detach.
      return [...new Set(buffers)];
    },
  });
}
