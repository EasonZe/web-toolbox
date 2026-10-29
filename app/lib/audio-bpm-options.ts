import { audioSampleBudget, toolLimits } from "./resource-limits";
export type BpmOptions = { start: number; end: number; min: number; max: number; channel: "first" | "second" | "mix" };
export type BpmEstimate = { bpm: number; tempo: number; phase: number; alternatives: number[] };
export type BpmResult = BpmEstimate & { start: number; end: number; sampleRate: number; channel: BpmOptions["channel"] };
// Leave space for the decoder, per-frame copies and in-place filtering/peak search.
export function bpmSampleBudget() { return Math.floor(audioSampleBudget() / 16); }
export function validateBpmOptions(options: BpmOptions) {
  if (![options.start, options.end, options.min, options.max].every(Number.isFinite) || options.start < 0 || options.end - options.start < 5 || options.min < 30 || options.max > 300 || options.max <= options.min || !["first", "second", "mix"].includes(options.channel)) throw new Error("请选择至少 5 秒的有效区间；BPM 下限须 ≥30，上限须 ≤300 且大于下限。");
}
export function checkBpmSamples(sampleRate: number, frames: number) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Number.isSafeInteger(frames) || frames < sampleRate * 5 || frames > bpmSampleBudget()) throw new Error("所选区间采样量超过当前设备分析预算或采样率无效，请缩短区间；建议选择节奏稳定的 30–90 秒。");
}
export function checkBpmDecodeBudget(sampleRate: number, frames: number, channels: number) {
  checkBpmSamples(sampleRate, frames);
  if (!Number.isSafeInteger(channels) || channels < 1 || channels > toolLimits.audioBpm.channels || frames * channels > audioSampleBudget()) throw new Error("音频声道数或全声道解码采样量超过分析预算，请先转为单声道 / 双声道或缩短区间。");
}
