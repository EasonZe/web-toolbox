import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { unzipSync } from "fflate";
import exifr from "exifr";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { unitCategories } = loadLocalModule("app/lib/unit-definitions.ts");
const { convertUnits } = loadLocalModule("app/lib/unit-conversion.ts");
const { inspectImageDpi, setImageDpi } = loadLocalModule("app/lib/image-dpi.ts");
const { adjustImage, defaultAdjustments, imagePresets } = loadLocalModule("app/lib/image-adjustments.ts");
const { captureTimes, captureDimensions, inspectCaptureVideo, captureVideo } = loadLocalModule("app/lib/video-capture.ts");

test("单位换算涵盖 11 类的全部选项与同类一致性", () => {
  assert.equal(Object.keys(unitCategories).length, 11);
  for (const [category, definition] of Object.entries(unitCategories)) for (const [code] of definition.units) {
    const result = convertUnits("100", category, code, code);
    assert.ok(Math.abs(Number(result.value) - 100) < 1e-10, `${category}/${code}: ${result.value}`);
    assert.equal(result.rows.length, definition.units.length);
  }
});
test("单位换算保留小数精度，温度偏移与二进制容量正确", () => {
  assert.equal(convertUnits("1", "length", "in", "cm").value, "2.54");
  assert.equal(convertUnits("32", "temperature", "degF", "degC").value, "0");
  assert.equal(convertUnits("-40", "temperature", "degC", "degF").value, "-40");
  assert.equal(convertUnits("1", "data", "MB", "B").value, "1000000");
  assert.equal(convertUnits("1", "data", "MiB", "B").value, "1048576");
  assert.equal(convertUnits("1", "data", "B", "bit").value, "8");
  assert.equal(convertUnits("0.1", "length", "m", "cm").value, "10");
  assert.equal(convertUnits("1", "speed", "knots", "km/h").value, "1.852");
  assert.equal(convertUnits("1", "energy", "kcal", "J").value, "4184");
  assert.equal(convertUnits("1e3", "energy", "kWh", "J").value, "3600000000");
});
test("单位换算拒绝程序表达式、非有限数、跨类和绝对零度以下温度", () => {
  for (const value of ["", "1+2", "NaN", "Infinity", "1e9999", "1,000"]) assert.throws(() => convertUnits(value, "length", "m", "cm"));
  assert.throws(() => convertUnits("1", "length", "m", "kg"), /同一类别/);
  assert.throws(() => convertUnits("-274", "temperature", "degC", "K"), /绝对零度/);
  assert.doesNotThrow(() => convertUnits("-273.15", "temperature", "degC", "K"));
});
test("调色默认参数逐字节保留原图与透明通道，不修改输入", () => {
  const original = new Uint8ClampedArray([20, 80, 200, 128, 255, 0, 17, 0, 0, 0, 0, 255]);
  assert.deepEqual(adjustImage(original, 3, 1, defaultAdjustments), original);
  for (const preset of imagePresets) {
    const result = adjustImage(original, 3, 1, preset.settings);
    assert.deepEqual([result[3], result[7], result[11]], [128, 0, 255]);
  }
  assert.equal(original[0], 20);
});
test("调色黑白、反色与极端亮度正确，非法像素和参数拒绝处理", () => {
  const pixel = new Uint8ClampedArray([10, 50, 200, 128]);
  const gray = adjustImage(pixel, 1, 1, { ...defaultAdjustments, grayscale: 100 });
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]);
  assert.deepEqual(adjustImage(pixel, 1, 1, { ...defaultAdjustments, invert: 100 }), new Uint8ClampedArray([245, 205, 55, 128]));
  assert.deepEqual(adjustImage(pixel, 1, 1, { ...defaultAdjustments, brightness: 100 }), new Uint8ClampedArray([255, 255, 255, 128]));
  assert.throws(() => adjustImage(pixel, 2, 1, defaultAdjustments), /像素/);
  assert.throws(() => adjustImage(pixel, 1, 1, { ...defaultAdjustments, contrast: NaN }), /参数/);
});
function pngChunks(data, kind) {
  const result = []; for (let p = 8; p < data.length;) { const length = data.readUInt32BE(p); if (data.toString("ascii", p + 4, p + 8) === kind) result.push(data.subarray(p + 8, p + 8 + length)); p += length + 12; } return result;
}
test("PNG DPI 新增与反复覆盖只有一个 pHYs，IDAT 与像素不变", async () => {
  const generated = await sharp({ create: { width: 19, height: 13, channels: 4, background: { r: 10, g: 80, b: 200, alpha: 0.4 } } }).png().toBuffer(), parts = [generated.subarray(0, 8)];
  for (let p = 8; p < generated.length;) { const end = p + generated.readUInt32BE(p) + 12; if (generated.toString("ascii", p + 4, p + 8) !== "pHYs") parts.push(generated.subarray(p, end)); p = end; }
  const original = Buffer.concat(parts);
  assert.equal(inspectImageDpi(original).x, null);
  let result = Buffer.from(await setImageDpi(original, 300).arrayBuffer());
  result = Buffer.from(await setImageDpi(result, 150).arrayBuffer());
  const info = inspectImageDpi(result); assert.ok(Math.abs(info.x - 150) < 0.02); assert.equal(info.width, 19);
  assert.equal(pngChunks(result, "pHYs").length, 1); assert.deepEqual(pngChunks(result, "IDAT"), pngChunks(original, "IDAT"));
  assert.deepEqual(await sharp(result).raw().toBuffer(), await sharp(original).raw().toBuffer());
  assert.equal((await sharp(result).metadata()).density, 150);
});
test("JPEG 无 JFIF 时补入正确 APP0，熵编码数据保持不变", async () => {
  const original = await sharp({ create: { width: 23, height: 17, channels: 3, background: "#aabbcc" } }).jpeg().toBuffer();
  let source = original;
  if (original[3] === 0xe0) source = Buffer.concat([original.subarray(0, 2), original.subarray(4 + original.readUInt16BE(4))]);
  const result = Buffer.from(await setImageDpi(source, 600).arrayBuffer()), info = inspectImageDpi(result);
  assert.equal(info.x, 600); assert.equal(info.y, 600); assert.equal(info.width, 23);
  const scan = (data) => data.subarray(data.indexOf(Buffer.from([255, 218])));
  assert.deepEqual(scan(result), scan(source)); assert.deepEqual(await sharp(result).raw().toBuffer(), await sharp(source).raw().toBuffer());
});
test("带 EXIF 的 PNG 同步两个分辨率来源，保留 ICC、方向和压缩像素", async () => {
  const original = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#44aa66" } }).withMetadata({ density: 72, orientation: 6 }).png().toBuffer(), saved = Buffer.from(original);
  const result = Buffer.from(await setImageDpi(original, 300).arrayBuffer());
  assert.equal(inspectImageDpi(result).x, 300);
  const metadata = await sharp(result).metadata(), exif = await exifr.parse(result);
  assert.equal(metadata.density, 300); assert.equal(metadata.orientation, 6); assert.equal(exif.XResolution, 300); assert.equal(exif.YResolution, 300);
  assert.deepEqual(metadata.icc, (await sharp(original).metadata()).icc); assert.deepEqual(pngChunks(result, "IDAT"), pngChunks(original, "IDAT")); assert.deepEqual(original, saved);
});
test("JPEG 同步 EXIF 与 JFIF，保留方向、ICC 和像素，原输入不变", async () => {
  const original = await sharp({ create: { width: 20, height: 14, channels: 3, background: "#abcabc" } }).withMetadata({ density: 72, orientation: 6 }).jpeg().toBuffer(), saved = Buffer.from(original);
  const result = Buffer.from(await setImageDpi(original, 300).arrayBuffer()), before = await sharp(original).metadata(), after = await sharp(result).metadata();
  assert.equal(inspectImageDpi(result).x, 300); assert.equal(after.density, 300); assert.equal(after.orientation, 6); assert.deepEqual(after.icc, before.icc); assert.deepEqual(original, saved);
  assert.deepEqual(await sharp(result).raw().toBuffer(), await sharp(original).raw().toBuffer());
});
test("DPI 拒绝损坏长度与非整数设置，不生成错误文件", async () => {
  const original = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  for (const dpi of [0, NaN, -1, 65536, 1.5]) assert.throws(() => setImageDpi(original, dpi), /DPI/);
  const bad = Buffer.from(original); bad.writeUInt32BE(0xffffffff, 8); assert.throws(() => setImageDpi(bad, 300), /损坏/);
  assert.throws(() => inspectImageDpi(original.subarray(0, 33)), /损坏/);
});
test("JPEG 大端 EXIF 与厘米分辨率可转换，像素流不变", async () => {
  const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const segment = Buffer.alloc(76); segment[0] = 255; segment[1] = 225; segment.writeUInt16BE(74, 2); segment.write("Exif\0\0", 4, "binary");
  const tiff = new DataView(segment.buffer, segment.byteOffset + 10, 66); tiff.setUint16(0, 0x4d4d); tiff.setUint16(2, 42); tiff.setUint32(4, 8); tiff.setUint16(8, 3);
  for (const [index, tag, type, value] of [[0, 0x11a, 5, 50], [1, 0x11b, 5, 58], [2, 0x128, 3, 3]]) { const entry = 10 + index * 12; tiff.setUint16(entry, tag); tiff.setUint16(entry + 2, type); tiff.setUint32(entry + 4, 1); if (type === 3) tiff.setUint16(entry + 8, value); else tiff.setUint32(entry + 8, value); }
  tiff.setUint32(50, 72); tiff.setUint32(54, 1); tiff.setUint32(58, 144); tiff.setUint32(62, 2);
  const original = Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
  assert.ok(Math.abs(inspectImageDpi(original).x - 182.88) < 1e-9);
  const result = Buffer.from(await setImageDpi(original, 300).arrayBuffer());
  assert.equal(inspectImageDpi(result).x, 300); assert.equal((await exifr.parse(result)).ResolutionUnit, "inches");
  assert.deepEqual(await sharp(result).raw().toBuffer(), await sharp(original).raw().toBuffer());
});
test("取帧时刻覆盖区间但不落到视频终点，输出比例不被强制取偶数", () => {
  assert.deepEqual(captureTimes(1, 5, 3, 10), [1, 3, 5]);
  const end = captureTimes(0, 10, 2, 10); assert.ok(end[1] < 10 && end[1] > 9.99);
  assert.deepEqual(captureDimensions(101, 51, 1920), { width: 101, height: 51 });
  assert.deepEqual(captureDimensions(3840, 2160, 1280), { width: 1280, height: 720 });
  for (const args of [[-1, 5, 3, 10], [10, 10, 1, 10], [3, 2, 2, 10], [1, 2, 201, 10], [1, 1, 3, 10]]) assert.throws(() => captureTimes(...args));
});
const videoFile = new File([new Uint8Array(32)], "sample.mp4", { type: "video/mp4" });
function mediaHarness(options = {}) {
  const state = { disposed: 0, times: [], sink: null };
  const track = { async getFirstTimestamp() { return 5; }, async computeDuration() { return 15; }, async getDisplayWidth() { return 101; }, async getDisplayHeight() { return 51; }, async canDecode() { return options.canDecode ?? true; } };
  class Input { async getPrimaryVideoTrack() { return options.noTrack ? null : track; } dispose() { state.disposed++; } }
  class CanvasSink {
    constructor(t, settings) { state.sink = settings; }
    async *canvasesAtTimestamps(times) { state.times = times; for (const time of times) { if (options.onFrame) await options.onFrame(); if (options.empty) { yield null; continue; } yield { timestamp: time - 0.01, duration: 0.04, canvas: { async convertToBlob() { return new Blob([`frame:${time}`], { type: "image/png" }); } } }; } }
  }
  return { state, load: async () => ({ Input, BlobSource: class {}, CanvasSink, ALL_FORMATS: [] }) };
}
test("视频元数据采用显示尺寸与可见时间轴，读取结束即释放输入", async () => {
  const harness = mediaHarness(), info = await inspectCaptureVideo(videoFile, new AbortController().signal, harness.load);
  assert.deepEqual(info, { duration: 10, start: 5, width: 101, height: 51, canDecode: true }); assert.equal(harness.state.disposed, 1);
});
test("视频单帧使用正确轨道起点，批量 ZIP 带时间清单并释放解码器", async () => {
  const one = mediaHarness(), settings = { start: 1, end: 1, count: 1, edge: 0, format: "png" };
  const result = await captureVideo(videoFile, settings, new AbortController().signal, () => {}, one.load);
  assert.equal(await result.blob.text(), "frame:6"); assert.deepEqual(one.state.times, [6]); assert.equal(one.state.disposed, 1);
  const batch = mediaHarness(), progress = [], packed = await captureVideo(videoFile, { ...settings, start: 0, end: 4, count: 3 }, new AbortController().signal, (value) => progress.push(value), batch.load);
  const files = unzipSync(new Uint8Array(await packed.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ["frame-001-0.000s.png", "frame-002-2.000s.png", "frame-003-4.000s.png", "frames.csv"]);
  assert.match(new TextDecoder().decode(files["frames.csv"]), /2,2\.000000,1\.990000/);
  assert.equal(packed.count, 3); assert.equal(batch.state.sink.poolSize, 1); assert.equal(batch.state.disposed, 1); assert.equal(progress.at(-1), 95);
});
test("视频无轨道、解码不支持和取帧失败均释放资源，不返回部分 ZIP", async () => {
  for (const flags of [{ noTrack: true }, { canDecode: false }, { empty: true }]) {
    const harness = mediaHarness(flags);
    await assert.rejects(captureVideo(videoFile, { start: 0, end: 2, count: 2, edge: 1920, format: "png" }, new AbortController().signal, () => {}, harness.load));
    assert.ok(harness.state.disposed >= 1);
  }
});
test("取帧期间取消会清理输入并丢弃迟到帧", async () => {
  const controller = new AbortController(), harness = mediaHarness({ onFrame() { controller.abort(new Error("已取消")); } });
  await assert.rejects(captureVideo(videoFile, { start: 0, end: 2, count: 2, edge: 1920, format: "png" }, controller.signal, () => {}, harness.load), /已取消/);
  assert.ok(harness.state.disposed >= 1);
});
