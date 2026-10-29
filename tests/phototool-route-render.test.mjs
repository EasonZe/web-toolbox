import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
for (const [path, title, markers] of [
  ["image-rounded", "图片圆角与边框", ["分别设置四角", "边框位置", "生成 PNG"]],
  ["image-canvas", "图片画布与纯色图", ["透明画布", "图片适配方式", "画布宽度", "图片位置"]],
  ["image-duotone", "图片双色调", ["暗部颜色", "亮部颜色", "双色调强度", "生成效果"]],
  ["image-sharpen", "图片锐化", ["邻域半径", "锐化强度", "细节阈值", "生成效果"]],
]) test(`图片工具生产页面 ${path} 含标题、说明和完整初始控件`, async () => {
  const worker = await loadBuiltWorker();
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text(); assert.ok(html.includes(`<title>${title} | 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /C:[/\\]Users[/\\]|INTERNAL_SERVER_ERROR/);
});
test("图片新控件手机单列与完整标签、44px九宫格触控目标和背景主题一致", async () => {
  const css = await readFile(new URL("../app/styles/additional-utilities.css", import.meta.url), "utf8");
  assert.match(css, /\.photo-effects-fields[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 680px\) \{ \.photo-effects-previews \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.photo-canvas-anchor-grid button[^}]*min-height: 44px/);
  assert.match(css, /\.utility-controls \.photo-canvas-anchor[^}]*var\(--line\)/);
});
