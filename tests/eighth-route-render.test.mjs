import assert from "node:assert/strict";
import test from "node:test";

for (const [path, title, markers] of [
  ["json-pointer", "JSON 路径提取", ["提取数据", "JSON Pointer", "RFC 6901", "提取路径"]],
  ["text-digest", "文本哈希与 HMAC", ["计算摘要", "SHA-512", "Web Crypto", "UTF-8 文本"]],
  ["easing-curve", "CSS 缓动曲线", ["播放预览", "停止并复位", "cubic-bezier", "缓动预设"]],
]) test(`生产页面 ${path} 输出独立标题与可用表单，不包含本地路径`, async () => {
  const { default: worker } = await import(new URL(`../dist/server/index.js?eighth=${path}`, import.meta.url));
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, new RegExp(`<title>${title} \\| 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /C:[/\\]Users[/\\]|(?:NEXT_HTTP_ERROR_FALLBACK|INTERNAL_SERVER_ERROR)/);
});
