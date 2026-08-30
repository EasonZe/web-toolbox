import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const libSource = await readFile(new URL("../app/lib/video-conversion.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/video-converter.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

const compiled = ts.transpileModule(libSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, { exports: helpers, Math, Number });

test("视频转换保持比例并限制分辨率和帧率", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(helpers.calculateVideoDimensions(1920, 1080, "720"))),
    { width: 1280, height: 720 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(helpers.calculateVideoDimensions(1080, 1920, "720"))),
    { width: 720, height: 1280 },
  );
  assert.equal(helpers.calculateVideoFrameRate(59.94, "30"), 30);
  assert.equal(helpers.calculateVideoFrameRate(23.976, "60"), 23.976);
});

test("转换计划包含画质码率、声音和预计体积", () => {
  const plan = helpers.createVideoConversionPlan({
    sourceWidth: 1920,
    sourceHeight: 1080,
    sourceFrameRate: 60,
    duration: 10,
    resolution: "720",
    frameRate: "30",
    quality: 78,
    keepAudio: true,
    hasAudio: true,
  });
  assert.equal(plan.width, 1280);
  assert.equal(plan.height, 720);
  assert.equal(plan.frameRate, 30);
  assert.equal(plan.audioBitrate, 160_000);
  assert.ok(plan.videoBitrate > 2_000_000);
  assert.equal(plan.estimatedSize, (plan.videoBitrate + 160_000) * 10 / 8);
  assert.equal(helpers.createConvertedVideoName("demo.source.mp4", "mkv"), "demo.source-converted.mkv");
});

test("视频转换组件进行真实转码并提供四种格式和取消操作", () => {
  assert.match(component, /<FileDropZone/);
  assert.match(component, /new media\.Mp4OutputFormat/);
  assert.match(component, /new media\.MovOutputFormat/);
  assert.match(component, /new media\.MkvOutputFormat/);
  assert.match(component, /new media\.WebMOutputFormat/);
  assert.match(component, /media\.Conversion\.init/);
  assert.match(component, /forceTranscode: true/);
  assert.match(component, /conversion\.onProgress/);
  assert.match(component, /await conversion\.execute\(\)/);
  assert.match(component, /cancelConversion/);
  assert.match(component, /download=\{result\.name\}/);
  assert.match(component, /转换完成/);
  assert.doesNotMatch(component, /fetch\(|FormData|XMLHttpRequest/);
  assert.match(page, /href: "\/video-converter"/);
});
