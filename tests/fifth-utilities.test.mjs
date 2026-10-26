import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { previewCron } = loadLocalModule("app/lib/cron-preview.ts");
const { identifyFile, identifyFiles } = loadLocalModule("app/lib/file-identification.ts");
const { compareImagePixels, compareImageFiles } = loadLocalModule("app/lib/image-difference.ts");
const { inspectTrimVideo, trimVideo, validateTrimRange } = loadLocalModule("app/lib/video-trimming.ts");
const { defaultImageDiffOptions, defaultVideoTrimOptions } = loadLocalModule("app/lib/practical-tool-options.ts");
const signal = () => new AbortController().signal;
const cron = { expression: "0 9 * * 1-5", timezone: "Asia/Shanghai", from: "2026-10-23T09:00:00+08:00", count: 3 };

test("Cron 五段补秒、严格晚于起点、六段步长和时区结果可重复", () => {
  const result = previewCron(cron);
  assert.deepEqual(result.dates.map((v) => v.iso), ["2026-10-26T01:00:00.000Z", "2026-10-27T01:00:00.000Z", "2026-10-28T01:00:00.000Z"]);
  assert.match(result.dates[0].local, /2026-10-26 09:00:00 GMT\+08:00/);
  assert.equal(result.fields[0].token, "0");
  assert.deepEqual(previewCron(cron), result);
  const seconds = previewCron({ ...cron, expression: "*/15 * * * * *", from: "2026-10-23T00:00:01Z", timezone: "UTC" });
  assert.deepEqual(seconds.dates.map((v) => v.iso.slice(17, 19)), ["15", "30", "45"]);
  assert.equal(previewCron({ ...cron, expression: "0 9 * * *", from: "" }, Date.parse("2026-10-23T00:00:00Z")).from, "2026-10-23T00:00:00.000Z");
});

test("Cron 日与星期采用 OR，夏令时春进秋退显示正确的 UTC 偏移", () => {
  const or = previewCron({ ...cron, expression: "0 9 1 * 1", timezone: "UTC", from: "2026-10-30T00:00:00Z" });
  assert.deepEqual(or.dates.slice(0, 2).map((v) => v.iso), ["2026-11-01T09:00:00.000Z", "2026-11-02T09:00:00.000Z"]);
  const spring = previewCron({ ...cron, expression: "30 2 * * *", timezone: "America/New_York", from: "2026-03-08T06:00:00Z" });
  assert.match(spring.dates[0].local, /03:30:00 GMT-04:00/);
  assert.equal(spring.dates[1].iso, "2026-03-09T06:30:00.000Z");
  const fall = previewCron({ ...cron, expression: "30 1 * * *", timezone: "America/New_York", from: "2026-11-01T04:00:00Z" });
  assert.match(fall.dates[0].local, /GMT-04:00/); assert.match(fall.dates[1].local, /GMT-05:00/);
});

test("Cron 拒绝非法日期、无时区时间、未知时区、随机字段与超量输出", () => {
  for (const next of [{ expression: "@daily" }, { expression: "0 0 0 * * * 2026" }, { expression: "H * * * *" }, { expression: "70 * * * *" }, { timezone: "Not/AZone" }, { from: "2026-10-23T00:00" }, { from: "2026-02-30T00:00:00Z" }, { from: "2026-01-01T24:00:00Z" }, { from: "2026-01-01T23:60:00Z" }, { count: 51 }, { count: 0 }, { count: 1.5 }]) assert.throws(() => previewCron({ ...cron, ...next }), undefined, JSON.stringify(next));
  assert.doesNotThrow(() => previewCron({ ...cron, from: "2024-02-29T00:00:00Z" }));
});

