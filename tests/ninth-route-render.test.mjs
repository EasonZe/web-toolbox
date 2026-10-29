import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
for (const [path, title, markers] of [
  ["gif-extract", "GIF 拆帧与编辑", ["提取 PNG 帧", "帧预览与下载", "起始帧", "背景处理"]],
  ["xml-formatter", "XML 格式化与校验", ["处理 XML", "XML 数据", "仅校验", "不支持 DTD"]],
]) test(`生产页面 ${path} 输出独立标题与表单，不包含本地路径`, async () => {
  const worker = await loadBuiltWorker(new URL(`../dist/server/index.js?ninth=${path}`, import.meta.url));
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text(); assert.match(html, new RegExp(`<title>${title} \\| 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker); assert.doesNotMatch(html, /C:[/\\]Users[/\\]|(?:NEXT_HTTP_ERROR_FALLBACK|INTERNAL_SERVER_ERROR)/);
});
