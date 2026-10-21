import type { AssetRequest } from "./game-asset-types";
export function runAssetWorker<T>(request: AssetRequest, signal: AbortSignal, report?: (progress: number, status: string) => void): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let finished = false;
    const worker = new Worker(new URL("../workers/game-assets.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { finished = true; worker.terminate(); signal.removeEventListener("abort", abort); clearTimeout(timer); };
    const abort = () => { if (!finished) { finish(); reject(signal.reason ?? new Error("已取消处理。")); } };
    const timer = setTimeout(() => { if (!finished) { finish(); reject(new Error("处理超时，请分批处理。")); } }, 900000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if (data.type === "progress") { report?.(data.progress, data.status); return; }
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result as T);
    };
    worker.onerror = () => { if (!finished) { finish(); reject(new Error("资源处理引擎加载失败，请刷新后重试。")); } };
    try { worker.postMessage(request); } catch (cause) { finish(); reject(cause); }
  });
}
