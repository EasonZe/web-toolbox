import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { readBpmSamples } = loadLocalModule("app/lib/audio-bpm-source.ts");
const options = { start: 1, end: 6, min: 90, max: 180, channel: "first" };
const file = new File(["audio fixture"], "source.wav", { type: "audio/wav" });
const signal = () => new AbortController().signal;
function chunk({ timestamp = 1, frames = 40000, channels = 2, rate = 8000, planes = [0.25, 0.75], copyError = false } = {}) {
  return {
    timestamp, numberOfFrames: frames, numberOfChannels: channels, sampleRate: rate, closed: 0, copies: [],
    copyTo(target, config) {
      this.copies.push(config); if (copyError) throw new Error("copy failed");
      const source = planes[config.planeIndex];
      for (let i = 0; i < target.length; i++) target[i] = typeof source === "function" ? source(i + config.frameOffset) : source;
    },
    close() { this.closed++; },
  };
}
function fixture(config = {}) {
  const state = { inputs: 0, disposals: 0, sinks: 0, sinkArgs: [], finished: false };
  const chunks = config.chunks ?? [chunk()];
  const track = {
    async getSampleRate() { config.onMetadata?.(); return config.rate ?? 8000; },
    async getNumberOfChannels() { return config.channels ?? 2; },
    async canDecode() { return config.decodable !== false; },
  };
  const media = {
    Input: class {
      constructor() { state.inputs++; }
      async getPrimaryAudioTrack() { config.onTrack?.(); if (config.trackError) throw new Error("track failed"); return config.noTrack ? null : track; }
      async computeDuration() { return config.duration ?? 8; }
      dispose() { state.disposals++; }
    },
    BlobSource: class {}, ALL_FORMATS: [],
    AudioSampleSink: class {
      constructor() { state.sinks++; }
      async *samples(...args) {
        state.sinkArgs.push(args);
        try {
          for (const sample of chunks) { config.beforeYield?.(sample); yield sample; }
          if (config.sinkError) throw new Error("decoder failed");
        } finally { state.finished = true; }
      }
    },
  };
  return { state, chunks, media, load: async () => { config.onLoad?.(); return media; } };
}