test("文件识别基于真实文件头，不信任扩展名或系统 MIME", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  const result = await identifyFile(new File([png], "pretend.exe", { type: "application/x-msdownload" }), signal());
  assert.equal(result.extension, "png"); assert.equal(result.status, "mismatch"); assert.equal(result.detected, "image/png"); assert.equal(result.declared, "application/x-msdownload");
  assert.match(result.hex, /^89 50 4E 47/);
  assert.equal((await identifyFile(new File([jpeg], "photo.JPEG"), signal())).status, "match");
  assert.equal((await identifyFile(new File([png], "photo"), signal())).status, "no-extension");
  assert.equal((await identifyFile(new File(["%PDF-1.7\n"], "file.pdf"), signal())).extension, "pdf");
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 109, 112, 52, 49]);
  assert.equal((await identifyFile(new File([mp4], "movie.mp4"), signal())).extension, "mp4");
});

test("ZIP/GZIP 只报告容器，未知文本不按文件名猜测，批量部分失败可继续", async () => {
  const zip = new Uint8Array([0x50, 0x4b, 3, 4]), gzip = new Uint8Array([0x1f, 0x8b, 8, 0]);
  const office = await identifyFile(new File([zip], "report.docx"), signal());
  assert.equal(office.status, "container"); assert.equal(office.extension, "zip"); assert.match(office.note, /未解压/);
  assert.equal((await identifyFile(new File([gzip], "archive.unitypackage"), signal())).status, "container");
  assert.equal((await identifyFile(new File([gzip], "archive.tgz"), signal())).status, "container");
  assert.equal((await identifyFile(new File(["hello world"], "fake.png", { type: "image/png" }), signal())).status, "unknown");
  const progress = [], results = await identifyFiles([new File([], "empty"), new File([zip], "a.zip")], signal(), (n) => progress.push(n));
  assert.match(results[0].error, /为空/); assert.equal(results[1].status, "match"); assert.equal(progress.length, 2);
  await assert.rejects(identifyFiles([], signal()), /1–200/); await assert.rejects(identifyFiles(Array(201).fill(new File([zip], "x")), signal()), /1–200/);
});

test("超大源文件仅取前 64 KiB，不整文件读取；采样或批处理取消及时退出", async () => {
  const calls = [], file = { name: "huge.zip", size: 20 * 1024 ** 3, type: "", slice(start, end) { calls.push([start, end]); return new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]); }, arrayBuffer() { throw new Error("不得读取整文件"); } };
  assert.equal((await identifyFile(file, signal())).extension, "zip"); assert.deepEqual(calls, [[0, 65536]]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(identifyFile(file, controller.signal), { name: "AbortError" }); assert.equal(calls.length, 1);
  const late = new AbortController(), interrupted = { ...file, slice() { return { async arrayBuffer() { late.abort(); return new ArrayBuffer(0); } }; } };
  await assert.rejects(identifyFiles([interrupted], late.signal), { name: "AbortError" });
});

test("像素对比统计真实差异、透明白底视觉、阈值及透明遮罩，不修改输入", () => {
  const left = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), right = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]), snapshot = left.slice();
  assert.equal(compareImagePixels(left, left, 2, 1, defaultImageDiffOptions).differences, 0);
  const diff = compareImagePixels(left, right, 2, 1, { ...defaultImageDiffOptions, includeAA: true, mask: true });
  assert.equal(diff.differences, 1); assert.equal(diff.ratio, 50); assert.deepEqual([...diff.pixels.slice(0, 4)], [255, 0, 0, 255]); assert.equal(diff.pixels[7], 0); assert.deepEqual(left, snapshot);
  const transparentA = new Uint8ClampedArray([0, 100, 200, 0]), transparentB = new Uint8ClampedArray([255, 0, 0, 0]);
  assert.equal(compareImagePixels(transparentA, transparentB, 1, 1, defaultImageDiffOptions).differences, 0);
  assert.equal(compareImagePixels(new Uint8ClampedArray([0, 0, 0, 255]), new Uint8ClampedArray([8, 8, 8, 255]), 1, 1, { ...defaultImageDiffOptions, threshold: 1 }).differences, 0);
  const aaLeft = new Uint8ClampedArray(5 * 5 * 4), aaRight = aaLeft.slice();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const i = (y * 5 + x) * 4; for (let c = 0; c < 3; c++) { aaLeft[i + c] = x < 2 ? 0 : x === 2 ? 100 : 255; aaRight[i + c] = x < 2 ? 0 : x === 2 ? 160 : 255; } aaLeft[i + 3] = aaRight[i + 3] = 255;
  }
  assert.equal(compareImagePixels(aaLeft, aaRight, 5, 5, { ...defaultImageDiffOptions, threshold: 0.01, includeAA: false }).differences, 0);
  assert.equal(compareImagePixels(aaLeft, aaRight, 5, 5, { ...defaultImageDiffOptions, threshold: 0.01, includeAA: true }).differences, 5);
  for (const args of [[left, right, 1, 1, defaultImageDiffOptions], [left, right, 2, 1, { ...defaultImageDiffOptions, threshold: NaN }], [left, right, 0, 1, defaultImageDiffOptions]]) assert.throws(() => compareImagePixels(...args));
});

