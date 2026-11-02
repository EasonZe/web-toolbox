import { prepareImageVectorizerSource, processImageVectorizer } from "../lib/image-vectorizer";
import { isConstrainedDevice } from "../lib/resource-limits";
import type { ImageVectorizerRequest } from "../lib/image-vectorizer-client";
self.onmessage = async ({ data }: MessageEvent<ImageVectorizerRequest>) => {
  try {
    if (!data || !["preview", "process"].includes(data.action) || !(data.file instanceof Blob) || typeof data.constrained !== "boolean") throw new Error("图片描摹请求或设备预算参数无效。");
    const signal = new AbortController().signal, constrained = data.constrained || isConstrainedDevice();
    const result = data.action === "preview" ? await prepareImageVectorizerSource(data.file, signal, constrained) : await processImageVectorizer(data.file, data.options, signal, (progress, status) => self.postMessage({ progress, status }), constrained);
    self.postMessage({ result });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "图片矢量描摹失败，请更换文件重试。" }); }
};
