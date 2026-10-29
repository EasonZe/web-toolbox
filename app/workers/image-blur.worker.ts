import { prepareImageBlurSource, processImageBlur } from "../lib/image-blur";
import { isConstrainedDevice } from "../lib/resource-limits";
import type { ImageBlurRequest } from "../lib/image-blur-client";
self.onmessage = async ({ data }: MessageEvent<ImageBlurRequest>) => {
  try {
    if (!data || !["preview", "process"].includes(data.action) || !(data.file instanceof Blob) || typeof data.constrained !== "boolean") throw new Error("图片处理请求或设备预算参数无效。");
    const signal = new AbortController().signal, constrained = data.constrained || isConstrainedDevice();
    const result = data.action === "preview" ? await prepareImageBlurSource(data.file, signal, constrained) : await processImageBlur(data.file, data.options, signal, (progress, status) => self.postMessage({ progress, status }), constrained);
    self.postMessage({ result });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "图片模糊处理失败，请更换文件重试。" }); }
};
