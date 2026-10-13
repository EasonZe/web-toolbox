import type { AudioClip } from "./audio-editing";
import type { ChannelSource } from "./texture-tools";
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
  | { action: "audio"; clips: AudioClip[] };
export function runRasterWorker<T>(
  request: RasterRequest,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/raster.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const abort = () => {
      finish();
      reject(signal.reason ?? new Error("已取消处理。"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("处理超时，请缩小图片或音频。"));
    }, 120000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("处理引擎加载失败，请刷新后重试。"));
    };
    try {
      worker.postMessage(request);
    } catch (cause) {
      finish();
      reject(cause);
    }
  });
}
