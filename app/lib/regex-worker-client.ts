import { toolLimits } from "./resource-limits";
import type { RegexRequest, RegexResult } from "./regex-tester";
export function runRegex(request: RegexRequest, signal: AbortSignal): Promise<RegexResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/regex.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = () => { finish(); reject(signal.reason ?? new Error("已取消测试。")); };
    const timer = setTimeout(() => { finish(); reject(new Error("表达式运行超过 5 秒，已停止。请简化嵌套量词或减少测试文本。")); }, toolLimits.regex.timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { finish(); reject(new Error("正则测试引擎加载失败，请重试。")); };
    try { worker.postMessage(request); } catch (error) { finish(); reject(error); }
  });
}
