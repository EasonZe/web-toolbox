import type { ScienceRequest, ScienceResult, ScienceWorkerResponse } from "./scientific-types";

export function runScientificCalculation(request: ScienceRequest, signal: AbortSignal): Promise<ScienceResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/scientific-computing.worker.ts", import.meta.url), { type: "module" });
    const close = () => { worker.terminate(); clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { close(); reject(new DOMException("已取消", "AbortError")); };
    const timer = setTimeout(() => { close(); reject(new Error("计算超时，已停止。请简化公式后重试。")); }, 20000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<ScienceWorkerResponse>) => {
      close();
      if ("error" in data) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => { close(); reject(new Error("计算引擎加载失败，请刷新页面后重试。")); };
    try { worker.postMessage(request); } catch (error) { close(); reject(error); }
  });
}
