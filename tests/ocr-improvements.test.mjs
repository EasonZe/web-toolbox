import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const { tidyChineseOcrSpacing, paddleOcrResult } = loadLocalModule("app/lib/ocr-text.ts");
const { ocrImageLayout, prepareOcrImage, defaultOcrImageOptions } = loadLocalModule("app/lib/ocr-image.ts");

test("中文单空格整理保留原始英文、代码缩进、多空格与换行，不补猜文字", () => {
  const input = '多 功能 工具 箱\n  生 活 明朗， 万物 可 爱。\r\nHello world 123\n  const apiKey = "abc def";\n姓名    张三\n中\t文\n中\u00a0文';
  assert.equal(tidyChineseOcrSpacing(input), '多功能工具箱\n  生活明朗，万物可爱。\r\nHello world 123\n  const apiKey = "abc def";\n姓名    张三\n中\t文\n中\u00a0文');
  assert.equal(tidyChineseOcrSpacing(tidyChineseOcrSpacing(input)), tidyChineseOcrSpacing(input));
});
test("真实 Paddle 行结构转换保留原始文字，不把平均模型分数当准确率", () => {
  const poly = [[0, 0], [20, 0], [20, 10], [0, 10]];
  const result = paddleOcrResult([{ text: "中文 原始", score: 0.9, poly }, { text: "English 123", score: 0.7, poly }]);
  assert.equal(result.text, "中文 原始\nEnglish 123"); assert.equal(result.confidence, 80); assert.equal(result.lines.length, 2);
  assert.equal(paddleOcrResult([]).confidence, 0);
  for (const value of [{ text: 1, score: 0.9, poly }, { text: "x", score: Infinity, poly }, { text: "x", score: 2, poly }, { text: "x", score: 1, poly: [{ x: 0, y: 0 }] }, { text: "x", score: 1, poly: [[NaN, 0], ...poly.slice(1)] }]) assert.throws(() => paddleOcrResult([value]), /无效/);
  assert.throws(() => paddleOcrResult(Array(2001).fill({ text: "x", score: 1, poly })), /文字行/);
});
test("OCR 选区先裁后放大、旋转与设备预算不生成越界或超预算画布", () => {
  const options = { ...defaultOcrImageOptions, left: 10, top: 20, width: 50, height: 40, rotation: 90 };
  assert.deepEqual(ocrImageLayout(1000, 500, options, false), { x: 100, y: 100, cropWidth: 500, cropHeight: 200, width: 400, height: 1000, scale: 2 });
  for (const constrained of [false, true]) {
    const value = ocrImageLayout(10000, 10000, defaultOcrImageOptions, constrained);
    assert.ok(value.width * value.height <= (constrained ? 8_000_000 : 16_000_000)); assert.ok(Math.max(value.width, value.height) <= 6000);
  }
  for (const invalid of [{ left: -1 }, { width: 0 }, { top: 90, height: 20 }, { rotation: 45 }, { scale: 4 }, { filter: "bad" }, { width: NaN }]) assert.throws(() => ocrImageLayout(100, 100, { ...defaultOcrImageOptions, ...invalid }), /无效/);
});
test("OCR 实际 Canvas 裁切、旋转、透明铺白、反色与异常清理", async (t) => {
  const saved = ["document", "createImageBitmap", "ImageData"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]), canvases = []; let closed = 0;
  globalThis.document = { createElement(name) { assert.equal(name, "canvas"); const canvas = createCanvas(1, 1); canvases.push(canvas); return canvas; } };
  globalThis.ImageData = ImageData;
  globalThis.createImageBitmap = async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => closed++; return image; };
  t.after(() => { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const png = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 0, 0]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer(), file = new File([png], "sample.png");
  const result = await prepareOcrImage(file, { ...defaultOcrImageOptions, scale: 1, rotation: 90 }, new AbortController().signal);
  assert.equal(result.image.width, 1); assert.equal(result.image.height, 2); assert.deepEqual([...result.image.data], [255, 0, 0, 255, 255, 255, 255, 255]);
  const inverted = await prepareOcrImage(file, { ...defaultOcrImageOptions, scale: 1, left: 50, width: 50, filter: "invert" }, new AbortController().signal);
  assert.deepEqual([...inverted.image.data], [0, 0, 0, 255]);
  await assert.rejects(prepareOcrImage(file, { ...defaultOcrImageOptions, width: 0 }, new AbortController().signal));
  assert.equal(closed, 3); assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
  const controller = new AbortController(); controller.abort(); await assert.rejects(prepareOcrImage(file, defaultOcrImageOptions, controller.signal)); assert.equal(closed, 3);
});
test("Paddle 像素移交不复制，成功、取消、超时、反序列化失败和迟到消息都只清理一次", async () => {
  for (const mode of ["success", "cancel", "timeout", "message"]) {
    const app = workerClientHarness("app/lib/paddle-ocr-client.ts"), controller = new AbortController(), image = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
    const result = app.exports.recognizeWithPaddle(image, controller.signal, () => {}), worker = app.workers[0], late = worker.onmessage;
    assert.equal(worker.transfer[0], image.data.buffer); assert.equal(worker.request.pixels, image.data);
    if (mode === "success") { worker.emit({ result: { text: "中文" } }); assert.equal((await result).text, "中文"); }
    else { if (mode === "cancel") controller.abort(); else if (mode === "timeout") [...app.timers.values()][0].callback(); else worker.onmessageerror(); await assert.rejects(result); }
    late({ data: { result: { text: "old" } } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
});
