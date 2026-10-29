import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { mobileLayoutInventory } from "../scripts/mobile-layout-inventory.mjs";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";

test("全部工具在手机和桌面UA下保留页面标题与访问路径（SSR结构，不代替浏览器排版验收）", { timeout: 60000 }, async () => {
  const { tools } = await mobileLayoutInventory(), worker = await loadBuiltWorker();
  for (const userAgent of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"]) {
    for (const { path } of tools) {
      const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz${path}`, { headers: { accept: "text/html", "user-agent": userAgent } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, /<h1[^>]*>.+?<\/h1>/s, path);
      assert.match(html, /name="viewport"/, path);
      assert.match(html, /class="[^"]*tool-shell/, path);
      assert.doesNotMatch(html, /INTERNAL_SERVER_ERROR|C:[/\\]Users[/\\]/, path);
      if (path === "/matrix-calculator") assert.match(html, /class="science-matrix-scroll" role="region"/, path);
    }
  }
});

test("生产CSS实际包含手机防挤压与矩阵滚动规则，而不只检查源码", async () => {
  const root = new URL("../dist/client/", import.meta.url), files = (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".css"));
  const css = (await Promise.all(files.map((name) => readFile(new URL(name.replaceAll("\\", "/"), root), "utf8")))).join("\n");
  for (const marker of [".science-matrix-scroll", ".tool-shell .utility-heading", ".tool-shell .workbench-fields", ".tool-shell .workbench-table th", '.contrast-color-input>input[type=color]']) assert.ok(css.includes(marker), marker);
  assert.match(css, /\.science-matrix-scroll\{[^}]*overflow-x:auto/);
  assert.match(css, /\.tool-shell \.workbench-table th\{[^}]*white-space:nowrap/);
});
