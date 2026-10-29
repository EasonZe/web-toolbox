import type { BpmEstimate, BpmOptions } from "./audio-bpm-options";
import { runWorkerTask } from "./worker-task";
export function estimateBpm(samples: Float32Array, sampleRate: number, options: BpmOptions, signal: AbortSignal): Promise<BpmEstimate> {
  return runWorkerTask(() => new Worker(new URL("../workers/audio-bpm.worker.ts", import.meta.url), { type: "module" }), { samples, sampleRate, options }, signal, {
    timeoutMs: 30000, timeoutMessage: "节拍分析超时，请缩短区间后重试。", loadMessage: "节拍分析引擎加载失败，请刷新后重试。", cancelMessage: "已取消分析。",
    transfer: () => [samples.buffer as ArrayBuffer],
  });
}
