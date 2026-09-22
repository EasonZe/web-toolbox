import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [douyin, douyinConfig] = await Promise.all([
  read("workers/eason-daoyin-api/src/index.js"),
  read("workers/eason-daoyin-api/wrangler.jsonc"),
]);

test("抖音 Worker 仅访问抖音公开页面、官方播放器和媒体域名", () => {
  assert.match(douyin, /www\.iesdouyin\.com\/share\/video/);
  assert.match(douyin, /open\.douyin\.com\/player\/video/);
  assert.match(douyin, /env\.BROWSER/);
  assert.match(douyin, /request\.method === "HEAD" \? null : mediaResponse\.body/);
  assert.doesNotMatch(douyin, /api\.bugpk\.com|api\.qster\.top|第三方解析/);
  assert.match(douyinConfig, /"binding": "BROWSER"/);
});
