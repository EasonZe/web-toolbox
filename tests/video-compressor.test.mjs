import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/video-compressor.tsx", import.meta.url),
  "utf8",
);

test("video compressor exposes practical local compression controls", () => {
  assert.match(source, /<FileDropZone/);
  assert.match(source, /压缩质量/);
  assert.match(source, /type="range"/);
  assert.match(source, /最大分辨率/);
  assert.match(source, /"1080": 1920/);
  assert.match(source, /"720": 1280/);
  assert.match(source, /sourceBitrate \* 0\.9 - audioBitrate/);
  assert.match(source, /最大帧率/);
  assert.match(source, /保留视频声音/);
  assert.match(source, /MP4（H\.264）/);
  assert.match(source, /WebM（VP9 \/ VP8）/);
  assert.match(source, /调节画质、分辨率和帧率压缩视频/);
  assert.doesNotMatch(source, /浏览器本地处理|不会上传/);
});

test("video compressor transcodes, reports progress, and downloads locally", () => {
  assert.match(source, /import\("mediabunny"\)/);
  assert.match(source, /new media\.Mp4OutputFormat/);
  assert.match(source, /new media\.WebMOutputFormat/);
  assert.match(source, /media\.Conversion\.init/);
  assert.match(source, /forceTranscode: true/);
  assert.match(source, /conversion\.onProgress/);
  assert.match(source, /await conversion\.execute\(\)/);
  assert.match(source, /new Blob\(\[target\.buffer\]/);
  assert.match(source, /download=\{result\.name\}/);
  assert.match(source, /下载视频/);
});
