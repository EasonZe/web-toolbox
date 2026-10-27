import { toolLimits } from "./resource-limits";
import type { RegexRequest, RegexResult } from "./regex-tester";
import { runWorkerTask } from "./worker-task";
export function runRegex(request: RegexRequest, signal: AbortSignal): Promise<RegexResult> {
  return runWorkerTask(() => new Worker(new URL("../workers/regex.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: toolLimits.regex.timeoutMs, timeoutMessage: "表达式运行超过 5 秒，已停止。请简化嵌套量词或减少测试文本。",
    loadMessage: "正则测试引擎加载失败，请重试。", cancelMessage: "已取消测试。",
  });
}
