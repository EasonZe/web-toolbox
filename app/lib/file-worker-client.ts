import type { CodecMode, PinyinOptions, ImagePdfOptions } from "./extra-tool-options";
import type { TableOptions } from "./table-conversion";
import type { YamlDirection } from "./yaml-conversion";
import type { GridSplitOptions } from "./image-grid-options";
import type { CronOptions, ImageDiffOptions } from "./practical-tool-options";
import type { PdfNumberOptions, PdfCropOptions } from "./pdf-page-options";
import type { ColorReplaceOptions } from "./image-color-replace";
import { runWorkerTask } from "./worker-task";
export type FileWorkerRequest =
  | { action: "json-pointer"; text: string; paths: string }
  | { action: "pdf-page-info"; file: File }
  | { action: "pdf-number"; file: File; options: PdfNumberOptions }
  | { action: "pdf-crop"; file: File; options: PdfCropOptions }
  | { action: "pptx-extract"; file: File }
  | { action: "image-color-replace"; file: File; options: ColorReplaceOptions }
  | { action: "image-color-sample"; file: File; x: number; y: number }
  | { action: "cron-preview"; options: CronOptions }
  | { action: "file-identify"; files: File[] }
  | { action: "image-diff"; left: File; right: File; options: ImageDiffOptions }
  | { action: "yaml-convert"; text: string; direction: YamlDirection; indent: number }
  | { action: "image-grid"; file: File; options: GridSplitOptions }
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
  return runWorkerTask<T>(() => new Worker(new URL("../workers/local-files.worker.ts", import.meta.url), { type: "module" }), request, signal, {
    timeoutMs: request.action === "json-pointer" ? 30000 : 900000, timeoutMessage: "处理超时，请减少文件或页数。",
    loadMessage: "文件处理引擎加载失败，请刷新后重试。", cancelMessage: "已取消",
    progress: "field", report,
  });
}
