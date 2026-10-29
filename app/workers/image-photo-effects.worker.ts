import { preparePhotoEffectSource, processPhotoEffect } from "../lib/image-photo-effects";
import type { PhotoEffectRequest } from "../lib/image-photo-effects-client";
import { isConstrainedDevice } from "../lib/resource-limits";
self.onmessage = async ({ data }: MessageEvent<PhotoEffectRequest>) => {
  try {
    if (!data || !["preview", "process"].includes(data.action) || !(data.file instanceof Blob) || typeof data.constrained !== "boolean") throw new Error("图片处理请求或设备预算参数无效。");
    const signal = new AbortController().signal;
    const constrained = data.constrained || isConstrainedDevice();
    const result = data.action === "preview" ? await preparePhotoEffectSource(data.file, data.kind, signal, constrained) : await processPhotoEffect(data.file, data.options, signal, (progress, status) => self.postMessage({ progress, status }), constrained);
    self.postMessage({ result });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "图片处理失败，请更换文件重试。" }); }
};
