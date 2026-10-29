import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
for (const [path, title, markers] of [
  ["texture-memory", "贴图显存估算", ["纹理格式", "Mipmap", "计算纹理数据量"]],
  ["font-preview", "本地字体预览", ["字号（px）", "清空字体", "不安装字体"]],
  ["id-photo", "证件照制作与排版", ["生成单张证件照", "启用本地人像抠图", "生成相纸排版", "打印 DPI"]],
  ["image-ocr", "图片文字识别 OCR", ["PaddleOCR", "Tesseract", "整理当前中文间距", "范围与图像处理", "识别语言"]],
]) test(`生产页面 ${path} 保留独立标题与当前功能`, async () => {
  const worker = await loadBuiltWorker(new URL(`../dist/server/index.js?ocr-photo=${path}`, import.meta.url));
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text(); assert.ok(html.includes(`<title>${title} | 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker); assert.doesNotMatch(html, /C:[/\\]Users[/\\]|INTERNAL_SERVER_ERROR/);
});
test("新增布局使用主题变量与手机单列，不改变电脑端卡片交互", async () => {
  const css = await readFile(new URL("../app/styles/additional-utilities.css", import.meta.url), "utf8");
  for (const className of ["font-preview-settings", "texture-number-grid", "id-photo-number-grid", "ocr-option-grid", "gif-edit-settings"]) assert.match(css, new RegExp(`\\.${className}[^{}]*\\{[^}]*grid-template-columns: minmax\\(0, 1fr\\)`));
  assert.match(css, /\.ocr-source-image > span[^}]*pointer-events: none/); assert.match(css, /\.id-photo-preview > img[^}]*object-fit: cover/);
});
