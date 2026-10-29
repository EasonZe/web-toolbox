import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const text = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function button(tree, label) { const node = allElements(tree, (node) => node.type === "button" && text(node) === label)[0]; assert.ok(node, label); return node; }
function control(tree, label) { const node = allElements(tree, (node) => node.type === "label" && text(node).startsWith(label))[0]; assert.ok(node, label); return allElements(node, (node) => ["input", "select"].includes(node.type))[0]; }
function fixture(deferred = false) {
  const tasks = [], calls = [], pending = []; let cursor = 0;
  function task() {
    let controller, generation = 0;
    return { result: null, error: "", busy: false, reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, async run(work) {
      this.reset(); const job = generation; controller = new AbortController(); this.busy = true;
      try { const result = await work(controller.signal, () => {}); if (generation === job && !controller.signal.aborted) { this.result = result; return result; } }
      catch (cause) { if (generation === job) this.error = cause.message; } finally { if (generation === job) this.busy = false; }
    } };
  }
  const app = mountComponent("app/components/pdf-watermark.tsx", "PdfWatermark", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask: () => tasks[cursor++] ??= task(), LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback" };
    if (id === "./pdf-local-preview") return { PdfLocalPreview: "preview" };
    if (id === "./design-color-input") return { DesignColorInput: "color" };
    if (id === "../lib/pdf-watermark-options") return loadLocalModule("app/lib/pdf-watermark-options.ts");
    if (id === "../lib/file-worker-client") return { async runFileWorker(request, signal) { calls.push({ request, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return request.action === "pdf-page-info" ? [{}, {}, {}] : { blob: new Blob(["PDF"]), changedPages: 2, stamps: 6 }; } };
  });
  return { ...app, tasks, calls, pending, render() { cursor = 0; const tree = app.render(); app.flushEffects(); return tree; } };
}

test("PDF 水印先检查文件，显式生成、网格选项、真实结果预览与文件名", async () => {
  const app = fixture(), file = new File(["pdf"], "report.pdf"); assert.equal(button(app.render(), "生成带水印 PDF").props.disabled, true);
  await one(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls[0].request.action, "pdf-page-info"); assert.equal(one(app.render(), "preview").props.file, file);
  control(app.render(), "排列方式").props.onChange({ target: { value: "grid" } });
  control(app.render(), "水印文字").props.onChange({ target: { value: "DRAFT" } }); control(app.render(), "页码范围").props.onChange({ target: { value: "3,1" } });
  control(app.render(), "不透明度").props.onChange({ target: { value: "37" } }); control(app.render(), "水平间隔").props.onChange({ target: { value: "10" } });
  await button(app.render(), "生成带水印 PDF").props.onClick(); const request = app.calls.at(-1).request;
  assert.equal(request.action, "pdf-watermark"); assert.equal(request.file, file); assert.equal(request.options.layout, "grid"); assert.equal(request.options.text, "DRAFT"); assert.equal(request.options.opacity, 37); assert.equal(request.options.range, "3,1"); assert.equal(request.options.gapX, 10);
  assert.equal(one(app.render(), "download").props.name, "report-watermarked.pdf"); assert.equal(one(app.render(), "preview").props.file, app.tasks[1].result.blob);
  control(app.render(), "预览页码").props.onChange({ target: { value: "999" } }); assert.equal(one(app.render(), "preview").props.page, 3);
  control(app.render(), "水印文字").props.onChange({ target: { value: "" } }); assert.equal(one(app.render(), "download"), undefined); assert.equal(button(app.render(), "生成带水印 PDF").props.disabled, true); assert.equal(one(app.render(), "preview").props.file, file);
  button(app.render(), "重置设置").props.onClick(); assert.equal(button(app.render(), "生成带水印 PDF").props.disabled, false); app.unmount();
});

test("换源、改参和清空取消旧任务，迟到 PDF 不会覆盖新文件或恢复下载", async () => {
  const app = fixture(true), first = new File(["a"], "a.pdf"), second = new File(["b"], "b.pdf");
  const a = one(app.render(), "upload").props.onFiles([first]), b = one(app.render(), "upload").props.onFiles([second]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]([{}]); await a; assert.equal(button(app.render(), "生成带水印 PDF").props.disabled, true);
  app.pending[1]([{}, {}]); await b; const generation = button(app.render(), "生成带水印 PDF").props.onClick();
  assert.equal(app.calls.at(-1).request.file, second); control(app.render(), "字号").props.onChange({ target: { value: "24" } }); assert.equal(app.calls.at(-1).signal.aborted, true);
  app.pending[2]({ blob: new Blob(["late"]), changedPages: 2, stamps: 2 }); await generation; assert.equal(one(app.render(), "download"), undefined);
  const next = button(app.render(), "生成带水印 PDF").props.onClick(), key = one(app.render(), "upload").key; button(app.render(), "清空文件").props.onClick(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[3]({ blob: new Blob(["late"]) }); await next;
  assert.equal(one(app.render(), "download"), undefined); assert.equal(one(app.render(), "preview").props.file, undefined); assert.notEqual(one(app.render(), "upload").key, key); app.unmount();
});

test("真实任务卸载终止 PDF 水印 Worker，不接受迟到结果", async () => {
  const client = workerClientHarness("app/lib/file-worker-client.ts"), app = mountComponent("app/components/local-workbench.tsx", "useLocalTask", (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined);
  const task = app.render(); app.flushEffects(); const pending = task.run((signal) => client.exports.runFileWorker({ action: "pdf-watermark", file: new File(["pdf"], "test.pdf"), options: loadLocalModule("app/lib/pdf-watermark-options.ts").defaultPdfWatermark }, signal));
  const worker = client.workers[0], late = worker.onmessage; assert.equal(worker.request.action, "pdf-watermark"); app.unmount(); assert.equal(await pending, undefined); assert.equal(worker.terminations, 1); assert.equal(client.timers.size, 0); late({ data: { result: { blob: new Blob() } } }); assert.equal(worker.terminations, 1);
});
