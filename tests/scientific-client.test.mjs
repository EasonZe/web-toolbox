import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/scientific-client.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source.replace("import.meta.url", '"https://example.test/scientific-client.js"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(options = {}) {
  const workers = [];
  const timers = new Map();
  const exports = {};
  class Worker {
    constructor(url, config) {
      if (options.failLoad) throw new Error("worker unavailable");
      this.url = url; this.config = config; this.terminated = false;
      workers.push(this);
    }
    postMessage(request) { if (options.failPost) throw new Error("cannot send"); this.request = request; }
    terminate() { this.terminated = true; }
  }
  vm.runInNewContext(code, {
    exports, Worker, URL, DOMException,
    setTimeout: (callback, delay) => { const key = Symbol(); timers.set(key, { callback, delay }); return key; },
    clearTimeout: (key) => timers.delete(key),
  });
  return { run: exports.runScientificCalculation, workers, timers };
}
const request = { mode: "statistics", data: "1,2,3" };

test("科学计算通过独立 Worker 返回结果并释放资源", async () => {
  const { run, workers, timers } = client();
  const pending = run(request, new AbortController().signal);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].config.type, "module");
  assert.equal(workers[0].request, request);
  assert.equal([...timers.values()][0].delay, 20000);
  const result = { title: "数据统计", values: [{ label: "数量", value: "3" }] };
  workers[0].onmessage({ data: { result } });
  assert.equal(await pending, result);
  assert.equal(workers[0].terminated, true);
  assert.equal(timers.size, 0);
});

test("取消计算终止 Worker，迟到结果不会覆盖取消状态", async () => {
  const { run, workers, timers } = client();
  const controller = new AbortController();
  const pending = run(request, controller.signal);
  controller.abort();
  workers[0].onmessage({ data: { result: { title: "late" } } });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(workers[0].terminated, true);
  assert.equal(timers.size, 0);
  assert.throws(() => run(request, controller.signal), { name: "AbortError" });
  assert.equal(workers.length, 1);
});

test("超时和引擎报错均结束计算并释放资源", async () => {
  for (const failure of ["timeout", "input", "loading"]) {
    const { run, workers, timers } = client();
    const pending = run(request, new AbortController().signal);
    if (failure === "timeout") [...timers.values()][0].callback();
    else if (failure === "input") workers[0].onmessage({ data: { error: "请检查公式" } });
    else workers[0].onerror();
    await assert.rejects(pending, /超时|检查公式|加载失败/);
    assert.equal(workers[0].terminated, true);
    assert.equal(timers.size, 0);
  }
});

test("浏览器不支持 Worker 或发送失败时不会产生假成功", async () => {
  for (const option of [{ failLoad: true }, { failPost: true }]) {
    const { run, workers, timers } = client(option);
    await assert.rejects(run(request, new AbortController().signal), /worker unavailable|cannot send/);
    assert.equal(timers.size, 0);
    if (workers.length) assert.equal(workers[0].terminated, true);
  }
});