test("真实 Mediabunny PCM WAV 解码按区间与声道处理，无浏览器或媒体播放模拟", async () => {
  const rate = 8000, frames = rate * 7, wav = Buffer.alloc(44 + frames * 4);
  wav.write("RIFF"); wav.writeUInt32LE(36 + frames * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(frames * 4, 40);
  for (let index = 0; index < frames; index++) { wav.writeInt16LE(index < rate * 2 ? 4096 : 8192, 44 + index * 4); wav.writeInt16LE(16384, 46 + index * 4); }
  const source = new File([wav], "stereo.wav", { type: "audio/wav" });
  for (const [channel, first, later] of [["first", 0.125, 0.25], ["second", 0.5, 0.5], ["mix", 0.3125, 0.375]]) {
    const result = await readBpmSamples(source, { ...options, channel }, signal());
    assert.equal(result.sampleRate, rate); assert.equal(result.samples.length, rate * 5);
    assert.equal(result.samples[0], first); assert.equal(result.samples[rate - 1], first); assert.equal(result.samples[rate], later); assert.equal(result.samples.at(-1), later);
  }
});

test("帧块跨区间首尾精确裁切，平面复制参数正确，每个采样块都关闭", async () => {
  const before = chunk({ timestamp: 0, frames: 100 }), first = chunk({ timestamp: 0.99975, frames: 8002, planes: [(index) => index / 10000, 0.75] });
  const second = chunk({ timestamp: 2, frames: 32004, planes: [0.5, 1] }), after = chunk({ timestamp: 7, frames: 10 });
  const app = fixture({ chunks: [before, first, second, after] }), progress = [];
  const result = await readBpmSamples(file, options, signal(), (value) => progress.push(value), app.load);
  assert.equal(result.samples.length, 40000); assert.ok(Math.abs(result.samples[0] - 0.0002) < 1e-9); assert.equal(result.samples[8000], 0.5); assert.equal(result.samples.at(-1), 0.5);
  assert.deepEqual(first.copies, [{ format: "f32-planar", planeIndex: 0, frameOffset: 2, frameCount: 8000 }]);
  assert.deepEqual(second.copies, [{ format: "f32-planar", planeIndex: 0, frameOffset: 0, frameCount: 32000 }]);
  assert.equal(before.copies.length, 0); assert.equal(after.copies.length, 0);
  assert.equal(app.chunks.every((sample) => sample.closed === 1), true); assert.equal(app.state.disposals, 1); assert.equal(app.state.finished, true);
  assert.deepEqual(app.state.sinkArgs, [[1, 6]]); assert.deepEqual(progress, [15, 75]);
});

test("首声道、第二声道与前两个声道平均互不混淆，单声道混合保留原信号", async () => {
  for (const [channel, expected, planeIndices] of [["first", 0.25, [0]], ["second", 0.75, [1]], ["mix", 0.5, [0, 1]]]) {
    const app = fixture({ channels: 3, chunks: [chunk({ channels: 3, planes: [0.25, 0.75, 1] })] });
    const result = await readBpmSamples(file, { ...options, channel }, signal(), undefined, app.load);
    assert.equal(result.samples.every((value) => value === expected), true); assert.deepEqual(app.chunks[0].copies.map((copy) => copy.planeIndex), planeIndices);
  }
  const mono = fixture({ channels: 1, chunks: [chunk({ channels: 1, planes: [0.25] })] });
  assert.equal((await readBpmSamples(file, { ...options, channel: "mix" }, signal(), undefined, mono.load)).samples[0], 0.25);
});

test("输入、元数据与解码错误不会返回假成功，已创建输入必定释放", async () => {
  for (const config of [{ noTrack: true }, { trackError: true }, { duration: Infinity }, { duration: 5 }, { channels: 0 }, { channels: 1.5 }, { decodable: false }, { rate: 0 }, { rate: NaN }, { rate: 7999 }, { chunks: [] }, { chunks: [chunk({ copyError: true })] }, { sinkError: true }]) {
    const app = fixture(config); await assert.rejects(readBpmSamples(file, options, signal(), undefined, app.load));
    assert.equal(app.state.disposals, 1);
    if (config.chunks?.[0]?.copies.length) assert.equal(config.chunks[0].closed, 1);
  }
  const second = fixture({ channels: 1 }); await assert.rejects(readBpmSamples(file, { ...options, channel: "second" }, signal(), undefined, second.load), /声道/); assert.equal(second.state.disposals, 1);
  const invalid = fixture(); await assert.rejects(readBpmSamples(new File([], "empty.wav"), options, signal(), undefined, invalid.load), /为空/); assert.equal(invalid.state.inputs, 0);
  await assert.rejects(readBpmSamples(file, { ...options, end: 4 }, signal(), undefined, invalid.load), /有效区间/); assert.equal(invalid.state.inputs, 0);
});

test("异常巨量声道元数据在创建解码接收器前拒绝，避免按全声道失控分配", async () => {
  const app = fixture({ channels: 65535, chunks: [chunk({ channels: 65535 })] });
  await assert.rejects(readBpmSamples(file, options, signal(), undefined, app.load), /声道|预算|解码/);
  assert.equal(app.state.sinks, 0); assert.equal(app.state.disposals, 1);
});

test("区间内采样率、时间戳、帧数与真实声道变化被拒绝并关闭当前帧", async () => {
  for (const config of [{ rate: 16000 }, { timestamp: NaN }, { frames: -1 }, { frames: 40000.5 }, { channels: 1 }, { channels: 1.5 }, { channels: NaN }]) {
    const sample = chunk(config), app = fixture({ chunks: [sample] });
    await assert.rejects(readBpmSamples(file, { ...options, channel: "mix" }, signal(), undefined, app.load), /变化|声道/);
    assert.equal(sample.closed, 1); assert.equal(app.state.disposals, 1); assert.equal(app.state.finished, true);
  }
});

test("预取消、加载/元数据/逐块解码中取消都不返回结果，迟到帧和输入被清理", async () => {
  for (const stage of ["before", "load", "track", "metadata", "sample"]) {
    const controller = new AbortController(), config = {};
    if (stage === "before") controller.abort();
    if (stage === "load") config.onLoad = () => controller.abort();
    if (stage === "track") config.onTrack = () => controller.abort();
    if (stage === "metadata") config.onMetadata = () => controller.abort();
    if (stage === "sample") config.beforeYield = () => controller.abort();
    const app = fixture(config);
    await assert.rejects(readBpmSamples(file, options, controller.signal, undefined, app.load), { name: "AbortError" });
    if (["before", "load"].includes(stage)) assert.equal(app.state.inputs, 0); else assert.ok(app.state.disposals >= 1);
    if (stage === "sample") { assert.equal(app.chunks[0].closed, 1); assert.equal(app.state.finished, true); }
  }
  const controller = new AbortController(), app = fixture(); await readBpmSamples(file, options, controller.signal, undefined, app.load);
  const count = app.state.disposals; controller.abort(); assert.equal(app.state.disposals, count, "completion removes abort listener");
});
