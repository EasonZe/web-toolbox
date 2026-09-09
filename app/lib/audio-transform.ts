export const MAX_AUDIO_TRANSFORM_BYTES = 150 * 1024 * 1024;
export const MAX_AUDIO_TRANSFORM_SECONDS = 30 * 60;

type FileLike = { name: string; size: number; type?: string };

export function validateAudioTransformFile(file: FileLike) {
  const supported = file.type?.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac)$/i.test(file.name);
  if (!supported) return "请选择常见的音频文件";
  if (!file.size || file.size > MAX_AUDIO_TRANSFORM_BYTES) return "音频文件不能超过150 MB";
  return "";
}

export function createTransformedAudioName(name: string, speed: number, semitones: number) {
  const base = name.replace(/\.[^.]+$/, "") || "audio";
  const pitch = semitones > 0 ? `+${semitones}` : String(semitones);
  return `${base}-${speed.toFixed(2)}x-${pitch}st.wav`;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export async function encodeAudioBufferToWave(
  audio: AudioBuffer,
  signal?: AbortSignal,
  onProgress?: (value: number) => void,
) {
  const channels = Math.min(2, audio.numberOfChannels);
  if (!channels || !audio.length) throw new Error("处理结果中没有有效音频");
  const dataBytes = audio.length * channels * 2;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const source = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  let offset = 44;
  const chunkSize = 32768;
  for (let start = 0; start < audio.length; start += chunkSize) {
    if (signal?.aborted) throw new Error("已取消音频处理");
    const end = Math.min(audio.length, start + chunkSize);
    for (let frame = start; frame < end; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, source[channel][frame] ?? 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    onProgress?.(75 + Math.round(end / audio.length * 25));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return new Blob([output], { type: "audio/wav" });
}
