import type { CodecMode, PinyinOptions, ImagePdfOptions } from "./extra-tool-options";
import type { TableOptions } from "./table-conversion";
export type FileWorkerRequest =
  | { action: "text-codec"; text: string; mode: CodecMode; direction: "encode" | "decode" }
  | { action: "text-pinyin"; text: string; options: PinyinOptions }
  | { action: "table-convert"; text: string; options: TableOptions }
  | { action: "images-pdf"; files: File[]; options: ImagePdfOptions }
  | { action: "text-diff"; left: string; right: string }
  | { action: "json-format"; text: string; compact: boolean }
  | { action: "zip-pack"; entries: { name: string; data: Uint8Array }[] }
  | { action: "zip-inspect"; data: Uint8Array }
  | { action: "zip-extract"; data: Uint8Array; name?: string }
  | { action: "pdf-inspect"; data: Uint8Array }
  | {
      action: "pdf-build";
      sources: Uint8Array[];
      choices: { source: number; page: number; rotation: number }[];
    }
  | {
      action: "pdf-split";
      sources: Uint8Array[];
      choices: { source: number; page: number; rotation: number }[];
    };
export function runFileWorker<T>(
  request: FileWorkerRequest,
  signal: AbortSignal,
  report?: (value: number, text: string) => void,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/local-files.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const abort = () => {
      finish();
      reject(signal.reason ?? new Error("已取消"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("处理超时，请减少文件或页数。"));
    }, 900000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (typeof data.progress === "number") { report?.(data.progress, data.status ?? "正在处理…"); return; }
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result as T);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("文件处理引擎加载失败，请刷新后重试。"));
    };
    try {
      worker.postMessage(request);
    } catch (cause) {
      finish();
      reject(cause);
    }
  });
}
