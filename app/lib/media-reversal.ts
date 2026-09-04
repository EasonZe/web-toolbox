export const MAX_AUDIO_REVERSE_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_REVERSE_BYTES = 500 * 1024 * 1024;

type FileLike = { name: string; size: number; type?: string };

export function validateAudioReverseFile(file: FileLike) {
  const supported =
    file.type?.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac)$/i.test(file.name);
  if (!supported) return "请选择常见的音频文件";
  if (file.size > MAX_AUDIO_REVERSE_BYTES) return "音频文件不能超过500 MB";
  return "";
}

export function validateVideoReverseFile(file: FileLike) {
  const supported =
    file.type?.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|mkv|avi|ogv|mpeg|mpg|ts|mts|m2ts)$/i.test(file.name);
  if (!supported) return "请选择常见的视频文件";
  if (file.size > MAX_VIDEO_REVERSE_BYTES) return "视频文件不能超过500 MB";
  return "";
}

export function createReversedName(name: string, kind: "audio" | "video") {
  const base = name.replace(/\.[^.]+$/, "") || `reversed-${kind}`;
  return `${base}-reversed.${kind === "audio" ? "wav" : "webm"}`;
}

export function formatMediaDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatMediaSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function createReverseFrameTimes(duration: number, frameRate: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const fps = Math.max(1, Math.min(30, Math.round(frameRate)));
  const count = Math.max(1, Math.ceil(duration * fps));
  return Array.from({ length: count }, (_, index) => ({
    sourceTime: Math.max(0, duration - (index + 0.5) / fps),
    outputTime: index / fps,
    duration: 1 / fps,
  }));
}

export function containVideoSize(width: number, height: number, maxEdge: number) {
  const safeWidth = Math.max(2, Math.round(width));
  const safeHeight = Math.max(2, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(safeWidth * scale), height: even(safeHeight * scale) };
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export async function encodeReversedWave(
  channels: readonly Float32Array[],
  sampleRate: number,
  signal?: AbortSignal,
  onProgress?: (value: number) => void,
) {
  if (!channels.length || !channels[0]?.length) throw new Error("音频中没有可倒放的采样");
  const channelCount = Math.min(2, channels.length);
  const frameCount = channels[0].length;
  const dataBytes = frameCount * channelCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const chunkSize = 32768;
  let offset = 44;
  for (let start = 0; start < frameCount; start += chunkSize) {
    if (signal?.aborted) throw new Error("已取消音频倒放");
    const end = Math.min(frameCount, start + chunkSize);
    for (let frame = start; frame < end; frame += 1) {
      const sourceFrame = frameCount - frame - 1;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][sourceFrame] ?? 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    onProgress?.(Math.round((end / frameCount) * 100));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  return new Blob([buffer], { type: "audio/wav" });
}
