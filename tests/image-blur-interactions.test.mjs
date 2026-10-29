import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
function button(tree, label) { const found = allElements(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(found, label); return found; }
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function input(tree, label) { const node = allElements(tree, (node) => node.type === "label" && content(node).startsWith(label))[0]; assert.ok(node, label); return allElements(node, (node) => node.type === "input")[0]; }
function fixture(deferred = false) {
  const tasks = [], calls = [], pending = []; let cursor = 0;
  function task() { let generation = 0, controller; return { result: null, busy: false, error: "", setError(message) { this.error = message; }, reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, cancel() { this.reset(); }, run(work) { this.reset(); const job = generation; controller = new AbortController(); this.busy = true; return (async () => { try { const result = await work(controller.signal, () => {}); if (job === generation && !controller.signal.aborted) { this.result = result; return result; } } catch (cause) { if (job === generation) this.error = cause.message; } finally { if (job === generation) this.busy = false; } })(); }, dispose() { controller?.abort(); generation++; } }; }
  const app = mountComponent("app/components/image-blur.tsx", "ImageBlur", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= task(); }, useBlobUrl: (blob) => blob ? "blob:owned" : "", LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback" };
    if (id === "../lib/image-blur-options") return loadLocalModule("app/lib/image-blur-options.ts");
    if (id === "../lib/image-blur-client") return { async readImageBlurSource(file, signal) { calls.push({ action: "preview", file, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { thumbnail: new Blob(["thumb"]), width: 4, height: 2 }; }, async runImageBlur(file, options, signal) { calls.push({ action: "process", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { blob: new Blob(["full"]), thumbnail: new Blob(["thumb"]), width: 4, height: 2 }; } };
  });
  return { ...app, tasks, calls, pending, render() { cursor = 0; const tree = app.render(); app.flushEffects(); return tree; } };
}
test("图片模糊默认全图，上传仅预览，显式生成原尺寸，可选矩形遮罩与0%", async () => {
  const app = fixture(), file = new File(["png"], "photo.png"); assert.equal(button(app.render(), "生成模糊图片").props.disabled, true); assert.equal(app.calls.length, 0);
  await one(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls.length, 1); await button(app.render(), "生成模糊图片").props.onClick(); assert.equal(app.calls.at(-1).options.scope, "all"); assert.ok(one(app.render(), "download"));
  one(app.render(), "select").props.onChange({ target: { value: "region" } }); assert.equal(one(app.render(), "download"), undefined); const box = allElements(app.render(), (node) => node.props?.className === "image-blur-selection-box")[0]; assert.equal(box.props.style.left, "25%"); assert.equal(box.props.style.width, "50%");
  input(app.render(), "左侧位置").props.onChange({ target: { value: "10" } }); input(app.render(), "模糊强度").props.onChange({ target: { value: "0" } }); await button(app.render(), "生成模糊图片").props.onClick(); assert.equal(app.calls.at(-1).options.strength, 0); assert.equal(app.calls.at(-1).options.region.left, 10);
  assert.match(content(app.render()), /不用于.*安全脱敏/); assert.match(content(app.render()), /手绘遮挡/); app.unmount();
});
test("无效矩形禁生成并隐藏遮罩，重置清旧输出，清空重置上传", async () => {
  const app = fixture(); await one(app.render(), "upload").props.onFiles([new File(["x"], "a.png")]); one(app.render(), "select").props.onChange({ target: { value: "region" } }); input(app.render(), "范围宽度").props.onChange({ target: { value: "90" } });
  assert.equal(button(app.render(), "生成模糊图片").props.disabled, true); assert.match(content(app.render()), /矩形不能超出/); assert.equal(allElements(app.render(), (node) => node.props?.className === "image-blur-selection-box").length, 0);
  button(app.render(), "重置参数").props.onClick(); assert.equal(button(app.render(), "生成模糊图片").props.disabled, false); await button(app.render(), "生成模糊图片").props.onClick(); const key = one(app.render(), "upload").key;
  button(app.render(), "清空").props.onClick(); assert.equal(one(app.render(), "download"), undefined); assert.equal(button(app.render(), "生成模糊图片").props.disabled, true); assert.notEqual(one(app.render(), "upload").key, key); app.unmount();
});
test("换源取消旧预览，参数变更取消生成，迟到结果不会复活", async () => {
  const app = fixture(true), a = new File(["a"], "a.png"), b = new File(["b"], "b.png"), first = one(app.render(), "upload").props.onFiles([a]), second = one(app.render(), "upload").props.onFiles([b]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]({ thumbnail: new Blob(["old"]), width: 9, height: 9 }); await first; assert.equal(button(app.render(), "生成模糊图片").props.disabled, true);
  app.pending[1]({ thumbnail: new Blob(["new"]), width: 4, height: 2 }); await second; const generation = button(app.render(), "生成模糊图片").props.onClick(); assert.equal(app.calls.at(-1).file, b);
  input(app.render(), "均值半径").props.onChange({ target: { value: "3" } }); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[2]({ blob: new Blob(["late"]), thumbnail: new Blob() }); await generation; assert.equal(one(app.render(), "download"), undefined);
  const next = button(app.render(), "生成模糊图片").props.onClick(); button(app.render(), "清空").props.onClick(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[3]({ blob: new Blob(["late"]), thumbnail: new Blob() }); await next; assert.equal(one(app.render(), "download"), undefined); app.unmount();
});
test("取消预览清理任务且不保留可生成文件，取消输出可重新生成", async () => {
  const app = fixture(true), uploading = one(app.render(), "upload").props.onFiles([new File(["x"], "a.png")]); app.tasks[0].cancel(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[0]({ thumbnail: new Blob(), width: 2, height: 1 }); await uploading; assert.equal(button(app.render(), "生成模糊图片").props.disabled, true);
  const uploading2 = one(app.render(), "upload").props.onFiles([new File(["x"], "b.png")]); app.pending[1]({ thumbnail: new Blob(), width: 2, height: 1 }); await uploading2;
  const processing = button(app.render(), "生成模糊图片").props.onClick(); app.tasks[1].cancel(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[2]({ blob: new Blob(), thumbnail: new Blob() }); await processing; assert.equal(button(app.render(), "生成模糊图片").props.disabled, false); assert.equal(one(app.render(), "download"), undefined); app.unmount();
});
test("真实useLocalTask卸载终止图片模糊Worker且迟到结果无效", async () => {
  const client = workerClientHarness("app/lib/image-blur-client.ts"), app = mountComponent("app/components/local-workbench.tsx", "useLocalTask", (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined), task = app.render(); app.flushEffects();
  const pending = task.run((signal) => client.exports.runImageBlur(new File(["x"], "a.png"), loadLocalModule("app/lib/image-blur-options.ts").defaultImageBlur, signal)), worker = client.workers[0], late = worker.onmessage;
  app.unmount(); assert.equal(await pending, undefined); assert.equal(worker.terminations, 1); assert.equal(client.timers.size, 0); late({ data: { result: { blob: new Blob(["late"]) } } }); assert.equal(worker.terminations, 1);
});
test("真实useBlobUrl切换图片与卸载释放全部预览链接", () => {
  const created = [], revoked = [], app = mountComponent("app/components/local-workbench.tsx", "useBlobUrl", (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined, { URL: { createObjectURL(blob) { const url = `blob:owned-${created.length}`; created.push({ blob, url }); return url; }, revokeObjectURL(url) { revoked.push(url); } } });
  const first = new Blob(["first"]), second = new Blob(["second"]); app.render(first); app.flushEffects(); assert.equal(created.length, 1); app.render(second); app.flushEffects(); assert.deepEqual(revoked, [created[0].url]); app.unmount(); assert.deepEqual(revoked, created.map((entry) => entry.url));
});