function rasterRuntime() {
  const keys = ["OffscreenCanvas", "createImageBitmap", "ImageData"], saved = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key)), canvases = []; let closed = 0;
  class Canvas {
    constructor(w, h) { this.inner = createCanvas(w, h); this.w = w; this.h = h; canvases.push(this); }
    get width() { return this.w; } set width(v) { this.w = v; this.inner.width = Math.max(1, v); }
    get height() { return this.h; } set height(v) { this.h = v; this.inner.height = Math.max(1, v); }
    getContext() { const ctx = this.inner.getContext("2d"), draw = ctx.drawImage.bind(ctx); ctx.drawImage = (img, ...rest) => draw(img.inner ?? img, ...rest); return ctx; }
    async convertToBlob() { return new Blob([await this.inner.encode("png")], { type: "image/png" }); }
  }
  for (const [key, value] of [["OffscreenCanvas", Canvas], ["ImageData", ImageData], ["createImageBitmap", async (blob) => { const img = await loadImage(Buffer.from(await blob.arrayBuffer())); img.close = () => closed++; return img; }]]) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { canvases, closed: () => closed, restore() { keys.forEach((key, i) => saved[i] ? Object.defineProperty(globalThis, key, saved[i]) : delete globalThis[key]); } };
}

test("实际 PNG 差异导出原尺寸，差异红色及透明遮罩正确，所有位图画布释放", async () => {
  const runtime = rasterRuntime();
  try {
    const black = await sharp({ create: { width: 4, height: 3, channels: 4, background: "black" } }).png().toBuffer(), white = await sharp({ create: { width: 4, height: 3, channels: 4, background: "white" } }).png().toBuffer();
    const result = await compareImageFiles(new File([black], "a.png"), new File([white], "b.png"), { ...defaultImageDiffOptions, mask: true, includeAA: true }, signal());
    assert.equal(result.width, 4); assert.equal(result.height, 3); assert.equal(result.differences, 12); assert.equal(result.ratio, 100);
    const { data, info } = await sharp(Buffer.from(await result.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 4); assert.equal(info.height, 3); for (let i = 0; i < data.length; i += 4) assert.deepEqual([...data.slice(i, i + 4)], [255, 0, 0, 255]);
    const same = await compareImageFiles(new File([black], "a.png"), new File([black], "b.png"), { ...defaultImageDiffOptions, mask: true }, signal());
    const pixels = await sharp(Buffer.from(await same.blob.arrayBuffer())).ensureAlpha().raw().toBuffer(); assert.ok([...pixels].every((v) => v === 0));
    assert.equal(runtime.closed(), 4); assert.ok(runtime.canvases.every((c) => c.width === 0 && c.height === 0));
  } finally { runtime.restore(); }
});

test("图片尺寸不符、读取取消和无画布环境明确报错且释放资源", async () => {
  const runtime = rasterRuntime();
  try {
    const a = new File([await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer()], "a.png"), b = new File([await sharp({ create: { width: 3, height: 2, channels: 4, background: "red" } }).png().toBuffer()], "b.png");
    await assert.rejects(compareImageFiles(a, b, defaultImageDiffOptions, signal()), /尺寸不同/); assert.equal(runtime.closed(), 2);
    const controller = new AbortController(); controller.abort(); await assert.rejects(compareImageFiles(a, a, defaultImageDiffOptions, controller.signal), { name: "AbortError" }); assert.equal(runtime.closed(), 2);
    assert.ok(runtime.canvases.every((c) => c.width === 0));
    Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: undefined }); await assert.rejects(compareImageFiles(a, b, defaultImageDiffOptions, signal()), /不支持后台/);
  } finally { runtime.restore(); }
});

