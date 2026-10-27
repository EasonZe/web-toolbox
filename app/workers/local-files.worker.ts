import type { FileWorkerRequest } from "../lib/file-worker-client";
self.onmessage = async ({ data }: MessageEvent<FileWorkerRequest>) => {
  try {
    let result: unknown;
    if (data.action === "json-pointer") {
      result = (await import("../lib/json-pointer")).extractJsonPointers(data.text, data.paths);
    } else if (data.action === "pdf-page-info" || data.action === "pdf-number" || data.action === "pdf-crop") {
      const pdf = await import("../lib/pdf-page-tools"), signal = new AbortController().signal, report = (progress: number, status: string) => self.postMessage({ progress, status });
      result = data.action === "pdf-page-info" ? await pdf.inspectPdfGeometry(data.file, signal) : data.action === "pdf-number" ? await pdf.numberPdfPages(data.file, data.options, signal, report) : await pdf.cropPdfPages(data.file, data.options, signal, report);
    } else if (data.action === "pptx-extract") {
      result = await (await import("../lib/pptx-extract")).extractPptx(data.file, new AbortController().signal, (progress, status) => self.postMessage({ progress, status }));
    } else if (data.action === "image-color-replace" || data.action === "image-color-sample") {
      const image = await import("../lib/image-color-replace"), signal = new AbortController().signal;
      result = data.action === "image-color-replace" ? await image.replaceImageColor(data.file, data.options, signal) : await image.sampleImageColor(data.file, data.x, data.y, signal);
    } else if (data.action === "cron-preview") {
      result = (await import("../lib/cron-preview")).previewCron(data.options);
    } else if (data.action === "file-identify") {
      result = await (await import("../lib/file-identification")).identifyFiles(data.files, new AbortController().signal,
        (progress, status) => self.postMessage({ progress, status }));
    } else if (data.action === "image-diff") {
      result = await (await import("../lib/image-difference")).compareImageFiles(data.left, data.right, data.options, new AbortController().signal);
    } else if (data.action === "yaml-convert") {
      result = (await import("../lib/yaml-conversion")).convertYaml(data.text, data.direction, data.indent);
    } else if (data.action === "image-grid") {
      result = await (await import("../lib/image-grid")).splitImageGrid(data.file, data.options, new AbortController().signal,
        (progress, status) => self.postMessage({ progress, status }));
    } else if (data.action === "text-codec") {
      result = (await import("../lib/text-codec")).convertCodec(data.text, data.mode, data.direction);
    } else if (data.action === "text-pinyin") {
      result = (await import("../lib/text-pinyin")).convertPinyin(data.text, data.options);
    } else if (data.action === "table-convert") {
      result = (await import("../lib/table-conversion")).convertTable(data.text, data.options);
    } else if (data.action === "images-pdf") {
      result = await (await import("../lib/images-pdf")).buildImagesPdf(data.files, data.options, new AbortController().signal,
        (progress, status) => self.postMessage({ progress, status }));
    } else if (data.action === "text-diff" || data.action === "json-format") {
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
