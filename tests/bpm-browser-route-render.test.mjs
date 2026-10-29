import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
for (const [path, title, markers] of [
  ["audio-bpm", "音频 BPM 分析", ["开始分析 BPM", "结束时间（秒）", "分析声道", "估算结果"]],
  ["browser-info", "浏览器信息与能力检测", ["解析 User-Agent", "读取当前浏览器", "检查当前环境 API", "不请求权限"]],
]) test(`生产页面 ${path} 输出独立标题与操作，不包含本地路径`, async () => {
  const worker = await loadBuiltWorker(new URL(`../dist/server/index.js?bpm-browser=${path}`, import.meta.url));
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text(); assert.ok(html.includes(`<title>${title} | 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker); assert.doesNotMatch(html, /C:[/\\]Users[/\\]|(?:NEXT_HTTP_ERROR_FALLBACK|INTERNAL_SERVER_ERROR)/);
});
