import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => allElements(tree, (node) => node.type === "button" && content(node) === title)[0];
function control(tree, label) {
  const node = allElements(tree, (node) => node.type === "label" && content(node.props.children[0]) === label)[0];
  assert.ok(node, label); return allElements(node, (node) => ["input", "select"].includes(node.type))[0];
}
const gifInfo = { width: 30, height: 20, frames: 350, duration: 7000 };
const gifResult = { ...gifInfo, images: [2, 4].map((frame) => ({ frame, delay: 20, name: `frame-${frame}.png`, blob: new Blob([String(frame)]) })), zip: new Blob(["zip"]) };
const byAria = (tree, label) => allElements(tree, (node) => node.props?.["aria-label"] === label)[0];
function fixture(name, worker, editWorker) {
  let slot = 0; const tasks = [], calls = [];
  function task() {
    let generation = 0, controller;
    return { result: null, busy: false, error: "", setError(value) { this.error = value; }, reset() { controller?.abort(); generation++; this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const id = generation; this.busy = true;
      controller = new AbortController();
      this.pending = (async () => { try { const result = await work(controller.signal, () => {}); if (id !== generation) return; this.result = result; return result; } catch (error) { if (id === generation) this.error = error.message; } finally { if (id === generation) this.busy = false; } })(); return this.pending;
    } };
  }
  const app = mountComponent(`app/components/${name}.tsx`, name === "gif-extract" ? "GifExtract" : "XmlFormatter", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[slot++] ??= task(); }, TaskFeedback: "feedback", LocalUpload: "upload", LocalDownload: "download", useBlobUrl: (blob) => blob ? "blob:current" : "" };
    if (id === "../lib/file-worker-client") return { runFileWorker(request) { calls.push(request); return worker ? worker(request) : request.action === "xml-process" ? loadLocalModule("app/lib/xml-formatter.ts").processXml(request.text, request.options) : Promise.resolve(request.action === "gif-inspect" ? gifInfo : gifResult); } };
    if (id === "../lib/gif-edit-worker-client") return { runGifEdit(options, signal) { calls.push({ action: "gif-edit", options, signal }); return editWorker ? editWorker(options, signal) : Promise.resolve({ blob: new Blob(["gif"], { type: "image/gif" }), width: options.width, height: options.height, frames: options.frames.length, duration: 70, quantizedFrames: 0 }); } };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, tasks, calls, render() { slot = 0; const tree = app.render(); app.flushEffects(); return tree; } };
}
test("GIF 编辑时间轴重排、延迟、勾选、删除及循环按当前配置导出，旧PNG功能保留", async () => {
  const app = fixture("gif-extract"); await one(app.render(), "upload").props.onFiles([new File(["gif"], "test.gif")]);
  await button(app.render(), "提取 PNG 帧").props.onClick();
  const up = byAria(app.render(), "上移原第 4 帧"); assert.ok(up, JSON.stringify(allElements(app.render(), (node) => node.props?.["aria-label"]).map((node) => node.props["aria-label"]))); up.props.onClick();
  byAria(app.render(), "原第 4 帧延迟（ms）").props.onChange({ target: { value: "70" } });
  control(app.render(), "循环").props.onChange({ target: { value: "finite" } }); control(app.render(), "循环扩展计数").props.onChange({ target: { value: "3" } });
  button(app.render(), "导出编辑 GIF").props.onClick(); await app.tasks[2].pending;
  const request = app.calls.findLast((call) => call.action === "gif-edit"); assert.deepEqual(request.options.frames.map((row) => row.frame), [4, 2]); assert.deepEqual(request.options.frames.map((row) => row.delay), [70, 20]); assert.equal(request.options.repeat, 3);
  assert.ok(allElements(app.render(), (node) => node.type === "download" && node.props.title === "下载编辑后的 GIF").length);
  byAria(app.render(), "导出原第 2 帧").props.onChange({ target: { checked: false } }); assert.equal(app.tasks[2].result, null);
  button(app.render(), "导出编辑 GIF").props.onClick(); await app.tasks[2].pending; assert.equal(app.calls.at(-1).options.frames.length, 1);
  byAria(app.render(), "删除原第 4 帧").props.onClick(); assert.equal(button(app.render(), "导出编辑 GIF").props.disabled, true);
  button(app.render(), "恢复提取时的帧序与延迟").props.onClick(); assert.equal(byAria(app.render(), "原第 4 帧延迟（ms）").props.value, "20");
  control(app.render(), "统一延迟（ms）").props.onChange({ target: { value: "1" } }); button(app.render(), "应用到勾选帧").props.onClick(); assert.match(app.tasks[2].error, /延迟/);
  assert.ok(one(app.render(), "download")); app.unmount();
});
test("编辑GIF导出中换参数或清空会取消，迟到结果不回填", async () => {
  let resolve; const app = fixture("gif-extract", undefined, () => new Promise((done) => { resolve = done; }));
  await one(app.render(), "upload").props.onFiles([new File(["gif"], "test.gif")]); await button(app.render(), "提取 PNG 帧").props.onClick();
  button(app.render(), "导出编辑 GIF").props.onClick(); const pending = app.tasks[2].pending;
  for (let tick = 0; tick < 20 && !resolve; tick++) await Promise.resolve(); assert.equal(typeof resolve, "function");
  const request = app.calls.findLast((call) => call.action === "gif-edit"); control(app.render(), "循环").props.onChange({ target: { value: "once" } }); assert.equal(request.signal.aborted, true);
  resolve({ blob: new Blob(["late"]) }); await pending; assert.equal(app.tasks[2].result, null);
  button(app.render(), "清空").props.onClick(); assert.equal(byAria(app.render(), "GIF 编辑帧列表"), undefined); app.unmount();
});
test("XML 界面按当前规则处理，输入/参数变化清除结果，错误可恢复", async () => {
  const app = fixture("xml-formatter");
  one(app.render(), "text-input").props.onChange("<r><item> hello </item></r>");
  button(app.render(), "处理 XML").props.onClick(); await app.tasks[0].pending;
  assert.equal(app.calls[0].options.reflow, false); assert.match(one(app.render(), "text-result").props.text, / hello /);
  allElements(app.render(), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); assert.equal(one(app.render(), "text-result"), undefined);
  control(app.render(), "缩进").props.onChange({ target: { value: "4" } }); button(app.render(), "处理 XML").props.onClick(); await app.tasks[0].pending; assert.match(one(app.render(), "text-result").props.text, /\n    <item/);
  control(app.render(), "处理方式").props.onChange({ target: { value: "validate" } }); assert.equal(control(app.render(), "缩进").props.disabled, true);
  button(app.render(), "处理 XML").props.onClick(); await app.tasks[0].pending; assert.equal(one(app.render(), "text-result").props.text, "<r><item> hello </item></r>");
  one(app.render(), "text-input").props.onChange("<r>"); button(app.render(), "处理 XML").props.onClick(); await app.tasks[0].pending; assert.match(app.tasks[0].error, /XML 第/); assert.equal(one(app.render(), "text-result"), undefined);
  button(app.render(), "清空").props.onClick(); assert.equal(one(app.render(), "text-input").props.text, ""); assert.equal(app.tasks[0].error, ""); app.unmount();
});
test("GIF 导入自动计算范围与间隔、传递设置、逐帧预览下载并清理旧结果", async () => {
  const app = fixture("gif-extract"), file = new File(["GIF"], "test.gif");
  await one(app.render(), "upload").props.onFiles([file]);
  assert.equal(control(app.render(), "结束帧").props.value, "350"); assert.equal(control(app.render(), "每隔几帧提取").props.value, "2");
  control(app.render(), "起始帧").props.onChange({ target: { value: "2" } }); control(app.render(), "结束帧").props.onChange({ target: { value: "4" } });
  button(app.render(), "提取 PNG 帧").props.onClick(); await app.tasks[1].pending;
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[1].options)), { start: 2, end: 4, step: 2, background: "transparent" });
  assert.equal(one(app.render(), "img").props.alt, "GIF 第 2 帧完整画面");
  assert.equal(button(app.render(), "上一帧").props.disabled, true);
  button(app.render(), "下一帧").props.onClick(); assert.equal(one(app.render(), "img").props.alt, "GIF 第 4 帧完整画面");
  assert.equal(allElements(app.render(), (node) => node.type === "download" && node.props.title === "下载当前帧")[0].props.name, "frame-4.png");
  control(app.render(), "背景处理").props.onChange({ target: { value: "file" } }); assert.equal(one(app.render(), "img"), undefined);
  const uploadKey = one(app.render(), "upload").key; button(app.render(), "清空").props.onClick(); assert.notEqual(one(app.render(), "upload").key, uploadKey); assert.equal(button(app.render(), "提取 PNG 帧").props.disabled, true); app.unmount();
});
test("GIF 旧导入在清空、换文件或卸载后不会回填，新解析失败不保留旧文件", async () => {
  const pending = []; const app = fixture("gif-extract", () => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = one(app.render(), "upload").props.onFiles([new File(["a"], "old.gif")]);
  button(app.render(), "清空").props.onClick(); pending[0].resolve(gifInfo); await first;
  assert.equal(button(app.render(), "提取 PNG 帧").props.disabled, true);
  const second = one(app.render(), "upload").props.onFiles([new File(["b"], "old2.gif")]);
  const third = one(app.render(), "upload").props.onFiles([new File(["c"], "new.gif")]);
  pending[2].resolve({ ...gifInfo, frames: 10 }); await third; pending[1].resolve(gifInfo); await second;
  assert.equal(control(app.render(), "结束帧").props.value, "10"); assert.match(content(app.render()), /new.gif/); assert.doesNotMatch(content(app.render()), /old2.gif/);
  const failed = one(app.render(), "upload").props.onFiles([new File(["bad"], "bad.gif")]); pending[3].reject(new Error("GIF 损坏")); await failed; assert.equal(button(app.render(), "提取 PNG 帧").props.disabled, true); assert.match(app.tasks[0].error, /损坏/);
  const last = one(app.render(), "upload").props.onFiles([new File(["last"], "last.gif")]); app.unmount(); pending[4].resolve(gifInfo); await last; assert.equal(button(app.render(), "提取 PNG 帧").props.disabled, true);
});
test("XML 超时和 GIF 取消终止真实共享线程客户端，迟到结果不提交", async () => {
  for (const action of ["xml-process", "gif-inspect", "gif-extract"]) {
    const app = workerClientHarness("app/lib/file-worker-client.ts"), controller = new AbortController();
    const result = app.exports.runFileWorker({ action }, controller.signal), worker = app.workers[0], late = worker.onmessage;
    assert.equal([...app.timers.values()][0].delay, action === "xml-process" ? 30000 : 900000);
    if (action === "xml-process") [...app.timers.values()][0].callback(); else controller.abort();
    await assert.rejects(result); late({ data: { result: "late" } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
});
test("新增表单复用桌面双列/手机单列，GIF 范围和预览有窄屏规则", async () => {
  const css = await readFile(new URL("../app/styles/additional-utilities.css", import.meta.url), "utf8");
  assert.match(css, /\.gif-extract-range[^}]*minmax\(0, 1fr\)/); assert.match(css, /@media \(max-width: 680px\)[^}]*\.gif-extract-range[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  for (const name of ["gif-extract", "xml-formatter"]) { const app = fixture(name); assert.equal(one(app.render(), "shell").props.className, "additional-utilities"); assert.ok(allElements(app.render(), (node) => node.props?.className === "utility-columns").length); app.unmount(); }
});
