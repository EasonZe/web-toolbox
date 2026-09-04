import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/media-reversal.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, { exports: helpers, ArrayBuffer, Blob, DataView, Error, Math, Number, setTimeout, Uint8Array });

test("倒放工具校验媒体文件并生成清晰的下载文件名", () => {
  assert.equal(helpers.validateAudioReverseFile({ name: "voice.mp3", size: 1024, type: "audio/mpeg" }), "");
  assert.match(helpers.validateAudioReverseFile({ name: "photo.png", size: 1024, type: "image/png" }), /音频/);
  assert.equal(helpers.validateVideoReverseFile({ name: "movie.mp4", size: 1024, type: "video/mp4" }), "");
  assert.equal(helpers.createReversedName("voice.demo.mp3", "audio"), "voice.demo-reversed.wav");
  assert.equal(helpers.createReversedName("movie.mp4", "video"), "movie-reversed.webm");
});

test("视频倒放时间轴从结尾向开头排列并限制为偶数尺寸", () => {
  const times = helpers.createReverseFrameTimes(1, 4);
  assert.equal(times.length, 4);
  assert.ok(times[0].sourceTime > times[1].sourceTime);
  assert.equal(times[0].outputTime, 0);
  assert.equal(times[3].outputTime, 0.75);
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.containVideoSize(1920, 1080, 720))), { width: 720, height: 406 });
});

test("音频采样会真正反序写入WAV", async () => {
  const blob = await helpers.encodeReversedWave([new Float32Array([0.25, -0.5])], 8000);
  assert.equal(blob.type, "audio/wav");
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(view.getInt16(44, true), -16384);
  assert.equal(view.getInt16(46, true), 8191);
});

test("倒放组件使用拖放、真实媒体编码和结果下载", async () => {
  const audio = await readFile(new URL("../app/components/audio-reverser.tsx", import.meta.url), "utf8");
  const video = await readFile(new URL("../app/components/video-reverser.tsx", import.meta.url), "utf8");
  assert.match(audio, /<FileDropZone/);
  assert.match(audio, /encodeReversedWave/);
  assert.match(audio, /下载倒放音频/);
  assert.match(video, /new media\.VideoSampleSink/);
  assert.match(video, /new media\.CanvasSource/);
  assert.match(video, /new media\.AudioBufferSource/);
  assert.match(video, /new media\.WebMOutputFormat/);
  assert.match(video, /samplesAtTimestamps/);
  assert.match(video, /sample\.draw/);
  assert.match(video, /下载倒放视频/);
  assert.doesNotMatch(`${audio}\n${video}`, /fetch\(|XMLHttpRequest|FormData/);
});
