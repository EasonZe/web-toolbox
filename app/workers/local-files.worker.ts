import { inspectZip, extractZip, packZip } from "../lib/local-archive";
import { inspectPdf, buildPdf } from "../lib/pdf-pages";
import { compareTexts, inspectJson } from "../lib/text-inspection";
import type { FileWorkerRequest } from "../lib/file-worker-client";
self.onmessage = async ({ data }: MessageEvent<FileWorkerRequest>) => {
  try {
    let result: unknown;
    if (data.action === "text-diff") result = compareTexts(data.left, data.right);
    else if (data.action === "json-format") result = inspectJson(data.text, data.compact);
    else if (data.action === "zip-pack") result = packZip(data.entries);
    else if (data.action === "zip-inspect") result = inspectZip(data.data);
    else if (data.action === "zip-extract")
      result = extractZip(data.data, data.name);
    else if (data.action === "pdf-inspect")
      result = await inspectPdf(data.data);
    else if (data.action === "pdf-build")
      result = await buildPdf(data.sources, data.choices);
    else if (data.action === "pdf-split") {
      const entries = [];
      for (let i = 0; i < data.choices.length; i++)
        entries.push({
          name: `page-${String(i + 1).padStart(3, "0")}.pdf`,
          data: await buildPdf(data.sources, [data.choices[i]]),
        });
      result = packZip(entries);
    } else throw new Error("不支持的文件操作。");
    self.postMessage({ result });
  } catch (cause) {
    self.postMessage({
      error: cause instanceof Error ? cause.message : "文件处理失败。",
    });
  }
};
