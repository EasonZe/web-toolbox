import assert from "node:assert/strict";
import test from "node:test";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const limits = loadLocalModule("app/lib/resource-limits.ts");
function task() { return { result: null, error: "", busy: false, progress: 0, status: "", reset() { this.result = null; this.error = ""; }, cancel() {}, setError(value) { this.error = value; }, run(work) { this.reset(); this.pending = (async () => { try { this.result = await work(new AbortController().signal, () => {}); } catch (cause) { this.error = cause.message; } })(); return this.pending; } }; }
function mount(path, name, initial) {
  let cursor = 0; const tasks = [task(), task()], calls = [];
  if (initial) tasks[0].result = initial;
  const component = loadHookComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => tasks[cursor++], LocalUpload: "upload", TaskFeedback: "feedback", LocalDownload: "download", useBlobUrl: (blob) => blob ? "blob:unit-test" : "" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
    if (id === "../lib/resource-limits") return limits;
    if (id === "../lib/color-contrast") return loadLocalModule("app/lib/color-contrast.ts");
    if (id === "../lib/image-grid-plan") return loadLocalModule("app/lib/image-grid-plan.ts");
    if (id === "../lib/image-grid-options") return loadLocalModule("app/lib/image-grid-options.ts");
    if (id === "../lib/pdf-export-options") return loadLocalModule("app/lib/pdf-export-options.ts");
    if (id === "../lib/document-conversion") return loadLocalModule("app/lib/document-conversion.ts");
    if (id === "../lib/local-images") return {};
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request) => { calls.push(request); return request.action === "yaml-convert" ? '{"value":true}' : new Blob(["zip"], { type: "application/zip" }); } };
    if (id === "../lib/pdf-export") return { exportPdf: async (file, options) => { calls.push({ file, options }); return { blob: new Blob(["text"]), text: "text", pages: 2, emptyPages: [], extension: "txt" }; } };
  });
  return { tasks, calls, render() { cursor = 0; return component.render(); } };
}
function button(tree, label) { const found = allElements(tree, (n) => n.type === "button" && n.props.children === label)[0]; assert.ok(found, label); return found; }
function inputOfLabel(tree, label) {
  const node = allElements(tree, (n) => n.type === "label" && Array.isArray(n.props.children) && n.props.children[0] === label)[0];
  assert.ok(node, label); const input = allElements(node, (n) => n.type === "input")[0]; assert.ok(input); return input;
}
test("YAML 方向和缩进传给 Worker，反向转换复用结果，变更输入清除旧输出", async () => {
  const app = mount("yaml-converter", "YamlConverter");
  const indent = allElements(app.render(), (n) => n.type === "select" && n.props.value === 2)[0]; indent.props.onChange({ target: { value: "4" } });
  allElements(app.render(), (n) => n.type === "text-input")[0].props.onChange("value: true");
  button(app.render(), "转换配置").props.onClick(); await app.tasks[0].pending;
  assert.equal(app.calls[0].direction, "yaml-to-json"); assert.equal(app.calls[0].indent, 4);
  button(app.render(), "结果移回输入并反向转换").props.onClick();
  assert.equal(app.tasks[0].result, null); assert.equal(allElements(app.render(), (n) => n.type === "text-input")[0].props.text, '{"value":true}');
  button(app.render(), "转换配置").props.onClick(); await app.tasks[0].pending; assert.equal(app.calls[1].direction, "json-to-yaml");
});
test("对比度 UI 按透明度重新计算，交换颜色，错误输入不保留旧通过结果", () => {
  const app = mount("color-contrast", "ColorContrast");
  const slider = allElements(app.render(), (n) => n.type === "input" && n.props.type === "range")[0]; slider.props.onChange({ target: { value: "0" } });
  const value = allElements(app.render(), (n) => n.type === "output" && n.props.className === "contrast-ratio")[0]; assert.equal(value.props.children[0], "1.000");
  button(app.render(), "交换颜色").props.onClick(); assert.equal(inputOfLabel(app.render(), "文字颜色").props.value, "#FFFFFF");
  inputOfLabel(app.render(), "文字颜色").props.onChange({ target: { value: "invalid" } });
  assert.equal(allElements(app.render(), (n) => n.type === "output" && n.props.className === "contrast-ratio").length, 0);
  assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
});
test("网格 UI 切换行列和范围更新预览，导出使用原文件和当前参数", async () => {
  const file = new File(["image"], "original.png");
  const app = mount("image-grid", "ImageGrid", { file, width: 10, height: 7, thumbnail: new Blob(["thumbnail"]) });
  inputOfLabel(app.render(), "列数").props.onChange({ target: { value: "2" } });
  const select = allElements(app.render(), (n) => n.type === "select" && n.props.value === "square-crop")[0]; select.props.onChange({ target: { value: "original" } });
  assert.equal(allElements(app.render(), (n) => n.type === "span" && typeof n.props.children === "number").length, 6);
  button(app.render(), "切分并打包").props.onClick(); await app.tasks[1].pending;
  assert.equal(app.calls[0].file, file); assert.equal(app.calls[0].options.columns, 2); assert.equal(app.calls[0].options.mode, "original");
  inputOfLabel(app.render(), "行数").props.onChange({ target: { value: "0" } });
  assert.equal(app.tasks[1].result, null); assert.equal(button(app.render(), "切分并打包").props.disabled, true);
});
test("PDF UI 导入后传递页码和模式，切换选项或无效文件清除旧结果", async () => {
  const app = mount("pdf-export", "PdfExport"), file = new File(["pdf"], "file.pdf");
  allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([file]);
  inputOfLabel(app.render(), "页码范围").props.onChange({ target: { value: "3,1" } });
  allElements(app.render(), (n) => n.type === "select" && n.props.value === "images")[0].props.onChange({ target: { value: "text" } });
  button(app.render(), "开始导出").props.onClick(); await app.tasks[0].pending;
  assert.equal(app.calls[0].file, file); assert.equal(app.calls[0].options.range, "3,1"); assert.equal(app.calls[0].options.mode, "text");
  inputOfLabel(app.render(), "页码范围").props.onChange({ target: { value: "1" } }); assert.equal(app.tasks[0].result, null);
  allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([new File(["bad"], "bad.txt")]);
  assert.match(app.tasks[0].error, /pdf/); assert.equal(button(app.render(), "开始导出").props.disabled, true);
});
