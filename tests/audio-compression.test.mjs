import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/audio-compression.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(options = {}) {
  const state = { disposed: 0, canceled: 0 };
  const track = { getNumberOfChannels: async () => 2, getSampleRate: async () => 44100, canDecode: async () => options.decodable !== false };
  const media = {
    Input: class { async getPrimaryAudioTrack() { return options.noTrack ? null : track; } async computeDuration() { return options.duration ?? 8; } dispose() { state.disposed++; } },
    BlobSource: class {}, ALL_FORMATS: [], BufferTarget: class {},
    Mp3OutputFormat: class {}, Mp4OutputFormat: class {}, OggOutputFormat: class {},
    Output: class { constructor(config) { Object.assign(this, config); } },
    canEncodeAudio: async () => options.encodable !== false,
    Conversion: { async init(config) {
      state.config = config;
      const conversion = {
        state: "idle", isValid: options.valid !== false,
        async execute() {
          this.state = "executing";
          this.onProgress(0.4);
          if (options.executing) await options.executing();
          if (this.state === "canceled") throw new DOMException("Canceled", "AbortError");
          if (options.failure) throw new Error("encoding failed");
          config.output.target.buffer = new Uint8Array(options.empty ? 0 : 32).buffer;
          this.onProgress(1);
          this.state = "done";
        },
        async cancel() { state.canceled++; this.state = "canceled"; },
      };
      if (options.initializing) await options.initializing();
      return conversion;
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Blob, require(name) {
    if (name === "mediabunny") return media;
    if (name === "@mediabunny/mp3-encoder") return { registerMp3Encoder() { state.registered = true; } };
    throw new Error(name);
  } });
  return { ...exports, state };
}
const file = new File([new Uint8Array(1000)], "测试.WAV", { type: "audio/wav" });

test("音频大小估算、默认参数与文件名正确", () => {
  const api = load();
  assert.equal(api.defaultAudioSettings.format, "mp3");
  assert.equal(api.defaultAudioSettings.bitrate, 128);
  assert.equal(api.estimateAudioBytes(60, 128), 960000);
  assert.equal(api.estimateAudioBytes(Infinity, 128), 0);
  assert.equal(api.compressedAudioName("录音.1.WAV", "mp3"), "录音.1-compressed.mp3");
  assert.throws(() => api.validateAudioFile(new File([], "empty.mp3")), /为空/);
  assert.throws(() => api.validateAudioFile(new File(["text"], "notes.txt")), /请选择/);
  assert.throws(() => api.validateAudioFile({ ...file, size: 501 * 1024 * 1024 }), /500 MB/);
  api.validateAudioFile(new File(["x"], "test.FLAC"));
});

test("编码设置遵守格式、码率及声道限制", () => {
  const api = load();
  const config = api.getAudioEncoding({ ...api.defaultAudioSettings, format: "ogg", bitrate: 64 }, 6);
  assert.equal(config.codec, "opus"); assert.equal(config.sampleRate, 48000); assert.equal(config.numberOfChannels, 2); assert.equal(config.bitrate, 64000);
  assert.equal(api.getAudioEncoding({ ...api.defaultAudioSettings, channels: "mono" }, 2).numberOfChannels, 1);
  assert.throws(() => api.getAudioEncoding({ ...api.defaultAudioSettings, bitrate: 0 }, 2), /参数无效/);
});

test("读取元数据并释放输入，损坏或无音轨文件明确报错", async () => {
  const api = load(); const info = await api.readAudioInfo(file, new AbortController().signal);
  assert.equal(info.duration, 8); assert.equal(info.channels, 2); assert.equal(api.state.disposed, 1);
  for (const options of [{ noTrack: true }, { duration: Infinity }, { decodable: false }]) {
    const bad = load(options);
    await assert.rejects(bad.readAudioInfo(file, new AbortController().signal));
    assert.equal(bad.state.disposed, 1);
  }
});

for (const [format, mime, codec] of [["mp3", "audio/mpeg", "mp3"], ["m4a", "audio/mp4", "aac"], ["ogg", "audio/ogg", "opus"]]) {
  test(`${format}强制重新编码，返回正确MIME并在结束前保留99%`, async () => {
    const api = load(); const progress = [];
    const blob = await api.compressAudio(file, { ...api.defaultAudioSettings, format }, new AbortController().signal, (value) => progress.push(value));
    assert.equal(blob.type, mime); assert.equal(blob.size, 32);
    assert.equal(api.state.config.audio.codec, codec); assert.equal(api.state.config.audio.forceTranscode, true);
    assert.equal(api.state.config.video.discard, true); assert.deepEqual(progress, [40, 99]);
    assert.equal(api.state.disposed, 1); assert.equal(api.state.canceled, 0);
  });
}

test("编码失败、不支持或空结果不会返回假成功，资源被清理", async () => {
  for (const options of [{ valid: false }, { failure: true }, { empty: true }, { encodable: false }]) {
    const api = load(options);
    await assert.rejects(api.compressAudio(file, api.defaultAudioSettings, new AbortController().signal, () => {}));
    assert.equal(api.state.disposed, 1);
  }
});

test("初始化中和编码中取消都释放转换器，不返回迟到的结果", async () => {
  for (const stage of ["initializing", "executing"]) {
    const controller = new AbortController();
    const api = load({ [stage]: async () => { controller.abort(); } });
    await assert.rejects(api.compressAudio(file, api.defaultAudioSettings, controller.signal, () => {}), { name: "AbortError" });
    assert.equal(api.state.canceled, 1);
    assert.ok(api.state.disposed >= 1);
  }
  const controller = new AbortController(); controller.abort();
  const api = load();
  await assert.rejects(api.compressAudio(file, api.defaultAudioSettings, controller.signal, () => {}), { name: "AbortError" });
  assert.equal(api.state.disposed, 0);
});
