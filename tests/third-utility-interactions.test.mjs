import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import { loadHookComponent, allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const definitions = loadLocalModule("app/lib/extra-tool-options.ts");
const limits = loadLocalModule("app/lib/resource-limits.ts");
const localFiles = loadLocalModule("app/lib/local-files.ts");
function taskMock() {
  return { result: null, error: "", busy: false, status: "", progress: 0, resets: 0,
    reset() { this.result = null; this.error = ""; this.resets++; }, setError(value) { this.error = value; }, cancel() {},
    run(work) { this.pending = (async () => { try { this.result = await work(new AbortController().signal, () => {}); } catch (cause) { this.error = cause.message; } })(); return this.pending; },
  };
}
function mount(path, name) {
  const task = taskMock(), calls = [];
  const component = loadHookComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "../lib/extra-tool-options") return definitions;
    if (id === "../lib/resource-limits") return limits;
    if (id === "../lib/local-files") return localFiles;
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request, signal, report) => { calls.push({ request, signal, report }); return request.action === "images-pdf" ? new Uint8Array([1, 2, 3]) : request.action === "table-convert" ? { text: "[]", rows: 0, columns: 0, preview: [], protectedCells: 0, extension: "json", mime: "application/json" } : "result"; } };
    if (id === "./local-workbench") return { LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useLocalTask: () => task };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
  });
  return { task, calls, component, render: () => component.render() };
}
function button(tree, text) { const result = allElements(tree, (node) => node.type === "button" && node.props.children === text)[0]; assert.ok(result, text); return result; }

test("编码与拼音界面传递真实选项，输入变更清除旧结果", async () => {
  const codec = mount("text-codec", "TextCodec");
  allElements(codec.render(), (n) => n.type === "select")[0].props.onChange({ target: { value: "form" } });
  allElements(codec.render(), (n) => n.type === "text-input")[0].props.onChange("a+b c");
  await button(codec.render(), "解码").props.onClick();
  assert.deepEqual({ ...codec.calls[0].request }, { action: "text-codec", text: "a+b c", mode: "form", direction: "decode" });
  allElements(codec.render(), (n) => n.type === "text-input")[0].props.onChange("new"); assert.equal(codec.task.result, null);
  const app = mount("text-pinyin", "TextPinyin");
  const tone = allElements(app.render(), (n) => n.type === "select" && n.props.value === "symbol")[0]; tone.props.onChange({ target: { value: "num" } });
  const checkbox = allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox"); checkbox[1].props.onChange({ target: { checked: true } });
  await button(app.render(), "转换拼音").props.onClick();
  assert.equal(app.calls[0].request.options.tone, "num"); assert.equal(app.calls[0].request.options.uppercase, true);
});
test("表格界面切换格式和公式保护会清除旧输出，JSON 不显示可用表头开关", async () => {
  const app = mount("table-converter", "TableConverter");
  const input = allElements(app.render(), (n) => n.type === "select" && n.props.value === "csv")[0]; input.props.onChange({ target: { value: "json" } });
  const header = allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox" && n.props.disabled)[0]; assert.ok(header);
  await button(app.render(), "转换表格").props.onClick(); assert.equal(app.calls[0].request.options.input, "json"); assert.equal(app.calls[0].request.options.safeFormulae, true);
  allElements(app.render(), (n) => n.type === "text-input")[0].props.onChange("[]"); assert.equal(app.task.result, null);
});
test("图片 PDF 界面添加、自然排序、移动、删除和导出页序正确", async () => {
  const app = mount("images-to-pdf", "ImagesToPdf");
  allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([new File(["a"], "image10.png"), new File(["b"], "image2.png")]);
  button(app.render(), "按文件名排序").props.onClick();
  let up = allElements(app.render(), (n) => n.type === "button" && n.props["aria-label"] === "上移 image10.png")[0]; assert.equal(up.props.disabled, false); up.props.onClick();
  button(app.render(), "合成 PDF").props.onClick(); await app.task.pending;
  assert.deepEqual(Array.from(app.calls[0].request.files, (file) => file.name), ["image10.png", "image2.png"]);
  assert.ok(app.calls[0].signal instanceof AbortSignal); assert.equal(typeof app.calls[0].report, "function");
  assert.equal(app.task.result.type, "application/pdf");
  const remove = allElements(app.render(), (n) => n.type === "button" && n.props["aria-label"] === "移除 image10.png")[0]; remove.props.onClick(); assert.equal(app.task.result, null);
  button(app.render(), "合成 PDF").props.onClick(); await app.task.pending; assert.equal(app.calls[1].request.files[0].name, "image2.png");
  allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([new File(["bad"], "not.svg")]); assert.match(app.task.error, /图片格式/);
});
test("共享文本导入完整 UTF8，超限明确拒绝且不截断原输入", async () => {
  const task = taskMock(); let value = "original";
  const component = loadHookComponent("app/components/text-utility-parts.tsx", "TextUtilityInput", (id) => {
    if (id === "./local-workbench") return { LocalUpload: "upload", TaskFeedback: "feedback", useLocalTask: () => task };
    if (id === "../lib/local-files") return localFiles;
  });
  const render = () => component.render({ text: value, onChange: (text) => { value = text; }, limit: 5 });
  await allElements(render(), (n) => n.type === "upload")[0].props.onFiles([new File(["中文😀"], "in.txt")]); assert.equal(value, "中文😀");
  await allElements(render(), (n) => n.type === "upload")[0].props.onFiles([new File(["too long"], "in.txt")]); assert.equal(value, "中文😀"); assert.match(task.error, /未截断/);
});
test("文件 Worker 进度不提前结束，成功、失败、取消及超时都清理线程", async () => {
  const workers = [], timers = new Map();
  class BrowserWorker { constructor() { workers.push(this); } postMessage(value) { this.request = value; } terminate() { this.terminated = true; } }
  const source = readFileSync(new URL("../app/lib/file-worker-client.ts", import.meta.url), "utf8").replaceAll("import.meta.url", '"https://example.test/client.ts"');
  const scope = { exports: {}, Error, URL, Worker: BrowserWorker, setTimeout(fn, ms) { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  for (const kind of ["success", "error", "cancel", "timeout", "load"]) {
    const controller = new AbortController(), updates = [];
    const promise = scope.exports.runFileWorker({ action: "images-pdf", files: [] }, controller.signal, (...args) => updates.push(args));
    const worker = workers.at(-1); worker.onmessage({ data: { progress: 50, status: "第二页" } });
    assert.equal(updates[0][0], 50); assert.equal(worker.terminated, undefined);
    if (kind === "success") { worker.onmessage({ data: { result: "done" } }); assert.equal(await promise, "done"); }
    else {
      if (kind === "error") worker.onmessage({ data: { error: "bad" } });
      if (kind === "cancel") controller.abort(new Error("cancelled"));
      if (kind === "load") worker.onerror();
      if (kind === "timeout") { const timer = [...timers.values()][0]; assert.equal(timer.ms, 900000); timer.fn(); }
      await assert.rejects(promise);
    }
    assert.equal(worker.terminated, true); assert.equal(timers.size, 0);
  }
});
