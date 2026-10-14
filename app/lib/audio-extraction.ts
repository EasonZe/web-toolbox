import type { Conversion } from "mediabunny";
import { createMediaBlobTarget } from "./media-blob-target";
/** Decode and encode incrementally; never read the whole video into an ArrayBuffer. */
export async function extractAudioWave(file: File, sampleRate: number, mono: boolean, signal: AbortSignal, report: (value: number) => void) {
  signal.throwIfAborted();
  const media = await import("mediabunny");
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  let conversion: Conversion | undefined;
  const abort = () => { if (conversion) void conversion.cancel().catch(() => {}); else input.dispose(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    signal.throwIfAborted();
    if (!track || !await track.canDecode()) throw new Error("没有可解码的音轨，请更换文件或浏览器。");
    const channels = mono ? 1 : Math.min(2, await track.getNumberOfChannels());
    const duration = await input.computeDuration();
    const store = createMediaBlobTarget(media.StreamTarget);
    const output = new media.Output({ target: store.target, format: new media.WavOutputFormat() });
    conversion = await media.Conversion.init({ input, output, tracks: "primary", video: { discard: true }, audio: { codec: "pcm-s16", sampleRate, numberOfChannels: channels, forceTranscode: true }, showWarnings: false });
    signal.throwIfAborted();
    if (!conversion.isValid) throw new Error("当前浏览器无法提取该视频中的音轨。");
    conversion.onProgress = (value) => { if (!signal.aborted) report(Math.round(value * 99)); };
    await conversion.execute();
    signal.throwIfAborted();
    if (!store.size) throw new Error("提取结果为空。");
    return { blob: store.blob("audio/wav"), duration, sampleRate, channels };
  } finally { signal.removeEventListener("abort", abort); input.dispose(); }
}
