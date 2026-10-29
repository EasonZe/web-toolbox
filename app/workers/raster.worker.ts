import { heightToNormal, packTextureChannels } from "../lib/texture-tools";
import { composeAudio } from "../lib/audio-editing";
import { adjustImage } from "../lib/image-adjustments";
import type { RasterRequest } from "../lib/raster-worker-client";
import { scanPixels } from "../lib/pdf-scan-pixels";
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
        data.action === "scan"
          ? scanPixels(data.pixels, data.mode, data.threshold)
          : data.action === "adjust"
          ? adjustImage(data.pixels, data.width, data.height, data.settings)
          : data.action === "normal"
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
