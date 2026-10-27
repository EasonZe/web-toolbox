import assert from "node:assert/strict";
import test from "node:test";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const observed = (promise) => promise.then((result) => ({ result }), (error) => ({ error }));
const digest = "a".repeat(64);

test("Word 生成沿用进度、Blob 和取消协议，不叠加固定超时", async () => {
  const app = workerClientHarness("app/lib/document-pdf-client.ts"), controller = new AbortController(), progress = [], definition = { content: ["正文"] };
  const pending = app.exports.makePdf(definition, controller.signal, (...args) => progress.push(args)), worker = app.workers[0];
  assert.equal(worker.request, definition); assert.ok(worker.url.pathname.endsWith("document-pdf.worker.ts")); assert.equal(app.timers.size, 0);
  worker.onmessage({ data: { type: "progress", percent: 35, message: "loading" } }); assert.deepEqual(progress, [[35, "loading"]]);
  const blob = new Blob(["pdf"]), receive = worker.onmessage; worker.onmessage({ data: { type: "done", blob } }); assert.equal(await pending, blob);
  receive({ data: { type: "progress", percent: 65, message: "late" } }); assert.equal(progress.length, 1); assert.equal(worker.terminations, 1); assert.equal(worker.onmessage, null);
  const canceled = observed(app.exports.makePdf(definition, controller.signal, () => {})); controller.abort(new Error("outer inactivity timeout"));
  assert.equal((await canceled).error.name, "AbortError"); assert.equal(app.workers[1].terminations, 1);
});

test("Word 异常消息、传输失败和回调异常不悬挂，初始化取消不发送文档", async () => {
  for (const mode of ["empty", "shape", "progress", "result", "error", "transport", "consumer", "construct", "post", "cancel-init"]) {
    const controller = new AbortController(), app = workerClientHarness("app/lib/document-pdf-client.ts", { failLoad: mode === "construct", failPost: mode === "post", construct: () => { if (mode === "cancel-init") controller.abort(); } });
    const outcome = observed(app.exports.makePdf({ content: [] }, controller.signal, () => { if (mode === "consumer") throw new Error("consumer failed"); }));
    const worker = app.workers[0];
    if (mode === "empty") worker.onmessage({ data: null });
    if (mode === "shape") worker.onmessage({ data: {} });
    if (mode === "progress") worker.onmessage({ data: { type: "progress", percent: NaN, message: "bad" } });
    if (mode === "result") worker.onmessage({ data: { type: "done", blob: {} } });
    if (mode === "error") worker.onmessage({ data: { type: "error", message: "generation failed" } });
    if (mode === "transport") worker.onmessageerror();
    if (mode === "consumer") assert.doesNotThrow(() => worker.onmessage({ data: { type: "progress", percent: 35 } }));
    assert.ok((await outcome).error, mode); assert.equal(app.timers.size, 0);
    if (worker) { assert.equal(worker.terminations, 1); assert.equal(worker.onmessage, null); if (mode === "cancel-init") assert.equal(worker.request, undefined); }
  }
});

test("哈希沿用流式文件引用和进度，不添加大文件固定超时，完成校验所选结果", async () => {
  const app = workerClientHarness("app/lib/file-hash-client.ts"), progress = [], file = new File(["abc"], "a.txt"), algorithms = ["SHA-256"];
  file.arrayBuffer = () => assert.fail("client must not read entire file");
  const pending = app.exports.runFileHash(file, algorithms, new AbortController().signal, (...args) => progress.push(args)), worker = app.workers[0];
  assert.equal(worker.request.file, file); assert.equal(worker.request.algorithms, algorithms); assert.equal(app.timers.size, 0); assert.equal(worker.transfer.length, 0);
  worker.onmessage({ data: { type: "progress", loaded: 2, total: 3 } }); assert.deepEqual(progress, [[66, "正在计算…"]]);
  const result = { "SHA-256": digest }; worker.onmessage({ data: { type: "done", results: result } }); assert.equal(await pending, result); assert.equal(worker.terminations, 1);
  const empty = new File([], "empty"), zero = app.exports.runFileHash(empty, algorithms, new AbortController().signal, (n) => assert.equal(n, 0));
  app.workers[1].onmessage({ data: { type: "progress", loaded: 0, total: 0 } }); app.workers[1].onmessage({ data: { type: "done", results: result } }); await zero;
});

test("哈希损坏进度、缺少摘要、传输错误、取消及旧回调不误报成功", async () => {
  const file = new File(["abc"], "a.txt");
  for (const data of [null, {}, { type: "done", results: {} }, { type: "done", results: { "SHA-256": "bad" } }, { type: "progress", loaded: 4, total: 3 }, { type: "progress", loaded: 1, total: NaN }, { type: "progress", loaded: 0, total: 2 }, { type: "error", message: "read failed" }]) {
    const app = workerClientHarness("app/lib/file-hash-client.ts"), pending = observed(app.exports.runFileHash(file, ["SHA-256"], new AbortController().signal, () => {}));
    assert.doesNotThrow(() => app.workers[0].onmessage({ data })); assert.ok((await pending).error); assert.equal(app.workers[0].terminations, 1);
  }
  const app = workerClientHarness("app/lib/file-hash-client.ts"), controller = new AbortController(), pending = observed(app.exports.runFileHash(file, ["SHA-256"], controller.signal, () => {})), receive = app.workers[0].onmessage;
  controller.abort(); receive({ data: { type: "done", results: { "SHA-256": digest } } }); assert.equal((await pending).error.name, "AbortError"); assert.equal(app.workers[0].terminations, 1);
  const next = observed(app.exports.runFileHash(file, ["SHA-256"], new AbortController().signal, () => {})); app.workers[1].onmessageerror(); assert.match((await next).error.message, /读取计算结果/);
  await tick();
});
