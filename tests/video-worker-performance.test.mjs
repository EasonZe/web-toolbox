import assert from "node:assert/strict";
import test from "node:test";
import { loadWorker, mockEdgeCache } from "./helpers/load-worker.mjs";

const biliPath = "workers/eason-bilibili-api/src/index.ts", douyinPath = "workers/eason-daoyin-api/src/index.js";
const bv = "BV1pf4y1V7Q8", id = "7126745726494821640";
const json = (data) => Response.json(data);
const workerRequest = (host, input, { path = "/", ...options } = {}) => new Request(`https://${host}${path}?url=${encodeURIComponent(input)}`, options);
const biliRequest = (input = bv, options) => workerRequest("bilibili-api.easonzhan.xyz", input, options);
const douyinRequest = (input = id, options) => workerRequest("douyin-api.easonzhan.xyz", input, options);
const media = (options) => new Response(options.method === "HEAD" ? null : new Uint8Array(8), {
  status: options.headers.get("Range") ? 206 : 200,
  headers: { "Content-Type": "video/mp4", "Content-Length": "8", "Content-Range": "bytes 0-7/1024", "Accept-Ranges": "bytes" },
});
function biliFetch({ stale = false, unsafe = false } = {}) {
  const calls = [], ranges = []; let generation = 0, mediaCalls = 0;
  return { calls, ranges, async fetch(value, options = {}) {
    const url = new URL(value); calls.push(url);
    if (url.hostname === "b23.tv") return new Response(null, { status: 302, headers: { Location: `https://www.bilibili.com/video/${bv}/?p=2` } });
    if (url.pathname.endsWith("pagelist")) return json({ code: 0, data: [{ cid: 11, page: 1, part: "one" }, { cid: 22, page: 2, part: "two" }] });
    if (url.pathname.endsWith("playurl")) { generation++; return json({ code: 0, data: { quality: 64, durl: [{ url: unsafe ? "https://evil.example/video" : `https://cdn.bilivideo.com/video-${generation}.mp4` }] } }); }
    assert.equal(url.hostname, "cdn.bilivideo.com"); ranges.push(options.headers.get("Range")); mediaCalls++;
    if (stale && mediaCalls === 2) return new Response(null, { status: 403 });
    return media(options);
  } };
}
const apiCalls = (mock) => mock.calls.filter((url) => url.hostname === "api.bilibili.com").length;

test("B站元数据与视频 Range 共用解析缓存，并返回耗时标记", async () => {
  const mock = biliFetch(), worker = loadWorker(biliPath, { fetch: mock.fetch }).default;
  const meta = await worker.fetch(biliRequest(bv, { path: "/api/video" })); assert.equal(meta.status, 200);
  const payload = await meta.json(); assert.equal(payload.data.bvid, bv);
  assert.equal(apiCalls(mock), 2); assert.match(meta.headers.get("X-Parser-Cache"), /video:miss/);
  const video = await worker.fetch(biliRequest(bv, { headers: { Range: "bytes=0-7" } })); assert.equal(video.status, 206);
  assert.equal(apiCalls(mock), 2); assert.equal(mock.ranges[0], "bytes=0-7");
  assert.match(video.headers.get("X-Parser-Cache"), /video:memory/); assert.match(video.headers.get("Server-Timing"), /resolve;dur=.*media;dur=/);
  assert.equal(video.headers.get("Content-Range"), "bytes 0-7/1024"); assert.equal((await video.arrayBuffer()).byteLength, 8);
  const head = await worker.fetch(biliRequest(bv, { method: "HEAD" })); assert.equal(head.status, 200); assert.equal(head.body, null);
});

test("B站短链接与分P缓存复用，返回不再跳转的规范播放链接", async () => {
  const mock = biliFetch(), worker = loadWorker(biliPath, { fetch: mock.fetch }).default;
  const input = "https://b23.tv/test";
  const meta = await (await worker.fetch(biliRequest(input, { path: "/api/video" }))).json();
  assert.equal(meta.data.page, 2); assert.equal(meta.data.cid, 22); assert.match(decodeURIComponent(meta.data.video_url), /\?p=2/);
  await worker.fetch(biliRequest(input, { method: "HEAD" })); assert.equal(mock.calls.filter((url) => url.hostname === "b23.tv").length, 1); assert.equal(apiCalls(mock), 2);
  await worker.fetch(biliRequest(`https://www.bilibili.com/video/${bv}/?p=1`, { path: "/api/video" })); assert.equal(apiCalls(mock), 4);
});