function mediaRuntime(config = {}) {
  const state = { disposed: 0, cancelled: 0, outputCancelled: 0, executed: 0, options: null, output: null };
  const video = { getFirstTimestamp: async () => config.start ?? 0, computeDuration: async () => config.end ?? 20, getDisplayWidth: async () => 1920, getDisplayHeight: async () => 1080, canDecode: async () => config.videoDecode !== false, computePacketStats: async () => ({ averagePacketRate: config.fps ?? 29.97 }) }, audio = { canDecode: async () => config.audioDecode !== false };
  class Input { async getPrimaryVideoTrack() { config.onOpen?.(); return config.noVideo ? null : video; } async getPrimaryAudioTrack() { return config.noAudio ? null : audio; } dispose() { state.disposed++; } }
  class StreamTarget { constructor(stream) { this.stream = stream; } }
  class Output { constructor(options) { this.target = options.target; state.output = this; } async cancel() { state.outputCancelled++; } }
  const media = { Input, StreamTarget, Output, BlobSource: class {}, ALL_FORMATS: [], Mp4OutputFormat: class {}, WebMOutputFormat: class {}, getFirstEncodableVideoCodec: async () => config.noEncoder ? null : "avc", canEncodeAudio: async () => config.audioEncode !== false, Conversion: { async init(options) {
    state.options = options; if (config.initFails) throw new Error("init failed"); config.onInit?.();
    return { isValid: config.valid !== false, utilizedTracks: config.dropVideo ? [] : config.dropAudio || config.noAudio ? [video] : [video, audio], async cancel() { state.cancelled++; }, async execute() { state.executed++; config.onExecute?.(); if (config.executeFails) throw new Error("encode failed"); if (!config.empty) { const writer = options.output.target.stream.getWriter(); await writer.write({ data: new Uint8Array([1, 2, 3, 4]), position: 0 }); await writer.close(); } this.onProgress?.(1); } };
  } } };
  return { state, load: async () => media };
}
const videoFile = () => new File(["not a real media fixture"], "source.mp4", { type: "video/mp4" });
const trimOptions = { ...defaultVideoTrimOptions, start: 2, end: 8 };

test("裁剪范围检查及视频信息读取关闭输入，非零媒体起点换算正确", async () => {
  assert.equal(validateTrimRange(1.5, 3.25, 10), 1.75);
  for (const args of [[0, 0, 10], [-1, 4, 10], [2, 11, 10], [NaN, 5, 10]]) assert.throws(() => validateTrimRange(...args));
  const runtime = mediaRuntime({ start: 5, end: 25, fps: NaN });
  assert.deepEqual(await inspectTrimVideo(videoFile(), signal(), runtime.load), { duration: 20, start: 5, width: 1920, height: 1080, frameRate: 30, hasAudio: true, canDecode: true }); assert.equal(runtime.state.disposed, 1);
  const next = mediaRuntime({ start: 5, end: 25 });
  const result = await trimVideo(videoFile(), trimOptions, signal(), () => {}, next.load);
  assert.deepEqual(next.state.options.trim, { start: 7, end: 13 }); assert.equal(result.duration, 6); assert.equal(result.blob.type, "video/mp4"); assert.deepEqual([...new Uint8Array(await result.blob.arrayBuffer())], [1, 2, 3, 4]);
  assert.equal(next.state.options.video.forceTranscode, true); assert.equal(next.state.options.video.frameRate, undefined); assert.equal(next.state.options.audio.forceTranscode, true); assert.deepEqual(next.state.options.tags, {}); assert.equal(next.state.disposed, 1); assert.equal(next.state.cancelled, 1);
});

