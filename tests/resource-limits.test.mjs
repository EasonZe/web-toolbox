import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const policy = loadLocalModule("app/lib/resource-limits.ts"), { toolLimits } = policy;
const video = loadLocalModule("app/lib/video-conversion.ts"), documents = loadLocalModule("app/lib/document-conversion.ts"), models = loadLocalModule("app/lib/model-turntable.ts"), text = loadLocalModule("app/lib/text-inspection.ts"), pdf = loadLocalModule("app/lib/pdf-pages.ts");

test("全站共享限额，旧视频、文档、模型正常大文件不再被旧门槛拒绝", () => {
  assert.equal(video.validateVideoConversionFile({ name: "large.mp4", type: "video/mp4", size: 1024 * 1048576 }), "");
  assert.ok(video.validateVideoConversionFile({ name: "large.mp4", type: "video/mp4", size: toolLimits.media.fileBytes + 1 }));
  assert.doesNotThrow(() => documents.validateDocumentFile({ name: "large.pdf", size: 100 * 1048576 }, "pdf-to-word"));
  assert.equal(models.validateModelFile({ name: "large.glb", size: 256 * 1048576 }), "");
  assert.deepEqual(models.parseModelResolution("3840x2160"), { width: 3840, height: 2160 });
  assert.throws(() => models.parseModelResolution("9999x2160"));
});
test("大图按像素检查，保留安全上限而不是只检查压缩文件大小", () => {
  assert.doesNotThrow(() => policy.checkImagePixels(8000, 6000));
  assert.throws(() => policy.checkImagePixels(10001, 10000), /1 亿/);
  assert.throws(() => policy.checkImagePixels(Infinity, 20));
  assert.throws(() => policy.checkImagePixels(0, 20));
});
test("大任务是确认提示，分块哈希不套用内存型文件门槛", () => {
  assert.equal(policy.largeFilesWarning([{ size: 20 }]), "");
  assert.match(policy.largeFilesWarning([{ size: 200 * 1048576 }]), /继续/);
  assert.equal(policy.largeFilesWarning([{ size: 50 * 1024 ** 3 }], true), "");
  assert.match(policy.largeFilesWarning(Array.from({ length: 101 }, () => ({ size: 1 }))), /101/);
});
test("音频按声道与采样率计算，不再统一拒绝超过10分钟的文件", () => {
  assert.equal(policy.checkDecodedAudio(1200, 44100, 2), 105840000);
  assert.doesNotThrow(() => policy.checkDecodedAudio(3600, 44100, 1));
  assert.throws(() => policy.checkDecodedAudio(3600, 44100, 2), /采样量/);
  assert.throws(() => policy.checkDecodedAudio(Infinity, 44100, 2));
  assert.throws(() => policy.checkDecodedAudio(1, 44100, 2, toolLimits.decodedAudio.samples));
});
test("GIF放宽独立参数，但拒绝尺寸帧数组合造成的超大任务", () => {
  assert.doesNotThrow(() => policy.checkGifWork(640, 360, 60 * 12));
  assert.throws(() => policy.checkGifWork(1920, 1080, 60 * 30), /组合过大/);
  assert.throws(() => policy.checkGifWork(-1, 10, 10));
});
test("文本与PDF放宽后仍检查边界，不静默遗漏内容", () => {
  assert.equal(text.inspectUnicode("x".repeat(6000)).length, 6000);
  assert.throws(() => text.inspectUnicode("x".repeat(100001)), /100000/);
  assert.equal(text.compareTexts("same\n".repeat(20000), "same\n".repeat(20000)).length, 20000);
  assert.equal(pdf.parsePageSelection("1-1000", 1000).length, 1000);
  assert.throws(() => pdf.parsePageSelection("1-1001", 1000), /范围/);
});
test("Blob分块输出支持追加、回写文件头与空隙，不构造整个输出ArrayBuffer", async () => {
  const { createMediaBlobTarget } = loadLocalModule("app/lib/media-blob-target.ts");
  class Target { constructor(writable) { this.writer = writable.getWriter(); } }
  const store = createMediaBlobTarget(Target, 20), writer = store.target.writer;
  await writer.write({ data: new Uint8Array([1, 2, 3, 4]), position: 0 });
  await writer.write({ data: new Uint8Array([9, 8]), position: 1 });
  await writer.write({ data: new Uint8Array([7]), position: 6 });
  await writer.close();
  assert.deepEqual([...new Uint8Array(await store.blob("video/mp4").arrayBuffer())], [1, 9, 8, 4, 0, 0, 7]);
  assert.equal(store.blob("video/mp4").type, "video/mp4");
  store.clear(); assert.equal(store.size, 0);
});
test("Blob分块输出在超预算写入前拒绝，不返回假成功", async () => {
  const { createMediaBlobTarget } = loadLocalModule("app/lib/media-blob-target.ts");
  class Target { constructor(writable) { this.writer = writable.getWriter(); } }
  const store = createMediaBlobTarget(Target, 3);
  await assert.rejects(store.target.writer.write({ data: new Uint8Array(4), position: 0 }), /预算/);
  assert.equal(store.size, 0);
});
test("大结果分页，JSON/对比后台处理，音轨逐段转换，GIF逐张释放", async () => {
  const ui = await readFile(new URL("../app/components/text-workbenches.tsx", import.meta.url), "utf8"), gif = await readFile(new URL("../app/components/images-to-gif.tsx", import.meta.url), "utf8"), extraction = await readFile(new URL("../app/lib/audio-extraction.ts", import.meta.url), "utf8");
  assert.match(ui, /WorkbenchPagination/); assert.match(ui, /runFileWorker/);
  assert.match(extraction, /media\.BlobSource/); assert.match(extraction, /pcm-s16/); assert.doesNotMatch(extraction, /file\.arrayBuffer/);
  assert.match(gif, /activeBitmap\.close/); assert.doesNotMatch(gif, /bitmaps\.push/);
});
test("8K贴图按工作空间检查，低内存设备提前保护；哈希跳过图片解码检查", async () => {
  assert.doesNotThrow(() => policy.checkRasterWork(8192, 8192, 6));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 } });
    assert.equal(policy.audioSampleBudget(), 64_000_000);
    assert.throws(() => policy.checkRasterWork(8192, 8192, 6), /设备预算/);
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator; }
  const drop = await readFile(new URL("../app/components/file-drop-zone.tsx", import.meta.url), "utf8");
  assert.match(drop, /resourceMode !== "stream"/);
  const component = await readFile(new URL("../app/components/video-to-audio.tsx", import.meta.url), "utf8");
  assert.match(component, /source\.computeDuration\(\)/);
});
