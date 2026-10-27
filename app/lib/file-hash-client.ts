import { hashAlgorithms, type HashAlgorithm, type HashResults } from "./file-hash";
import { runWorkerTask } from "./worker-task";

const digestLengths: Record<HashAlgorithm, number> = { MD5: 32, "SHA-1": 40, "SHA-256": 64, "SHA-512": 128 };
export function runFileHash(file: File, algorithms: HashAlgorithm[], signal: AbortSignal, report: (progress: number, status: string) => void): Promise<HashResults> {
  return runWorkerTask(() => new Worker(new URL("../workers/file-hash.worker.ts", import.meta.url), { type: "module" }), { file, algorithms }, signal, {
    loadMessage: "计算组件加载失败，请刷新页面后重试。", cancelMessage: "已取消计算。",
    messageError: "无法读取计算结果，请重新计算。", progress: "field", report,
    // Streaming large files intentionally has no new fixed timeout or whole-file read.
    mapMessage: (data) => {
      if (data.type === "error") return { error: data.message };
      if (data.type === "progress") {
        const { loaded, total } = data;
        if (typeof loaded !== "number" || typeof total !== "number" || !Number.isFinite(loaded) || !Number.isFinite(total) || total !== file.size || loaded < 0 || loaded > total) throw new Error("文件哈希进度消息无效，请重新计算。");
        return { progress: total ? Math.floor(loaded / total * 100) : 0, status: "正在计算…" };
      }
      if (data.type === "done" && data.results && typeof data.results === "object" && !Array.isArray(data.results)) {
        const results = data.results as Record<string, unknown>;
        if (!algorithms.length || algorithms.some((key) => !hashAlgorithms.includes(key) || typeof results[key] !== "string" || !(new RegExp(`^[a-f\\d]{${digestLengths[key]}}$`, "i")).test(results[key] as string))) throw new Error("文件哈希结果不完整，请重新计算。");
        return { result: results };
      }
      throw new Error("文件哈希引擎返回了无效消息，请重新计算。");
    },
  });
}
