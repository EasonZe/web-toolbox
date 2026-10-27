import type { AssetRequest } from "./game-asset-types";
import { runWorkerTask } from "./worker-task";
export function runAssetWorker<T>(request: AssetRequest, signal: AbortSignal, report?: (progress: number, status: string) => void): Promise<T> {
  return runWorkerTask<T>(() => new Worker(new URL("../workers/game-assets.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: 900000, timeoutMessage: "处理超时，请分批处理。",
    loadMessage: "资源处理引擎加载失败，请刷新后重试。", cancelMessage: "已取消处理。",
    progress: "tagged", report,
  });
}
