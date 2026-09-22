import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [douyin, kuaishou, douyinConfig, kuaishouConfig] = await Promise.all([
  read("workers/eason-daoyin-api/src/index.js"),
  read("workers/eason-kuaishou-api/src/index.js"),
  read("workers/eason-daoyin-api/wrangler.jsonc"),
  read("workers/eason-kuaishou-api/wrangler.jsonc"),
]);
const { resolveVideo: resolveKuaishouVideo } = await import(
  new URL("../workers/eason-kuaishou-api/src/index.js", import.meta.url)
);

test("抖音 Worker 仅访问抖音公开页面、官方播放器和媒体域名", () => {
  assert.match(douyin, /www\.iesdouyin\.com\/share\/video/);
  assert.match(douyin, /open\.douyin\.com\/player\/video/);
  assert.match(douyin, /env\.BROWSER/);
  assert.match(douyin, /request\.method === "HEAD" \? null : mediaResponse\.body/);
  assert.doesNotMatch(douyin, /api\.bugpk\.com|api\.qster\.top|第三方解析/);
  assert.match(douyinConfig, /"binding": "BROWSER"/);
});

test("快手 Worker 直接解析公开分享页且不调用第三方解析服务", () => {
  assert.match(kuaishou, /v\.m\.chenzhongtech\.com/);
  assert.match(kuaishou, /window\.INIT_STATE/);
  assert.match(kuaishou, /request\.method === "HEAD" \? null : mediaResponse\.body/);
  assert.doesNotMatch(
    kuaishou,
    /api\.bugpk\.com|api\.qster\.top|BUGPK|QSTER|resolveWith.*Resolver|RESOLVER_KEY/i,
  );
  assert.match(kuaishouConfig, /"name": "eason-kuaishou-api"/);
});

test("快手作品解析只请求平台公开分享页", async () => {
  const requests = [];
  const state = {
    detail: {
      photo: {
        photoId: "abcDEF123",
        caption: "公开作品",
        userName: "测试作者",
        width: 1080,
        height: 1920,
        mainMvUrls: [{ url: "https://video.kwaicdn.com/example.mp4" }],
      },
    },
  };
  const fetchImpl = async (url) => {
    requests.push(String(url));
    return new Response(
      `<script>window.INIT_STATE = ${JSON.stringify(state)};</script>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  };

  const result = await resolveKuaishouVideo(
    "https://www.kuaishou.com/short-video/abcDEF123",
    fetchImpl,
  );

  assert.deepEqual(requests, ["https://v.m.chenzhongtech.com/fw/photo/abcDEF123"]);
  assert.equal(result.video.title, "公开作品");
  assert.equal(result.playback.mediaUrl, "https://video.kwaicdn.com/example.mp4");
});
