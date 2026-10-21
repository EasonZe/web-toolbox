import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../app/lib/game-asset-client.ts", import.meta.url), "utf8").replaceAll("import.meta.url", '"http://localhost/client.js"');
function setup() {
  const workers = [];
  class Worker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(request) { this.request = request; }
    terminate() { this.terminated = true; }
  }
  const scope = { exports: {}, Worker, URL, Error, setTimeout, clearTimeout };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { run: scope.exports.runAssetWorker, workers };
}
test("资源后台任务传递进度和真实结果，完成时释放 Worker", async () => {
  const { run, workers } = setup(), progress = [];
  const promise = run({ action: "unity-read" }, new AbortController().signal, (...value) => progress.push(value));
  workers[0].onmessage({ data: { type: "progress", progress: 40, status: "reading" } });
  assert.equal(workers[0].terminated, false);
  workers[0].onmessage({ data: { result: { count: 3 } } });
  assert.equal((await promise).count, 3); assert.deepEqual(progress[0], [40, "reading"]); assert.equal(workers[0].terminated, true);
});
test("取消资源处理立即终止 Worker，不接收迟到结果，随后可重试", async () => {
  const { run, workers } = setup(), controller = new AbortController();
  const promise = run({ action: "unity-export" }, controller.signal);
  controller.abort(new Error("已取消处理。"));
  await assert.rejects(promise, /已取消/);
  assert.equal(workers[0].terminated, true);
  workers[0].onmessage({ data: { result: "late" } });
  const retry = run({ action: "unity-export" }, new AbortController().signal);
  workers[1].onmessage({ data: { result: "ok" } });
  assert.equal(await retry, "ok");
});
test("处理错误和引擎加载失败均回收 Worker，不返回伪结果", async () => {
  for (const mode of ["error", "load"]) {
    const { run, workers } = setup(), promise = run({ action: "unity-export" }, new AbortController().signal);
    if (mode === "error") workers[0].onmessage({ data: { error: "bad archive" } }); else workers[0].onerror();
    await assert.rejects(promise); assert.equal(workers[0].terminated, true);
  }
});
