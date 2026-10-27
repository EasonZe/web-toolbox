import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { ConversionProgress } from "./document-engine";
import { runWorkerTask } from "./worker-task";

export function makePdf(definition: TDocumentDefinitions, signal: AbortSignal, progress: ConversionProgress): Promise<Blob> {
  return runWorkerTask(() => new Worker(new URL("../workers/document-pdf.worker.ts", import.meta.url), { type: "module" }), definition, signal, {
    loadMessage: "PDF生成引擎启动失败，请刷新后重试。", cancelMessage: "已取消",
    abortError: () => new DOMException("已取消", "AbortError"), progress: "field", report: progress,
    // The converter owns the existing 3-minute inactivity timer, reset by progress.
    mapMessage: (data) => {
      if (data.type === "progress") return { progress: data.percent, status: data.message };
      if (data.type === "error") return { error: data.message };
      if (data.type === "done" && data.blob instanceof Blob) return { result: data.blob };
      throw new Error("PDF生成引擎返回了无效消息，请重试。");
    },
  });
}
