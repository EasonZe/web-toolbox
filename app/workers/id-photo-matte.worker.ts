import { env, pipeline, type BackgroundRemovalPipeline } from "@huggingface/transformers";
env.backends.onnx.wasm!.numThreads = 1;
// Limit TypeScript's task-map expansion to the one documented pipeline used here.
const createPortraitPipeline = pipeline as unknown as (task: "background-removal", model: string, options: { dtype: "fp32"; device: "wasm"; revision: string; progress_callback: (info: { status: string; progress?: number }) => void }) => Promise<BackgroundRemovalPipeline>;
self.onmessage = async ({ data }: MessageEvent<{ image: Blob }>) => {
  let engine: BackgroundRemovalPipeline | undefined;
  try {
    if (!(data.image instanceof Blob) || data.image.type !== "image/png") throw new Error("无效的人像输入。");
    self.postMessage({ progress: 1, status: "正在从 Hugging Face 下载 / 读取缓存的人像模型，照片不上传…" });
    engine = await createPortraitPipeline("background-removal", "Xenova/modnet", { dtype: "fp32", device: "wasm", revision: "fa2fa546052fba4c08921230a26cc69a333fca12", progress_callback(info) {
      if (info.status === "progress") self.postMessage({ progress: Math.min(45, (info.progress ?? 0) * 0.45), status: "正在下载人像模型（首次约 26 MB）…" });
    } });
    self.postMessage({ progress: 55, status: "正在本地计算人像透明区域…" });
    const [result] = await engine(data.image); if (!result) throw new Error("模型未返回透明人像。");
    self.postMessage({ result: await result.toBlob("image/png") });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "人像抠图失败。" }); }
  finally { await engine?.dispose(); }
};
