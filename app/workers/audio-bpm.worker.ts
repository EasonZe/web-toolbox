import { guess } from "web-audio-beat-detector-worker/build/es2019/helpers/guess.js";
import { alignBpmEngineSignal, prepareBpmSignal, validateBpmEstimate } from "../lib/audio-bpm-signal";
import type { BpmOptions } from "../lib/audio-bpm-options";
self.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; sampleRate: number; options: BpmOptions }>) => {
  try {
    const prepared = prepareBpmSignal(data.samples, data.sampleRate, data.options);
    const { samples, sampleRate } = alignBpmEngineSignal(prepared, data.sampleRate);
    const result = validateBpmEstimate(guess(samples, sampleRate, { minTempo: data.options.min, maxTempo: data.options.max }), data.options);
    self.postMessage({ result });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "节拍分析失败。";
    self.postMessage({ error: /detectable beats/i.test(error) ? "没有检测到稳定节拍，请选择鼓点更清晰的区间或调整 BPM 范围。" : error });
  }
};
