import type { GifEditOptions, GifEditResult } from "./gif-edit-options";
import { runWorkerTask } from "./worker-task";
export function runGifEdit(options: GifEditOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}) {
  return runWorkerTask<GifEditResult>(() => new Worker(new URL("../workers/gif-edit.worker.ts", import.meta.url), { type: "module" }), options, signal, {
    timeoutMs: 900000, timeoutMessage: "GIF 编辑超时，请减少帧数。", loadMessage: "GIF 编辑引擎加载失败，请刷新重试。", cancelMessage: "已取消 GIF 编辑。", progress: "field", report,
  });
}
