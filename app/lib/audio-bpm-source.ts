import type * as Media from "mediabunny";
import { validateAudioFile } from "./audio-compression";
import { checkBpmDecodeBudget, validateBpmOptions, type BpmOptions } from "./audio-bpm-options";

type Loader = () => Promise<typeof Media>;
export async function readBpmSamples(file: File, options: BpmOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}, load: Loader = () => import("mediabunny")) {
  validateAudioFile(file); validateBpmOptions(options); signal.throwIfAborted();
  const media = await load(); signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS }), abort = () => input.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack(); signal.throwIfAborted();
    if (!track) throw new Error("文件中没有可分析的音轨。");
    const [sampleRate, channels, duration, decodable] = await Promise.all([track.getSampleRate(), track.getNumberOfChannels(), input.computeDuration([track]), track.canDecode()]); signal.throwIfAborted();
    if (!decodable) throw new Error("当前浏览器无法解码此音频，可先转换为 WAV 或 MP3。");
    if (!Number.isFinite(duration) || options.end > duration + 0.001 || !Number.isInteger(channels) || channels < 1 || options.channel === "second" && channels < 2) throw new Error("区间超出音频时长，或音频没有所选声道。");
    const frames = Math.ceil((options.end - options.start) * sampleRate); checkBpmDecodeBudget(sampleRate, frames, channels);
    const output = new Float32Array(frames), sink = new media.AudioSampleSink(track);
    let copied = 0;
    for await (const sample of sink.samples(options.start, options.end)) {
      try {
        signal.throwIfAborted();
        if (sample.sampleRate !== sampleRate || !Number.isFinite(sample.timestamp) || !Number.isSafeInteger(sample.numberOfFrames) || sample.numberOfFrames < 0 || sample.numberOfChannels !== channels) throw new Error("音频采样率、时间戳或声道在区间内发生变化。");
        const position = Math.round((sample.timestamp - options.start) * sampleRate), offset = Math.max(0, -position), count = Math.min(sample.numberOfFrames - offset, output.length - Math.max(0, position));
        if (!Number.isSafeInteger(position)) throw new Error("音频时间戳超出有效范围。");
        if (count <= 0) continue;
        const target = Math.max(0, position), left = new Float32Array(count);
        sample.copyTo(left, { format: "f32-planar", planeIndex: options.channel === "second" ? 1 : 0, frameOffset: offset, frameCount: count });
        if (options.channel === "mix" && sample.numberOfChannels >= 2) {
          const right = new Float32Array(count); sample.copyTo(right, { format: "f32-planar", planeIndex: 1, frameOffset: offset, frameCount: count });
          for (let i = 0; i < count; i++) left[i] = (left[i] + right[i]) / 2;
        }
        output.set(left, target); copied += count;
        report(Math.min(75, (target + count) / output.length * 75), "正在按区间解码音频…");
      } finally { sample.close(); }
    }
    signal.throwIfAborted(); if (!copied) throw new Error("所选区间没有可读取的音频采样。");
    return { samples: output, sampleRate };
  } finally { signal.removeEventListener("abort", abort); input.dispose(); }
}
