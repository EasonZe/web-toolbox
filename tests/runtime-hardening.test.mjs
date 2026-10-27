import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function workerClient(options = {}) {
  const app = workerClientHarness("app/lib/file-worker-client.ts", options);
  return { ...app, run: app.exports.runFileWorker };
}

test("文件 Worker 反序列化失败即时拒绝并清理，不等 15 分钟超时", async () => {
  const app = workerClient(), controller = new AbortController(), promise = app.run({ action: "json-format", text: "{}", compact: false }, controller.signal);
  const outcome = promise.then((result) => ({ result }), (error) => ({ error }));
  try {
    const worker = app.workers[0]; assert.equal(typeof worker.onmessageerror, "function"); worker.onmessageerror();
    const value = await outcome; assert.match(value.error.message, /读取|消息|传输/); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  } finally { controller.abort(); await outcome; }
});

test("文件 Worker 进度回调异常不会逃出事件处理器，线程和超时仍清理", async () => {
  const app = workerClient(), controller = new AbortController(), promise = app.run({ action: "json-format", text: "{}", compact: false }, controller.signal, () => { throw new Error("progress consumer failed"); });
  const outcome = promise.then((result) => ({ result }), (error) => ({ error }));
  try {
    const worker = app.workers[0]; assert.doesNotThrow(() => worker.onmessage({ data: { progress: 50, status: "working" } }));
    assert.match((await outcome).error.message, /progress consumer failed/); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  } finally { controller.abort(); await outcome; }
});

test("文件 Worker 拒绝空消息、缺失结果和非有限进度，不误报处理成功", async () => {
  for (const data of [null, {}, [], { progress: NaN }, { error: 42 }]) {
    const app = workerClient(), controller = new AbortController(), promise = app.run({ action: "json-format", text: "{}", compact: false }, controller.signal);
    const outcome = promise.then((result) => ({ result }), (error) => ({ error }));
    try {
      assert.doesNotThrow(() => app.workers[0].onmessage({ data }));
      const value = await Promise.race([outcome, tick().then(() => ({ pending: true }))]); assert.ok(value.error, JSON.stringify(data));
      assert.equal(app.workers[0].terminations, 1); assert.equal(app.timers.size, 0);
    } finally { controller.abort(); await outcome; }
  }
});

test("文件 Worker 已结束的迟到事件不再次清理、发进度或改写结果", async () => {
  const app = workerClient(), updates = [], controller = new AbortController(), promise = app.run({ action: "json-format", text: "{}", compact: false }, controller.signal, (n) => updates.push(n));
  const worker = app.workers[0], receive = worker.onmessage, failed = worker.onerror;
  receive({ data: { result: "first" } }); assert.equal(await promise, "first");
  receive({ data: { progress: 75 } }); failed(); controller.abort();
  assert.deepEqual(updates, []); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
});

test("文件 Worker 初始化期间已取消时，不再发送原文件", async () => {
  const controller = new AbortController(), app = workerClient({ construct: () => controller.abort(new Error("already canceled")) });
  const outcome = app.run({ action: "json-format", text: "{}", compact: false }, controller.signal).then((result) => ({ result }), (error) => ({ error }));
  const value = await Promise.race([outcome, tick().then(() => ({ pending: true }))]);
  // Complete the old implementation's fake timer on failure so this test cannot hang.
  if (value.pending) for (const timer of [...app.timers.values()]) timer.callback();
  await outcome; assert.ok(value.error); assert.equal(app.workers[0].request, undefined); assert.equal(app.workers[0].terminations, 1);
});

function pdfRuntime(mode) {
  const canvas = { width: 0, height: 0, getContext: () => mode === "context" ? null : {}, toBlob: (work) => { canvas.complete = work; } };
  let cleaned = 0, rendered = 0, allocated = 0;
  const page = { getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }), render: () => { rendered++; if (mode === "render") throw new Error("sync renderer error"); return { promise: Promise.resolve(), cancel() {} }; }, cleanup: () => cleaned++ };
  const scope = { exports: {}, Error, document: { createElement: () => { allocated++; return canvas; } }, require: (id) => { if (id === "./document-conversion") return { maxPdfPages: 1000 }; throw new Error(id); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/lib/document-pdf.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { render: scope.exports.renderPdfPage, canvas, page, cleaned: () => cleaned, rendered: () => rendered, allocated: () => allocated };
}

test("PDF 画布上下文不可用和 render 同步抛错也释放画布及页面", async () => {
  for (const mode of ["context", "render"]) {
    const app = pdfRuntime(mode); await assert.rejects(app.render({ getPage: async () => app.page }, 1, new AbortController().signal));
    assert.equal(app.cleaned(), 1, mode); assert.equal(app.canvas.width, 0, mode); assert.equal(app.canvas.height, 0, mode);
  }
});

test("PDF PNG 编码阶段取消，不返回迟到的预览结果", async () => {
  const app = pdfRuntime("encode"), controller = new AbortController(), outcome = app.render({ getPage: async () => app.page }, 1, controller.signal).then((result) => ({ result }), (error) => ({ error }));
  await tick(); controller.abort(); app.canvas.complete(new Blob(["late image"]));
  assert.equal((await outcome).error?.name, "AbortError"); assert.equal(app.cleaned(), 1); assert.equal(app.canvas.width, 0);
});

test("PDF 读取页面期间取消后，不创建无用画布或启动渲染", async () => {
  const app = pdfRuntime("page"), controller = new AbortController(); let provide;
  const outcome = app.render({ getPage: () => new Promise((resolve) => provide = resolve) }, 1, controller.signal).then((result) => ({ result }), (error) => ({ error }));
  controller.abort(); provide(app.page); assert.equal((await outcome).error?.name, "AbortError"); assert.equal(app.rendered(), 0); assert.equal(app.allocated(), 0); assert.equal(app.cleaned(), 1);
});

test("PDF 异常尺寸拒绝并释放页面，极端长宽比预览限制最长边而不改变源尺寸", async () => {
  for (const width of [0, NaN, Infinity, -1]) {
    const app = pdfRuntime("invalid"); app.page.getViewport = () => ({ width, height: 100 });
    await assert.rejects(app.render({ getPage: async () => app.page }, 1, new AbortController().signal), /尺寸|比例/);
    assert.equal(app.cleaned(), 1); assert.equal(app.allocated(), 0);
  }
  const app = pdfRuntime("long"); app.page.getViewport = ({ scale }) => ({ width: 100000 * scale, height: 10 * scale });
  const pending = app.render({ getPage: async () => app.page }, 1, new AbortController().signal); await tick();
  assert.ok(app.canvas.width <= 8192); assert.ok(app.canvas.height >= 1);
  app.canvas.complete(new Blob(["png"])); assert.equal((await pending).width, 100000); assert.equal(app.cleaned(), 1);
});
