import type { FileWorkerRequest } from "../lib/file-worker-client";
self.onmessage = async ({ data }: MessageEvent<FileWorkerRequest>) => {
  try {
    let result: unknown;
    if (data.action === "text-diff" || data.action === "json-format") {
      const { compareTexts, inspectJson } = await import("../lib/text-inspection");
      result = data.action === "text-diff" ? compareTexts(data.left, data.right) : inspectJson(data.text, data.compact);
    } else if (data.action === "zip-pack" || data.action === "zip-inspect" || data.action === "zip-extract") {
      const { packZip, inspectZip, extractZip } = await import("../lib/local-archive");
      result = data.action === "zip-pack" ? packZip(data.entries)
        : data.action === "zip-inspect" ? inspectZip(data.data) : extractZip(data.data, data.name);
    } else if (data.action === "pdf-inspect" || data.action === "pdf-build" || data.action === "pdf-split") {
      const { inspectPdf, buildPdf, splitPdf } = await import("../lib/pdf-pages");
      if (data.action === "pdf-inspect") result = await inspectPdf(data.data);
      else if (data.action === "pdf-build") result = await buildPdf(data.sources, data.choices);
      else {
        const { packZip } = await import("../lib/local-archive");
        result = packZip(await splitPdf(data.sources, data.choices));
      }
    } else throw new Error("不支持的文件操作。");
    // Hand over generated output buffers; retained input documents are not detached.
    const buffers = result instanceof Uint8Array ? [result.buffer as ArrayBuffer]
      : data.action === "zip-extract" ? Object.values(result as Record<string, Uint8Array>).map((bytes) => bytes.buffer as ArrayBuffer) : [];
    self.postMessage({ result }, [...new Set(buffers)]);
  } catch (cause) {
    self.postMessage({
      error: cause instanceof Error ? cause.message : "文件处理失败。",
    });
  }
};
