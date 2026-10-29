import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
const expected = "多功能工具箱\n生活明朗万物可爱\n图片文字识别支持中文 English 123";
const font = fileURLToPath(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url));
const samples = [];
for (const size of [16, 24, 36]) {
  const png = await sharp({ text: { text: expected, font: `Noto Sans SC ${size}`, fontfile: font, rgba: true } }).flatten({ background: "white" }).extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" }).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  samples.push({ size, png, pixels: data, width: info.width, height: info.height });
}
const runner = new Worker(new URL("../tests/helpers/paddle-ocr-runner.mjs", import.meta.url), { workerData: { images: samples } });
let paddle;
try { paddle = await new Promise((resolve, reject) => { runner.once("message", resolve); runner.once("error", reject); }); }
finally { await runner.terminate(); }
if (paddle.error) throw new Error(paddle.error);
const tesseract = await createWorker("eng+chi_sim", 1, { langPath: fileURLToPath(new URL("../public/ocr/7.0.0/data/", import.meta.url)), gzip: false, cacheMethod: "none" });
try {
  for (let i = 0; i < samples.length; i++) {
    const { data } = await tesseract.recognize(samples[i].png, { rotateAuto: true });
    console.log(JSON.stringify({ size: samples[i].size, expected, tesseract: data.text, paddle: paddle.results[i].items.map((item) => item.text).join("\n"), paddleMs: paddle.results[i].metrics.totalMs }));
  }
} finally { await tesseract.terminate(); }
