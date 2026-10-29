import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { validateBpmOptions, checkBpmSamples, checkBpmDecodeBudget, bpmSampleBudget } = loadLocalModule("app/lib/audio-bpm-options.ts");
const { prepareBpmSignal, alignBpmEngineSignal, validateBpmEstimate } = loadLocalModule("app/lib/audio-bpm-signal.ts");
const options = { start: 0, end: 5, min: 90, max: 180, channel: "first" };
test("BPM 解码在进入接收器前同时约束全部声道工作量", () => {
  checkBpmDecodeBudget(8000, 40000, 32);
  for (const channels of [0, 1.5, 33, 65535, Infinity]) assert.throws(() => checkBpmDecodeBudget(8000, 40000, channels), /声道|预算/);
  assert.throws(() => checkBpmDecodeBudget(8000, 12_000_000, 32), /预算/);
});

test("BPM 区间、搜索范围与声道验证不接受非有限或不完整设置", () => {
  validateBpmOptions(options); validateBpmOptions({ ...options, min: 30, max: 300, start: 3.125, end: 8.125, channel: "mix" });
  for (const invalid of [
    { start: -1 }, { end: 4.999 }, { start: 5, end: 5 }, { start: NaN }, { end: Infinity },
    { min: 29.99 }, { max: 300.01 }, { min: 100, max: 100 }, { min: 181 }, { max: NaN }, { channel: "third" },
  ]) assert.throws(() => validateBpmOptions({ ...options, ...invalid }), /有效区间|BPM/);
});

test("BPM 预算依据采样数与设备，边界通过，非法采样率和超预算明确拒绝", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    for (const [navigator, budget] of [[{ deviceMemory: 8, userAgent: "desktop", platform: "Win32", maxTouchPoints: 0 }, 12_000_000], [{ deviceMemory: 2, userAgent: "Android", platform: "Linux", maxTouchPoints: 5 }, 4_000_000]]) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
      assert.equal(bpmSampleBudget(), budget); checkBpmSamples(8000, 40000); checkBpmSamples(8000, budget);
      assert.throws(() => checkBpmSamples(8000, budget + 1), /预算/);
    }
    for (const [rate, frames] of [[7999, 40000], [192001, 1_000_000], [8000.5, 40000], [8000, 39999], [8000, 40000.1], [NaN, 40000], [8000, Infinity]]) assert.throws(() => checkBpmSamples(rate, frames), /预算|采样率/);
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator; }
});

test("BPM 低通包络只处理新缓冲并归一化到有限非负值，不产生直流或高频假振幅", () => {
  const rate = 8000, samples = new Float32Array(rate * 5);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.sin(2 * Math.PI * 80 * index / rate) * 0.7 + Math.sin(2 * Math.PI * 1500 * index / rate) * 0.1;
  const before = samples.slice(); const output = prepareBpmSignal(samples, rate, options);
  assert.equal(output, samples); assert.notDeepEqual(output, before);
  assert.equal(output.every((value) => Number.isFinite(value) && value >= 0 && value <= 0.950001), true);
  assert.ok(Math.abs(Math.max(...output) - 0.95) < 1e-6);
  const peakTimes = [];
  for (let index = 2; index < 400; index++) if (output[index] > output[index - 1] && output[index] > output[index + 1]) peakTimes.push(index);
  assert.ok(peakTimes.length < 20, "240Hz low-pass should suppress the 1500Hz carrier before the absolute-value envelope");
});

test("静音、无效采样与 Float32 包络溢出必须明确失败，不返回 Infinity 或 NaN", () => {
  assert.throws(() => prepareBpmSignal(new Float32Array(40000), 8000, options), /静音|节奏/);
  assert.throws(() => prepareBpmSignal(new Float32Array(40000).fill(1e-10), 8000, options), /静音|节奏/);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const samples = new Float32Array(40000).fill(0.25); samples[1234] = invalid;
    assert.throws(() => prepareBpmSignal(samples, 8000, options), /无效采样/);
  }
  assert.throws(() => prepareBpmSignal(new Float32Array(40000).fill(3.4028234663852886e38), 8000, options), /无效|溢出|有限/);
});

test("节拍引擎结果校验有限值与相位，半速倍速仅给出范围内候选而非置信度", () => {
  const result = validateBpmEstimate({ bpm: 120, tempo: 120.125, offset: 0.25 }, options);
  assert.equal(result.bpm, 120); assert.equal(result.tempo, 120.125); assert.equal(result.phase, 0.25);
  assert.deepEqual([...result.alternatives], [60.0625, 240.25]);
  const high = validateBpmEstimate({ bpm: 280, tempo: 280, offset: 0.1 }, { ...options, min: 200, max: 300 }); assert.deepEqual([...high.alternatives], [140]);
  for (const value of [{ bpm: 0, tempo: 120, offset: 0 }, { bpm: 120.5, tempo: 120, offset: 0 }, { bpm: 120, tempo: 181, offset: 0 }, { bpm: 120, tempo: NaN, offset: 0 }, { bpm: 120, tempo: 120, offset: -0.1 }, { bpm: 120, tempo: 120, offset: 0.6 }])
    assert.throws(() => validateBpmEstimate(value, options), /有效估计/);
});

test("上游四分之一秒索引适配保持时间尺度，常见11025/22050Hz不产生小数数组索引", () => {
  for (const rate of [11025, 22050, 44101, 48003]) {
    const samples = new Float32Array(rate * 5 + 17);
    for (let index = 0; index < samples.length; index++) samples[index] = index / rate;
    const result = alignBpmEngineSignal(samples, rate);
    assert.notEqual(result.samples, samples); assert.equal(result.sampleRate % 4, 0);
    assert.ok(rate - result.sampleRate >= 1 && rate - result.sampleRate <= 3);
    assert.equal(result.samples.length, Math.round(samples.length * result.sampleRate / rate));
    assert.ok(Math.abs(result.samples.length / result.sampleRate - samples.length / rate) <= 0.5 / result.sampleRate);
    assert.equal(result.samples.every(Number.isFinite), true);
    for (const index of [0, Math.floor(result.sampleRate * 2.5), result.samples.length - 2]) assert.ok(Math.abs(result.samples[index] - index / result.sampleRate) < 1e-6);
  }
  for (const rate of [8000, 44100, 48000]) {
    const samples = new Float32Array(rate * 5); const result = alignBpmEngineSignal(samples, rate);
    assert.equal(result.samples, samples); assert.equal(result.sampleRate, rate);
  }
  assert.throws(() => alignBpmEngineSignal(new Float32Array(39999), 8000), /预算|采样率/);
});
