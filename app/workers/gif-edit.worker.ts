import { editGifFrames } from "../lib/gif-edit";
import type { GifEditOptions } from "../lib/gif-edit-options";
self.onmessage = async ({ data }: MessageEvent<GifEditOptions>) => {
  try {
    const result = await editGifFrames(data, new AbortController().signal, (progress, status) => self.postMessage({ progress, status }));
    self.postMessage({ result });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "GIF 编辑失败。" }); }
};
