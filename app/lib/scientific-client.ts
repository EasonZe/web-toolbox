import type { ScienceRequest, ScienceResult } from "./scientific-types";
import { runWorkerTask } from "./worker-task";

export function runScientificCalculation(request: ScienceRequest, signal: AbortSignal): Promise<ScienceResult> {
  return runWorkerTask(() => new Worker(new URL("../workers/scientific-computing.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: 20000, timeoutMessage: "计算超时，已停止。请简化公式后重试。",
    loadMessage: "计算引擎加载失败，请刷新页面后重试。", cancelMessage: "已取消",
    abortError: () => new DOMException("已取消", "AbortError"),
  });
}