test("B站 CDN 地址失效只刷新一次，并继续保留 Range", async () => {
  const mock = biliFetch({ stale: true }), worker = loadWorker(biliPath, { fetch: mock.fetch }).default;
  await worker.fetch(biliRequest());
  const response = await worker.fetch(biliRequest(bv, { headers: { Range: "bytes=0-7" } }));
  assert.equal(response.status, 206); assert.equal(apiCalls(mock), 4); assert.equal(mock.ranges.length, 3);
  assert.equal(mock.ranges[1], mock.ranges[2]); assert.match(response.headers.get("Server-Timing"), /refresh;dur=/);
});

test("B站拒绝恶意输入、非法 Range 和未知媒体主机", async () => {
  const mock = biliFetch({ unsafe: true }), worker = loadWorker(biliPath, { fetch: mock.fetch }).default;
  assert.equal((await worker.fetch(biliRequest(bv, { headers: { Range: "bytes=-" } }))).status, 416); assert.equal(mock.calls.length, 0);
  for (const url of ["https://bilibili.com.evil.example/video/" + bv, "https://user:pass@www.bilibili.com/video/" + bv, "https://www.bilibili.com:8080/video/" + bv]) assert.equal((await worker.fetch(biliRequest(url))).status, 400);
  assert.equal((await worker.fetch(biliRequest())).status, 502); assert.equal(mock.ranges.length, 0);
});

