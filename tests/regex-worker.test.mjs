import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

function clientHarness() {
  const workers = [], timers = new Map();
  class BrowserWorker {
    constructor(url, options) { this.url = url; this.options = options; this.terminated = false; workers.push(this); }
    postMessage(data) { this.request = data; }
    terminate() { this.terminated = true; }
  }
  const source = readFileSync(new URL("../app/lib/regex-worker-client.ts", import.meta.url), "utf8").replaceAll("import.meta.url", JSON.stringify("https://example.test/app/lib/regex-worker-client.ts"));
  const scope = { exports: {}, URL, Error, Worker: BrowserWorker, require: () => loadLocalModule("app/lib/resource-limits.ts"), setTimeout: (callback, delay) => { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { run: scope.exports.runRegex, workers, timers };
}
const request = { pattern: "a", flags: "g", text: "abc" };
test("正则测试成功、语法报错和 Worker 加载失败均清理线程", async () => {
  for (const mode of ["success", "syntax", "load"]) {
    const harness = clientHarness(), controller = new AbortController(), promise = harness.run(request, controller.signal), worker = harness.workers[0];
    assert.equal(worker.options.type, "module"); assert.deepEqual(worker.request, request);
    if (mode === "success") { worker.onmessage({ data: { result: { matches: [], limited: false } } }); assert.equal((await promise).limited, false); }
    else { if (mode === "syntax") worker.onmessage({ data: { error: "语法错误" } }); else worker.onerror(); await assert.rejects(promise, /语法错误|加载失败/); }
    assert.equal(worker.terminated, true); assert.equal(harness.timers.size, 0);
  }
});
test("正则取消和超时都终止线程，不在主线程重新执行", async () => {
  const cancelled = clientHarness(), controller = new AbortController(), pending = cancelled.run(request, controller.signal);
  controller.abort(new Error("用户取消")); await assert.rejects(pending, /用户取消/);
  assert.equal(cancelled.workers[0].terminated, true); assert.equal(cancelled.timers.size, 0);
  assert.throws(() => cancelled.run(request, controller.signal), /用户取消/); assert.equal(cancelled.workers.length, 1);
  const timed = clientHarness(), timeout = timed.run(request, new AbortController().signal), timer = [...timed.timers.values()][0];
  assert.equal(timer.delay, 5000); timer.callback(); await assert.rejects(timeout, /超过 5 秒/);
  assert.equal(timed.workers[0].terminated, true); assert.equal(timed.timers.size, 0);
});
test("生产正则 Worker 实际匹配，灾难性回溯可通过终止线程解除", { timeout: 15000 }, async (t) => {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url);
  const name = (await readdir(root)).find((name) => /^regex\.worker-.*\.js$/.test(name)); assert.ok(name, "请先运行生产构建");
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    globalThis.self = { postMessage: (data) => parentPort.postMessage(data) };
    import(${JSON.stringify(new URL(name, root).href)}).then(() => {
      parentPort.on("message", data => self.onmessage({ data })); parentPort.postMessage("ready");
    });
  `, { eval: true });
  t.after(() => worker.terminate());
  assert.equal((await once(worker, "message"))[0], "ready");
  const reply = once(worker, "message"); worker.postMessage({ pattern: "(?<name>a+)", flags: "g", text: "aa b a" });
  const result = (await reply)[0].result;
  assert.equal(result.matches.length, 2); assert.equal(result.matches[0].named.name, "aa");
  let answered = false; worker.once("message", () => { answered = true; });
  worker.postMessage({ pattern: "(a+)+$", flags: "", text: "a".repeat(40) + "!" });
  await new Promise((resolve) => setTimeout(resolve, 150)); assert.equal(answered, false);
  const before = Date.now(); await worker.terminate(); assert.ok(Date.now() - before < 5000);
});
