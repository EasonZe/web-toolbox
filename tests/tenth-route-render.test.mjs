import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
for (const [path, title, markers] of [
  ["duplicate-files", "重复文件检查", ["开始检查重复文件", "逐字节确认", "只读检查", "检查结果"]],
  ["pdf-scan", "PDF 转扫描件", ["生成图片型 PDF", "原彩", "灰度", "不是安全脱敏"]],
]) test(`生产页面 ${path} 输出标题与表单，不包含本地路径`, async () => {
  const worker = await loadBuiltWorker(new URL(`../dist/server/index.js?tenth=${path}`, import.meta.url));
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text(); assert.match(html, new RegExp(`<title>${title} \\| 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker); assert.doesNotMatch(html, /C:[/\\]Users[/\\]|(?:NEXT_HTTP_ERROR_FALLBACK|INTERNAL_SERVER_ERROR)/);
});