test("B站 socket 完整响应后立即结束，不等对端关闭连接", async () => {
  let fetches = 0, sockets = 0, closed = 0;
  const connect = () => {
    sockets++; let controller;
    return { opened: Promise.resolve(), readable: new ReadableStream({ start(value) { controller = value; } }),
      writable: new WritableStream({ write(bytes) {
        const request = new TextDecoder().decode(bytes);
        const body = JSON.stringify(request.includes("pagelist") ? { code: 0, data: [{ cid: 11, page: 1 }] } : { code: 0, data: { durl: [{ url: "https://cdn.bilivideo.com/video.mp4" }] } });
        controller.enqueue(new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Length: ${new TextEncoder().encode(body).length}\r\n\r\n${body}`));
      } }), close() { closed++; return Promise.resolve(); },
    };
  };
  const worker = loadWorker(biliPath, { connect, fetch: async () => { fetches++; return new Response(null, { status: 403 }); }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 300)) }).default;
  const response = await worker.fetch(biliRequest(bv, { path: "/api/video" })); assert.equal(response.status, 200);
  assert.equal(sockets, 2); assert.equal(closed, 2); assert.equal(fetches, 1);
});

test("B站平台响应体超时能取消请求，错误返回 504 而不是悬挂", async () => {
  let aborted = false;
  const worker = loadWorker(biliPath, { setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 30)), fetch: async (_url, options) => new Response(new ReadableStream({ start(controller) { options.signal.addEventListener("abort", () => { aborted = true; controller.error(options.signal.reason); }); } })) }).default;
  const response = await worker.fetch(biliRequest(bv, { path: "/api/video" })); assert.equal(response.status, 504); assert.equal(aborted, true);
});

function douyinPage(playUrl = "https://cdn.douyinvod.com/playwm/") {
  return new Response(`<script>window._ROUTER_DATA = ${JSON.stringify({ loaderData: { "video_(id)/page": { videoInfoRes: { item_list: [{ aweme_id: id, desc: "Test", video: { play_addr: { url_list: [playUrl] } } }] } } } })}</script>`);
}
function douyinFetch() {
  const calls = [], ranges = [], ifRanges = []; let stale = false;
  return { calls, ranges, ifRanges, setStale() { stale = true; }, async fetch(value, options = {}) {
    const url = new URL(value); calls.push(url);
    if (url.hostname === "v.douyin.com") return new Response(null, { status: 302, headers: { Location: `https://www.douyin.com/video/${id}` } });
    if (url.hostname === "www.iesdouyin.com") return douyinPage();
    assert.equal(url.hostname, "cdn.douyinvod.com"); assert.equal(url.pathname, "/play/");
    ranges.push(options.headers.get("range")); ifRanges.push(options.headers.get("if-range"));
    if (stale) { stale = false; return new Response(null, { status: 403 }); }
    return media(options);
  } };
}

test("抖音短链接、页面与视频缓存复用，HEAD 和 If-Range 正确转发", async () => {
  const mock = douyinFetch(), worker = loadWorker(douyinPath, { fetch: mock.fetch, caches: mockEdgeCache() }).default;
  const input = "https://v.douyin.com/test";
  const api = await worker.fetch(douyinRequest(input, { path: "/api/video" })); assert.equal(api.status, 200);
  assert.match(decodeURIComponent((await api.json()).data.video_url), new RegExp(`url=${id}`));
  const video = await worker.fetch(douyinRequest(input, { headers: { Range: "bytes=0-7", "If-Range": '"tag"' } })); assert.equal(video.status, 206);
  const head = await worker.fetch(douyinRequest(input, { method: "HEAD" })); assert.equal(head.body, null); assert.equal(head.status, 200);
  assert.equal(mock.calls.filter((url) => url.hostname === "v.douyin.com").length, 1);
  assert.equal(mock.calls.filter((url) => url.hostname === "www.iesdouyin.com").length, 1);
  assert.match(head.headers.get("X-Parser-Cache"), /video:memory/); assert.equal(mock.ifRanges[0], '"tag"'); assert.equal(mock.ranges[0], "bytes=0-7");
});

test("抖音并发请求只解析一次，不共享被消耗的视频流", async () => {
  let pages = 0, videos = 0;
  const worker = loadWorker(douyinPath, { fetch: async (value, options) => { if (String(value).includes("iesdouyin.com")) { pages++; await new Promise((r) => setTimeout(r, 10)); return douyinPage(); } videos++; return media(options); } }).default;
  const responses = await Promise.all([worker.fetch(douyinRequest()), worker.fetch(douyinRequest())]);
  assert.equal(pages, 1); assert.equal(videos, 2); assert.equal((await responses[0].arrayBuffer()).byteLength, 8); assert.equal((await responses[1].arrayBuffer()).byteLength, 8);
});

test("抖音失效缓存刷新一次，非法 Range 不触发解析", async () => {
  const mock = douyinFetch(), worker = loadWorker(douyinPath, { fetch: mock.fetch }).default;
  await worker.fetch(douyinRequest()); mock.setStale(); assert.equal((await worker.fetch(douyinRequest())).status, 200);
  assert.equal(mock.calls.filter((url) => url.hostname === "www.iesdouyin.com").length, 2);
  const before = mock.calls.length; assert.equal((await worker.fetch(douyinRequest(id, { headers: { Range: "bytes=-" } }))).status, 416); assert.equal(mock.calls.length, before);
  assert.equal((await worker.fetch(douyinRequest(`https://user:pass@www.douyin.com/video/${id}`))).status, 400);
});

test("抖音回退只启动一次浏览器，拿到媒体地址后立即结束", async () => {
  let launches = 0, closed = 0, visits = 0;
  const handlers = {};
  const page = { async setUserAgent() {}, async setViewport() {}, async setRequestInterception() {}, on(name, handler) { handlers[name] = handler; },
    async goto() { visits++; handlers.response({ url: () => "https://cdn.douyinvod.com/video.mp4", headers: () => ({ "content-type": "video/mp4" }) }); return { status: () => 200 }; },
    frames: () => [], waitForFunction() { throw Error("Should not wait after a media response"); },
  };
  const worker = loadWorker(douyinPath, { puppeteer: { async launch() { launches++; return { newPage: async () => page, close: async () => { closed++; } }; } }, fetch: async (url, options) => String(url).includes("iesdouyin.com") ? new Response(null, { status: 403 }) : media(options) }).default;
  const response = await worker.fetch(douyinRequest(), { BROWSER: {} }); assert.equal(response.status, 200);
  assert.equal(launches, 1); assert.equal(visits, 1); assert.equal(closed, 1);
  assert.equal((await worker.fetch(douyinRequest(), { BROWSER: {} })).status, 200); assert.equal(launches, 1);
});

test("抖音浏览器回退总超时会关闭浏览器", async () => {
  let closed = 0, rejectVisit;
  const page = { async setUserAgent() {}, async setViewport() {}, async setRequestInterception() {}, on() {}, goto: () => new Promise((_, reject) => { rejectVisit = reject; }) };
  const worker = loadWorker(douyinPath, {
    setTimeout: (fn, ms) => setTimeout(fn, ms === 26000 ? 30 : Math.min(ms, 300)),
    puppeteer: { launch: async () => ({ newPage: async () => page, close: async () => { closed++; rejectVisit?.(Error("closed")); } }) },
    fetch: async () => new Response(null, { status: 403 }),
  }).default;
  const jobs = [];
  const response = await worker.fetch(douyinRequest(), { BROWSER: {} }, { waitUntil(job) { jobs.push(job); } }); assert.equal(response.status, 504);
  await Promise.all(jobs); assert.equal(closed, 1);
});

test("抖音浏览器限流后冷却，不重复启动失败浏览器", async () => {
  let launches = 0;
  const worker = loadWorker(douyinPath, { fetch: async () => new Response(null, { status: 403 }), puppeteer: { async launch() { launches++; throw Error("429 Too many requests"); } } }).default;
  const first = await worker.fetch(douyinRequest(), { BROWSER: {} }); assert.equal(first.status, 429); assert.equal(first.headers.get("Retry-After"), "30");
  assert.equal((await worker.fetch(douyinRequest("7126745726494821641"), { BROWSER: {} })).status, 429); assert.equal(launches, 1);
});

test("抖音不同视频的浏览器并发最多两项，拒绝后释放资源", async () => {
  let launches = 0, closed = 0; const pages = [];
  const worker = loadWorker(douyinPath, { fetch: async () => new Response(null, { status: 403 }), puppeteer: { async launch() {
    launches++; let rejectVisit, cancelled = false;
    const page = { async setUserAgent() {}, async setViewport() {}, async setRequestInterception() {}, on() {}, goto: () => cancelled ? Promise.reject(Error("closed")) : new Promise((_, reject) => { rejectVisit = reject; }) };
    const browser = { newPage: async () => page, async close() { closed++; cancelled = true; rejectVisit?.(Error("closed")); } }; pages.push(browser); return browser;
  } } });
  const env = { BROWSER: {} };
  const tasks = [worker.getVideoMetadata(id, env, undefined, undefined), worker.getVideoMetadata("7126745726494821641", env, undefined, undefined)];
  // Callers do not cancel shared jobs; speed up the test by explicitly closing the mocked sessions.
  await new Promise((r) => setTimeout(r, 15));
  const busy = await worker.default.fetch(douyinRequest("7126745726494821642"), env); assert.equal(busy.status, 503); assert.equal(launches, 2);
  for (const page of pages) await page.close();
  await Promise.allSettled(tasks); assert.ok(closed >= 2);
});

test("抖音平台限流不触发额外浏览器回退", async () => {
  let launches = 0;
  const worker = loadWorker(douyinPath, { fetch: async () => new Response(null, { status: 429 }), puppeteer: { async launch() { launches++; } } }).default;
  const response = await worker.fetch(douyinRequest(), { BROWSER: {} }); assert.equal(response.status, 429); assert.equal(launches, 0);
});

test("B站短链即使跳到带 BV 的路径也不能放行未知主机", async () => {
  let calls = 0;
  const worker = loadWorker(biliPath, { fetch: async () => { calls++; return new Response(null, { status: 302, headers: { Location: `https://evil.example/video/${bv}` } }); } }).default;
  assert.equal((await worker.fetch(biliRequest("https://b23.tv/test"))).status, 400); assert.equal(calls, 1);
});

test("两个 Worker 不把 CDN 的 HTML 当视频返回，首次失败不重复解析", async () => {
  for (const path of [biliPath, douyinPath]) {
    let html = 0; const mock = path === biliPath ? biliFetch() : douyinFetch();
    const worker = loadWorker(path, { fetch: async (url, options) => { if (String(url).includes("cdn.")) { html++; return new Response("<html>blocked</html>", { headers: { "content-type": "text/html" } }); } return mock.fetch(url, options); } }).default;
    const response = await worker.fetch(path === biliPath ? biliRequest() : douyinRequest()); assert.equal(response.status, 502); assert.equal(html, 1);
  }
});
