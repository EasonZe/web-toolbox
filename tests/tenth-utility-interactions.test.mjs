import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => allElements(tree, (node) => node.type === "button" && content(node) === title)[0];
function control(tree, label) { const node = allElements(tree, (node) => node.type === "label" && content(node.props.children[0]) === label)[0]; assert.ok(node, label); return allElements(node, (node) => ["input", "select"].includes(node.type))[0]; }
function fixture(name, duplicateResult) {
  const calls = []; let generation = 0;
  const task = { result: null, busy: false, error: "", setError(value) { this.error = value; }, reset() { generation++; this.result = null; this.busy = false; this.error = ""; }, run(work) { this.reset(); const job = generation; this.busy = true; this.pending = (async () => { try { const result = await work(new AbortController().signal, () => {}); if (job !== generation) return; this.result = result; return result; } catch (error) { if (job === generation) this.error = error.message; } finally { if (job === generation) this.busy = false; } })(); return this.pending; } };
  const app = mountComponent(`app/components/${name}.tsx`, name === "duplicate-files" ? "DuplicateFiles" : "PdfScan", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./file-drop-zone") return { FileDropZone: "drop-zone" };
    if (id === "./local-workbench") return { useLocalTask: () => task, LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl: (blob) => blob ? "blob:preview" : "" };
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request, signal) => { calls.push(request); return duplicateResult ?? loadLocalModule("app/lib/duplicate-files.ts").findDuplicateFiles(request.files, signal); } };
    if (id === "../lib/pdf-scan") return { createScannedPdf: async (file, options) => { calls.push({ file, options }); return { blob: new Blob(["pdf"], { type: "application/pdf" }), preview: new Blob(["image"]), pages: 2, sourcePages: [3, 1] }; } };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, calls, task, render() { const tree = app.render(); app.flushEffects(); return tree; } };
}
test("重复文件界面选择/文件夹导入、内容核对与报告，不提供删除操作", async () => {
  const app = fixture("duplicate-files"), files = [new File(["same"], "original"), new File(["same"], "renamed")];
  one(app.render(), "drop-zone").props.onFiles(files); assert.equal(one(app.render(), "drop-zone").props.resourceMode, "stream");
  button(app.render(), "开始检查重复文件").props.onClick(); await app.task.pending;
  assert.equal(app.calls[0].action, "duplicate-files"); assert.equal(app.task.result.redundant, 1); assert.ok(one(app.render(), "download"));
  const report = JSON.parse(await one(app.render(), "download").props.blob.text()); assert.equal(report.groups[0].files[0].name, "original");
  assert.equal(allElements(app.render(), (node) => node.type === "button" && /删除/.test(content(node))).length, 0);
  const folder = allElements(app.render(), (node) => node.type === "input" && node.props.type === "file")[0], event = { currentTarget: { files, value: "old" } };
  folder.props.onChange(event); assert.equal(event.currentTarget.value, ""); assert.equal(one(app.render(), "download"), undefined);
  const key = one(app.render(), "drop-zone").key; button(app.render(), "清空").props.onClick(); assert.notEqual(one(app.render(), "drop-zone").key, key); assert.equal(button(app.render(), "开始检查重复文件").props.disabled, true);
  one(app.render(), "drop-zone").props.onFiles([files[0]]); assert.match(app.task.error, /2–2000/); app.unmount();
});
test("重复文件结果分页和组内截断不丢完整报告", async () => {
  const groups = Array.from({ length: 21 }, (_, index) => ({ size: 4, sha256: String(index).padStart(64, "0"), files: [{ index: index * 2, name: `left${index}`, path: `left${index}` }, { index: index * 2 + 1, name: `right${index}`, path: `right${index}` }] }));
  const app = fixture("duplicate-files", { files: 42, hashed: 42, groups, redundant: 21, redundantBytes: 84 }); one(app.render(), "drop-zone").props.onFiles([new File(["x"], "a"), new File(["x"], "b")]);
  button(app.render(), "开始检查重复文件").props.onClick(); await app.task.pending;
  assert.match(content(app.render()), /第 20 组/); assert.doesNotMatch(content(app.render()), /第 21 组/);
  button(app.render(), "下一页").props.onClick(); assert.match(content(app.render()), /第 21 组/); assert.equal(JSON.parse(await one(app.render(), "download").props.blob.text()).groups.length, 21);
  button(app.render(), "上一页").props.onClick(); assert.equal(button(app.render(), "上一页").props.disabled, true); app.unmount();
});
test("PDF 扫描界面选项传递、效果切换、错误输入和清空不保留旧预览", async () => {
  const app = fixture("pdf-scan"), file = new File(["pdf"], "source.pdf"); one(app.render(), "upload").props.onFiles([file]);
  control(app.render(), "页码范围").props.onChange({ target: { value: "3,1" } }); control(app.render(), "页面效果").props.onChange({ target: { value: "threshold" } });
  allElements(app.render(), (node) => node.type === "input" && node.props.type === "range" && node.props.max === 255)[0].props.onChange({ target: { value: "120" } });
  control(app.render(), "内嵌图片").props.onChange({ target: { value: "png" } }); control(app.render(), "清晰度").props.onChange({ target: { value: "216" } });
  button(app.render(), "生成图片型 PDF").props.onClick(); await app.task.pending;
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[0].options)), { range: "3,1", mode: "threshold", threshold: 120, format: "png", dpi: 216, quality: 0.9 }); assert.ok(one(app.render(), "img")); assert.match(content(app.render()), /来源页码 3、1/);
  control(app.render(), "页面效果").props.onChange({ target: { value: "color" } }); assert.equal(one(app.render(), "img"), undefined);
  one(app.render(), "upload").props.onFiles([new File(["bad"], "source.docx")]); assert.match(app.task.error, /\.pdf/); assert.equal(button(app.render(), "生成图片型 PDF").props.disabled, true);
  const key = one(app.render(), "upload").key; button(app.render(), "清空").props.onClick(); assert.notEqual(one(app.render(), "upload").key, key); assert.equal(app.task.error, ""); app.unmount();
});
test("扫描像素移交后台线程，不复制源数组，取消关闭线程且迟到结果无效", async () => {
  const app = workerClientHarness("app/lib/raster-worker-client.ts"), controller = new AbortController(), pixels = new Uint8ClampedArray([255, 0, 0, 255]);
  const result = app.exports.runRasterWorker({ action: "scan", pixels, mode: "grayscale", threshold: 160 }, controller.signal), worker = app.workers[0], late = worker.onmessage;
  assert.equal(worker.transfer[0], pixels.buffer); controller.abort(); await assert.rejects(result); late({ data: { result: pixels } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
});
