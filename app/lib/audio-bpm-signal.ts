import type { BpmEstimate, BpmOptions } from "./audio-bpm-options";
import { checkBpmSamples, validateBpmOptions } from "./audio-bpm-options";

// Independent RBJ low-pass coefficients (W3C Audio EQ Cookbook), not copied UI/DSP code.
// Filtering and normalization mutate only the fresh buffer transferred to the task worker.
export function prepareBpmSignal(samples: Float32Array, sampleRate: number, options: BpmOptions) {
  validateBpmOptions(options); checkBpmSamples(sampleRate, samples.length);
  const omega = 2 * Math.PI * 240 / sampleRate, c = Math.cos(omega), alpha = Math.sin(omega) / Math.SQRT2, a0 = 1 + alpha;
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, maximum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]; if (!Number.isFinite(x)) throw new Error("音频包含无效采样值。");
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const envelope = Math.abs(y); samples[i] = envelope;
    if (!Number.isFinite(samples[i])) throw new Error("音频包含无效采样值。");
    maximum = Math.max(maximum, envelope);
  }
  if (!Number.isFinite(maximum) || maximum < 1e-7) throw new Error("所选区间接近静音，未检测到节奏；请更换区间或声道。");
  const gain = 0.95 / maximum;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}
// The upstream peak scanner advances by sampleRate / 4 array indexes. Rates
// such as 11025/22050 make these fractional. Resample the low-passed envelope
// to the nearest lower multiple of four, preserving time rather than lying
// about the input rate or rejecting common audio formats.
export function alignBpmEngineSignal(samples: Float32Array, sampleRate: number) {
  checkBpmSamples(sampleRate, samples.length);
  if (sampleRate % 4 === 0) return { samples, sampleRate };
  const rate = sampleRate - sampleRate % 4, output = new Float32Array(Math.round(samples.length * rate / sampleRate));
  for (let i = 0; i < output.length; i++) {
    const position = i * sampleRate / rate, left = Math.floor(position), right = Math.min(left + 1, samples.length - 1);
    output[i] = samples[left] + (samples[right] - samples[left]) * (position - left);
  }
  return { samples: output, sampleRate: rate };
}
export function validateBpmEstimate(value: { bpm: number; tempo: number; offset: number }, options: BpmOptions): BpmEstimate {
  validateBpmOptions(options);
  if (![value.bpm, value.tempo, value.offset].every(Number.isFinite) || value.tempo < options.min || value.tempo > options.max || value.bpm < 1 || !Number.isInteger(value.bpm) || value.offset < 0 || value.offset > 60 / value.bpm + 0.001) throw new Error("节拍引擎未返回有效估计，请更换区间或调整 BPM 范围。");
  return { bpm: value.bpm, tempo: value.tempo, phase: value.offset, alternatives: [value.tempo / 2, value.tempo * 2].filter((number) => number >= 30 && number <= 300) };
}
