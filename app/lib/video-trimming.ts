import { createVideoConversionPlan, validateVideoConversionFile, videoOutputProfiles } from "./video-conversion";
import { createMediaBlobTarget } from "./media-blob-target";
import type { VideoTrimOptions } from "./practical-tool-options";
type MediaLoader = () => Promise<typeof import("mediabunny")>;
export type VideoTrimInfo = { duration: number; start: number; width: number; height: number; frameRate: number; hasAudio: boolean; canDecode: boolean };
export function validateTrimRange(start: number, end: number, duration: number) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0 || start < 0 || end <= start || end > duration) throw new Error("请设置有效裁剪区间：0 ≤ 开始 < 结束 ≤ 视频时长。");
  return end - start;
}
async function open(file: File, signal: AbortSignal, load: MediaLoader) {
  const error = validateVideoConversionFile(file); if (error) throw new Error(error);
  signal.throwIfAborted(); const media = await load(); signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  let closed = false;
  const close = () => { if (!closed) { closed = true; input.dispose(); } signal.removeEventListener("abort", close); };
  signal.addEventListener("abort", close, { once: true });
  try {
    const video = await input.getPrimaryVideoTrack(); signal.throwIfAborted(); if (!video) throw new Error("文件中没有视频轨道。");
    const [first, end, width, height, canDecode, stats, audio] = await Promise.all([video.getFirstTimestamp(), video.computeDuration(), video.getDisplayWidth(), video.getDisplayHeight(), video.canDecode(), video.computePacketStats(120), input.getPrimaryAudioTrack()]);
    signal.throwIfAborted(); const start = Math.max(0, first), duration = end - start;
    if (![first, end, width, height].every(Number.isFinite) || duration <= 0 || width <= 0 || height <= 0) throw new Error("无法读取有效的视频时长与尺寸。");
    const frameRate = Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0 ? stats.averagePacketRate : 30;
    return { media, input, video, audio, info: { duration, start, width, height, frameRate, hasAudio: !!audio, canDecode } satisfies VideoTrimInfo, close };
  } catch (cause) { close(); throw cause; }
}
export async function inspectTrimVideo(file: File, signal: AbortSignal, load: MediaLoader = () => import("mediabunny")): Promise<VideoTrimInfo> {
  const session = await open(file, signal, load); try { return session.info; } finally { session.close(); }
}
export async function trimVideo(file: File, options: VideoTrimOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}, load: MediaLoader = () => import("mediabunny")) {
  if (!["mp4", "webm"].includes(options.format) || !["original", "2160", "1080", "720", "480"].includes(options.resolution) || !Number.isFinite(options.quality) || options.quality < 20 || options.quality > 100) throw new Error("输出格式、尺寸或画质设置无效。");
  const session = await open(file, signal, load);
  let store: ReturnType<typeof createMediaBlobTarget> | undefined, conversion: Awaited<ReturnType<typeof session.media.Conversion.init>> | undefined, output: InstanceType<typeof session.media.Output> | undefined;
  const cancel = () => { void conversion?.cancel().catch(() => {}); }; signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted(); const duration = validateTrimRange(options.start, options.end, session.info.duration);
    if (!session.info.canDecode) throw new Error("当前浏览器无法解码此视频，请先更换格式或浏览器。");
    const profile = videoOutputProfiles[options.format];
    const plan = createVideoConversionPlan({ sourceWidth: session.info.width, sourceHeight: session.info.height, sourceFrameRate: session.info.frameRate, duration, resolution: options.resolution, frameRate: "original", quality: options.quality, keepAudio: options.keepAudio, hasAudio: session.info.hasAudio });
    const codec = await session.media.getFirstEncodableVideoCodec([...profile.videoCodecs], { width: plan.width, height: plan.height, bitrate: plan.videoBitrate }); signal.throwIfAborted();
    if (!codec) throw new Error(`此浏览器无法编码 ${profile.label}，请尝试另一输出格式。`);
    if (options.keepAudio && session.audio) {
      if (!(await session.audio.canDecode())) throw new Error("原音轨无法解码，请关闭保留声音或更换视频。");
      if (!(await session.media.canEncodeAudio(profile.audioCodec, { numberOfChannels: 2, sampleRate: 48000, bitrate: plan.audioBitrate }))) throw new Error("此浏览器无法编码声音，请更换输出格式或关闭保留声音。");
    }
    signal.throwIfAborted(); store = createMediaBlobTarget(session.media.StreamTarget);
    output = new session.media.Output({ target: store.target, format: options.format === "mp4" ? new session.media.Mp4OutputFormat({ fastStart: false }) : new session.media.WebMOutputFormat() });
    report(3, "正在准备裁剪与编码…");
    conversion = await session.media.Conversion.init({ input: session.input, output, tracks: "primary", trim: { start: session.info.start + options.start, end: session.info.start + options.end },
      video: { codec, width: plan.width, height: plan.height, fit: "contain", bitrate: plan.videoBitrate, forceTranscode: true },
      audio: options.keepAudio && session.audio ? { codec: profile.audioCodec, numberOfChannels: 2, sampleRate: 48000, bitrate: plan.audioBitrate, forceTranscode: true } : { discard: true },
      tags: {}, showWarnings: false });
    signal.throwIfAborted();
    if (!conversion.isValid || !conversion.utilizedTracks.includes(session.video)) throw new Error("视频轨道未能转换，请检查浏览器解码与编码支持。");
    if (options.keepAudio && session.audio && !conversion.utilizedTracks.includes(session.audio)) throw new Error("音轨未能转换，已停止导出，避免无提示丢失声音。");
    conversion.onProgress = (progress) => { if (!signal.aborted) report(Math.min(99, Math.max(3, progress * 100)), "正在裁剪与编码…"); };
    await conversion.execute(); signal.throwIfAborted();
    if (!store.size) throw new Error("没有生成有效的视频片段。");
    return { blob: store.blob(profile.mimeType), duration, width: plan.width, height: plan.height, extension: options.format };
  } finally {
    signal.removeEventListener("abort", cancel);
    if (conversion) await conversion.cancel().catch(() => {}); else if (output) await output.cancel().catch(() => {});
    session.close(); store?.clear();
  }
}
