import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("生产构建保留全部页面访问路径，旧计算器路径继续兼容跳转", { timeout: 60000 }, async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const paths = (await readdir(new URL("../app/", import.meta.url), { recursive: true }))
    .map((path) => path.replaceAll("\\", "/")).filter((path) => /(?:^|\/)page\.tsx$/.test(path))
    .map((path) => `/${path.replace(/(?:^|\/)page\.tsx$/, "")}`);
  assert.ok(paths.length >= 70);
  for (const path of paths) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    }, { waitUntil() {}, passThroughOnException() {} });
    if (path === "/calculator") {
      assert.ok([307, 308].includes(response.status));
      assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/expression-calculator");
    } else {
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), /多功能工具箱/, path);
    }
  }
});
