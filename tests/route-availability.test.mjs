import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";

test("生产构建保留全部页面访问路径，旧计算器路径继续兼容跳转", { timeout: 60000 }, async () => {
  const worker = await loadBuiltWorker(new URL("../dist/server/index.js", import.meta.url));
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

test("Node SSR 适配只关闭可选 tracing，不伪造 env 或其他平台模块", async () => {
  await loadBuiltWorker();
  assert.deepEqual(Object.keys(await import("cloudflare:workers")), []);
  await assert.rejects(import('data:text/javascript,import%20%7Benv%7D%20from%20%22cloudflare%3Aworkers%22%3Bexport%20default%20env%3B'), /does not provide an export named 'env'/);
  await assert.rejects(import("cloudflare:unsupported-test-module"), { code: "ERR_UNSUPPORTED_ESM_URL_SCHEME" });
});