test("视频裁剪静音与 WebM 设置传递、主音轨丢失时拒绝生成静音成品", async () => {
  const muted = mediaRuntime(); const result = await trimVideo(videoFile(), { ...trimOptions, keepAudio: false, format: "webm", resolution: "720" }, signal(), () => {}, muted.load);
  assert.deepEqual(muted.state.options.audio, { discard: true }); assert.equal(result.blob.type, "video/webm"); assert.equal(result.width, 1280); assert.equal(result.height, 720);
  for (const [config, message] of [[{ dropAudio: true }, /音轨未能转换/], [{ dropVideo: true }, /视频轨道未能转换/], [{ audioDecode: false }, /音轨无法解码/], [{ audioEncode: false }, /无法编码声音/], [{ videoDecode: false }, /无法解码此视频/], [{ noEncoder: true }, /无法编码 MP4/]]) {
    const runtime = mediaRuntime(config); await assert.rejects(trimVideo(videoFile(), trimOptions, signal(), () => {}, runtime.load), message); assert.equal(runtime.state.executed, 0); assert.equal(runtime.state.disposed, 1);
  }
  const noAudio = mediaRuntime({ noAudio: true }); await trimVideo(videoFile(), trimOptions, signal(), () => {}, noAudio.load); assert.deepEqual(noAudio.state.options.audio, { discard: true });
});

test("视频裁剪初始化、执行失败和空输出均清理，不返回部分文件", async () => {
  for (const [config, message] of [[{ initFails: true }, /init failed/], [{ executeFails: true }, /encode failed/], [{ empty: true }, /没有生成/], [{ noVideo: true }, /没有视频/]]) {
    const runtime = mediaRuntime(config); await assert.rejects(trimVideo(videoFile(), trimOptions, signal(), () => {}, runtime.load), message); assert.equal(runtime.state.disposed, 1); if (config.initFails) assert.equal(runtime.state.outputCancelled, 1);
  }
  const invalid = mediaRuntime(); await assert.rejects(trimVideo(videoFile(), { ...trimOptions, end: 50 }, signal(), () => {}, invalid.load), /裁剪区间/); assert.equal(invalid.state.disposed, 1);
  await assert.rejects(trimVideo(videoFile(), { ...trimOptions, format: "avi" }, signal(), () => {}, invalid.load), /设置无效/);
});

test("视频裁剪在加载、初始化或执行阶段取消都拒绝旧结果并仅销毁一次输入", async () => {
  for (const stage of ["onOpen", "onInit", "onExecute"]) {
    const controller = new AbortController(), runtime = mediaRuntime({ [stage]: () => controller.abort() });
    await assert.rejects(trimVideo(videoFile(), trimOptions, controller.signal, () => {}, runtime.load), { name: "AbortError" }); assert.equal(runtime.state.disposed, 1); assert.ok(runtime.state.cancelled <= 2);
  }
  const controller = new AbortController(); controller.abort(); const runtime = mediaRuntime();
  await assert.rejects(inspectTrimVideo(videoFile(), controller.signal, runtime.load), { name: "AbortError" }); assert.equal(runtime.state.disposed, 0);
});

test("Cron、文件类型和像素对比依赖锁定精确版本，原始许可随构建分发", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const [name, version, license] of [["cron-parser", "5.10.2", "LICENSE"], ["file-type", "22.2.0", "license"], ["pixelmatch", "8.0.0", "LICENSE"]]) {
    assert.equal(pkg.dependencies[name], version); assert.equal(await readFile(new URL(`../dist/client/vendor-licenses/${name}.txt`, import.meta.url), "utf8"), await readFile(new URL(`../node_modules/${name}/${license}`, import.meta.url), "utf8"));
  }
  for (const [name, license] of [["luxon", "LICENSE.md"], ["strtok3", "LICENSE.txt"], ["token-types", "LICENSE.txt"], ["@borewit/text-codec", "LICENSE.txt"], ["uint8array-extras", "license"], ["@tokenizer/inflate", "LICENSE"], ["debug", "LICENSE"], ["ms", "license.md"], ["ieee754", "LICENSE"]]) {
    assert.equal(await readFile(new URL(`../dist/client/vendor-licenses/${name.replaceAll("/", "-")}.txt`, import.meta.url), "utf8"), await readFile(new URL(`../node_modules/${name}/${license}`, import.meta.url), "utf8"));
  }
});
