import assert from "node:assert/strict";
import test from "node:test";
import { loadWorker, mockEdgeCache } from "./helpers/load-worker.mjs";

const shared = (mocks) => loadWorker("workers/shared/video-cache.js", mocks);
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test("Worker 缓存合并并发解析，成功后复用内存结果", async () => {
  const { createVideoCache } = shared(), cache = createVideoCache("https://test.example"), ready = deferred();
  let calls = 0; const load = async () => { calls++; await ready.promise; return "value"; };
  const first = cache.resolve("key", load, 30), second = cache.resolve("key", load, 30);
  ready.resolve(); assert.equal((await first).state, "miss"); assert.equal((await second).state, "shared");
  assert.equal((await cache.resolve("key", load, 30)).state, "memory"); assert.equal(calls, 1);
});

test("Worker 缓存后台写入、跨实例边缘命中和强制刷新", async () => {
  const caches = mockEdgeCache(), { createVideoCache } = shared({ caches });
  const jobs = [], context = { waitUntil(job) { jobs.push(job); } };
  let calls = 0; const load = async () => ++calls;
  await createVideoCache("https://test.example").resolve("key", load, 30, context); await Promise.all(jobs);
  const second = createVideoCache("https://test.example");
  assert.equal((await second.resolve("key", load, 30)).state, "edge");
  assert.equal((await second.resolve("key", load, 30, context, { force: true })).value, 2);
  await Promise.all(jobs);
  assert.equal((await createVideoCache("https://test.example").resolve("key", load, 30)).value, 2);
});

test("Worker 缓存不保存失败、零 TTL、无效数据和过大条目", async () => {
  const { createVideoCache } = shared(), cache = createVideoCache("https://test.example"); let calls = 0;
  const fail = async () => { calls++; throw Error("failure"); };
  await assert.rejects(cache.resolve("bad", fail, 30)); await assert.rejects(cache.resolve("bad", fail, 30)); assert.equal(calls, 2);
  const load = async () => ++calls;
  await cache.resolve("zero", load, 0); assert.equal((await cache.resolve("zero", load, 0)).state, "miss");
  await assert.rejects(cache.resolve("invalid", async () => 1, 30, undefined, { validate: () => false }), /INVALID_PARSER_RESULT/);
  const big = async () => "中".repeat(30000);
  await cache.resolve("big", big, 30); assert.equal((await cache.resolve("big", big, 30)).state, "miss");
});

test("Worker 缓存过期、LRU 和并发上限都可控", async () => {
  let now = Date.now(); const FakeDate = class extends Date { static now() { return now; } };
  const { createVideoCache } = shared({ Date: FakeDate }), cache = createVideoCache("https://test.example", { maxEntries: 1, maxPending: 1 });
  const gate = deferred(); const first = cache.resolve("one", async () => { await gate.promise; return 1; }, 1);
  await assert.rejects(cache.resolve("two", async () => 2, 1), (e) => e.code === "PARSER_BUSY"); gate.resolve(); await first;
  now += 1100; assert.equal((await cache.resolve("one", async () => 2, 1)).value, 2);
  await cache.resolve("two", async () => 3, 1); assert.equal((await cache.resolve("one", async () => 4, 1)).state, "miss");
});

test("Worker 缓存强制刷新合并并发任务，不写回已失效结果", async () => {
  const { createVideoCache } = shared(), cache = createVideoCache("https://test.example"), old = deferred(), fresh = deferred();
  const first = cache.resolve("key", async () => { await old.promise; return "old"; }, 30);
  const refresh = cache.resolve("key", async () => { await fresh.promise; return "fresh"; }, 30, undefined, { force: true });
  await Promise.resolve(); await Promise.resolve();
  const joined = cache.resolve("key", async () => { throw Error("duplicate refresh"); }, 30, undefined, { force: true });
  fresh.resolve(); assert.equal((await refresh).value, "fresh"); assert.equal((await joined).value, "fresh");
  old.resolve(); await first; assert.equal((await cache.resolve("key", async () => "wrong", 30)).value, "fresh");
});

test("Worker 播放地址 TTL 受签名有效期和安全余量约束", () => {
  const { mediaCacheSeconds } = shared(), now = 1800000000000;
  assert.equal(mediaCacheSeconds("https://cdn.example/video", 300, now), 300);
  assert.equal(mediaCacheSeconds("https://cdn.example/video?deadline=1800000120", 300, now), 60);
  assert.equal(mediaCacheSeconds("https://cdn.example/video?expires=1800000020", 300, now), 0);
  assert.equal(mediaCacheSeconds(`https://cdn.example/video?wsTime=${(1800000300).toString(16)}`, 300, now), 240);
});

test("Worker 超时与取消会真正发出 AbortSignal", async () => {
  const { withAbortTimeout } = shared(); let aborted = false;
  await assert.rejects(withAbortTimeout((signal) => new Promise(() => { signal.addEventListener("abort", () => { aborted = true; }); }), 10), (e) => e.name === "TimeoutError");
  assert.equal(aborted, true);
  const parent = new AbortController(); let cancelled = false;
  const task = withAbortTimeout((signal) => new Promise(() => { signal.addEventListener("abort", () => { cancelled = true; }); }), 1000, parent.signal);
  await Promise.resolve(); parent.abort(); await assert.rejects(task); assert.equal(cancelled, true);
});

test("Worker Cache API 故障不阻止平台解析", async () => {
  const caches = { default: { match() { throw Error("offline"); }, put() { throw Error("offline"); }, delete() { throw Error("offline"); } } };
  const { createVideoCache } = shared({ caches }); const cache = createVideoCache("https://test.example");
  assert.equal((await cache.resolve("key", async () => 1, 30)).value, 1);
  assert.equal((await cache.resolve("key", async () => 2, 30, undefined, { force: true })).value, 2);
});
