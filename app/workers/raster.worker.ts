import { heightToNormal, packTextureChannels } from "../lib/texture-tools";
import { composeAudio } from "../lib/audio-editing";
import type { RasterRequest } from "../lib/raster-worker-client";
self.onmessage = ({ data }: MessageEvent<RasterRequest>) => {
  try {
    if (data.action === "audio") {
      const result = composeAudio(data.clips);
      self.postMessage(
        { result },
        { transfer: result.channels.map((channel) => channel.buffer) },
      );
    } else {
      const result =
        data.action === "normal"
          ? heightToNormal(
              data.pixels,
              data.width,
              data.height,
              data.strength,
              data.flipX,
              data.flipY,
              data.wrap,
            )
          : packTextureChannels(data.width, data.height, data.channels);
      self.postMessage({ result }, { transfer: [result.buffer] });
    }
  } catch (cause) {
    self.postMessage({
      error: cause instanceof Error ? cause.message : "处理失败。",
    });
  }
};
