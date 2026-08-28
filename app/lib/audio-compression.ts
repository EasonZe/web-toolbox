import type { Conversion } from "mediabunny";

export type AudioFormat = "mp3" | "m4a" | "ogg";
export type AudioSettings = {
  format: AudioFormat;
  bitrate: number;
  sampleRate: number;
  channels: "original" | "mono" | "stereo";
};
export type AudioInfo = { duration: number; sampleRate: number; channels: number };
export const audioBitrates = [32, 48, 64, 96, 128, 160, 192, 256, 320];
export const defaultAudioSettings: AudioSettings = {
  format: "mp3", bitrate: 128, sampleRate: 44100, channels: "original",
};

export function validateAudioFile(file: File) {
  if (!file.size) throw new Error("文件为空，请重新选择音频。");
  if (file.size > 500 * 1024 * 1024) throw new Error("文件不能超过500 MB。");
  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac)$/i.test(file.name)) {
    throw new Error("请选择MP3、WAV、M4A、AAC、FLAC、OGG或WebM音频文件。");
  }
}

export function estimateAudioBytes(duration: number, bitrate: number) {
  return Number.isFinite(duration) && duration > 0 ? Math.ceil(duration * bitrate * 1000 / 8) : 0;
}

export function getAudioEncoding(settings: AudioSettings, sourceChannels: number) {
  if (!["mp3", "m4a", "ogg"].includes(settings.format) || !audioBitrates.includes(settings.bitrate)
    || ![32000, 44100, 48000].includes(settings.sampleRate)
    || !["original", "mono", "stereo"].includes(settings.channels)) {
    throw new Error("压缩参数无效，请恢复默认设置后重试。");
  }
  return {
    codec: settings.format === "mp3" ? "mp3" as const : settings.format === "m4a" ? "aac" as const : "opus" as const,
    bitrate: settings.bitrate * 1000,
    sampleRate: settings.format === "ogg" ? 48000 : settings.sampleRate,
    numberOfChannels: settings.channels === "mono" ? 1 : settings.channels === "stereo" ? 2 : Math.min(2, Math.max(1, sourceChannels)),
  };
}

export function compressedAudioName(name: string, format: AudioFormat) {
  return `${name.replace(/\.[^.]+$/, "") || "audio"}-compressed.${format}`;
}

export async function readAudioInfo(file: File, signal: AbortSignal): Promise<AudioInfo> {
  validateAudioFile(file);
  signal.throwIfAborted();
  const media = await import("mediabunny");
  signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  const abort = () => input.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    signal.throwIfAborted();
    if (!track) throw new Error("没有找到音轨，请确认文件是有效音频。");
    const [duration, sampleRate, channels, decodable] = await Promise.all([
      input.computeDuration([track]), track.getSampleRate(), track.getNumberOfChannels(), track.canDecode(),
    ]);
    signal.throwIfAborted();
    if (!decodable) throw new Error("当前浏览器无法解码该音频，请尝试MP3或WAV文件。");
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取音频时长，文件可能已损坏。");
    return { duration, sampleRate, channels };
  } finally {
    signal.removeEventListener("abort", abort);
    input.dispose();
  }
}

let mp3Registration: Promise<void> | undefined;

export async function compressAudio(
  file: File,
  settings: AudioSettings,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  validateAudioFile(file);
  signal.throwIfAborted();
  const media = await import("mediabunny");
  signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  let conversion: Conversion | undefined;
  let cancellation: Promise<void> | undefined;
  const abort = () => {
    if (conversion) cancellation ??= conversion.cancel().catch(() => {});
    else input.dispose();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    signal.throwIfAborted();
    if (!track) throw new Error("没有找到可压缩的音轨。");
    const config = getAudioEncoding(settings, await track.getNumberOfChannels());
    signal.throwIfAborted();
    if (settings.format === "mp3" && !(await media.canEncodeAudio("mp3", config))) {
      mp3Registration ??= import("@mediabunny/mp3-encoder")
        .then(({ registerMp3Encoder }) => { registerMp3Encoder(); })
        .catch((error) => { mp3Registration = undefined; throw error; });
      await mp3Registration;
    }
    signal.throwIfAborted();
    if (!(await media.canEncodeAudio(config.codec, config))) {
      throw new Error(`当前浏览器不支持${settings.format.toUpperCase()}编码，请改用MP3。`);
    }
    signal.throwIfAborted();
    const target = new media.BufferTarget();
    const output = new media.Output({ target, format: settings.format === "mp3" ? new media.Mp3OutputFormat()
      : settings.format === "m4a" ? new media.Mp4OutputFormat() : new media.OggOutputFormat() });
    conversion = await media.Conversion.init({
      input, output, tracks: "primary", video: { discard: true },
      audio: { ...config, forceTranscode: true }, showWarnings: false,
    });
    signal.throwIfAborted();
    if (!conversion.isValid) throw new Error("当前浏览器无法处理这个音频，请尝试MP3或其他源文件。");
    conversion.onProgress = (value) => {
      if (!signal.aborted) onProgress(Math.min(99, Math.max(0, Math.round(value * 100))));
    };
    await conversion.execute();
    signal.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error("压缩结果为空，请更换参数后重试。");
    return new Blob([target.buffer], { type: { mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg" }[settings.format] });
  } finally {
    signal.removeEventListener("abort", abort);
    // Also cancel a conversion that finished initializing after the request was aborted.
    if (conversion && conversion.state !== "done") cancellation ??= conversion.cancel().catch(() => {});
    await cancellation;
    input.dispose();
  }
}
