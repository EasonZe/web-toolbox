import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function button(tree, label) { const found = allElements(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(found, label); return found; }
function field(tree, label, type = "input") { const node = allElements(tree, (node) => node.type === "label" && content(node).startsWith(label))[0]; assert.ok(node, label); return allElements(node, (node) => node.type === type)[0]; }
function fixture(deferred = false) {
  const tasks = [], calls = [], pending = []; let cursor = 0;
  function task() { let generation = 0, controller; return { result: null, busy: false, error: "", setError(message) { this.error = message; }, reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, cancel() { this.reset(); }, run(work) { this.reset(); const job = generation; controller = new AbortController(); this.busy = true; return (async () => { try { const result = await work(controller.signal, () => {}); if (job === generation && !controller.signal.aborted) { this.result = result; return result; } } catch (cause) { if (job === generation) this.error = cause.message; } finally { if (job === generation) this.busy = false; } })(); } }; }
  const app = mountComponent("app/components/image-vectorizer.tsx", "ImageVectorizer", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= task(); }, useBlobUrl: (blob) => blob ? "blob:owned" : "", LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback" };
    if (id === "../lib/image-vectorizer-options") return loadLocalModule("app/lib/image-vectorizer-options.ts");
    if (id === "../lib/image-vectorizer-client") return { async readImageVectorizerSource(file, signal) { calls.push({ action: "preview", file, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { thumbnail: new Blob(["thumb"]), width: 800, height: 400 }; }, async runImageVectorizer(file, options, signal) { calls.push({ action: "process", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { blob: new Blob(["svg"]), width: 512, height: 256, scale: 0.64, paths: 4 }; } };
  });
  return { ...app, tasks, calls, pending, render() { cursor = 0; const tree = app.render(); app.flushEffects(); return tree; } };
}
test("上传仅生成原图缩略图，显式描摹并下载SVG，处理尺寸清楚显示，Blob img不插入HTML", async () => {
  const app = fixture(); assert.equal(button(app.render(), "生成 SVG").props.disabled, true); assert.equal(app.calls.length, 0);
  await one(app.render(), "upload").props.onFiles([new File(["x"], "icon.png")]); assert.equal(app.calls.length, 1); assert.match(content(app.render()), /800 × 400px → 描摹 512 × 256px/);
  await button(app.render(), "生成 SVG").props.onClick(); assert.equal(app.calls.at(-1).options.edge, 512); assert.equal(one(app.render(), "download").props.name, "icon-vector.svg");
  assert.ok(allElements(app.render(), (node) => node.type === "img").every((node) => node.props.src === "blob:owned")); assert.equal(allElements(app.render(), (node) => node.props?.dangerouslySetInnerHTML).length, 0);
  field(app.render(), "处理最长边", "select").props.onChange({ target: { value: "1024" } }); assert.equal(one(app.render(), "download"), undefined); assert.match(content(app.render()), /800 × 400px → 描摹 800 × 400px/); app.unmount();
});
test("非法颜色禁止生成，重置参数清输出，清空上传并恢复默认值", async () => {
  const app = fixture(); await one(app.render(), "upload").props.onFiles([new File(["x"], "a.png")]); field(app.render(), "颜色数量").props.onChange({ target: { value: "1" } }); assert.equal(button(app.render(), "生成 SVG").props.disabled, true);
  button(app.render(), "重置参数").props.onClick(); assert.equal(button(app.render(), "生成 SVG").props.disabled, false); await button(app.render(), "生成 SVG").props.onClick(); const key = one(app.render(), "upload").key; button(app.render(), "清空").props.onClick(); assert.equal(one(app.render(), "download"), undefined); assert.equal(button(app.render(), "生成 SVG").props.disabled, true); assert.notEqual(one(app.render(), "upload").key, key); app.unmount();
});
test("换源与改参取消任务，迟到预览或SVG不会复活，取消后能重新生成", async () => {
  const app = fixture(true), first = one(app.render(), "upload").props.onFiles([new File(["a"], "a.png")]), second = one(app.render(), "upload").props.onFiles([new File(["b"], "b.png")]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]({ thumbnail: new Blob(), width: 10, height: 10 }); await first; assert.equal(button(app.render(), "生成 SVG").props.disabled, true); app.pending[1]({ thumbnail: new Blob(), width: 800, height: 400 }); await second;
  const processing = button(app.render(), "生成 SVG").props.onClick(); field(app.render(), "小斑点过滤").props.onChange({ target: { value: "24" } }); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[2]({ blob: new Blob(["late"]) }); await processing; assert.equal(one(app.render(), "download"), undefined);
  const next = button(app.render(), "生成 SVG").props.onClick(); app.tasks[1].cancel(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[3]({ blob: new Blob(["late"]) }); await next; assert.equal(one(app.render(), "download"), undefined); assert.equal(button(app.render(), "生成 SVG").props.disabled, false); app.unmount();
});
test("真实 useLocalTask 卸载终止描摹 Worker 并抑制迟到结果；预览 URL 换源卸载释放", async () => {
  const client = workerClientHarness("app/lib/image-vectorizer-client.ts"), resolve = (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined, app = mountComponent("app/components/local-workbench.tsx", "useLocalTask", resolve), task = app.render(); app.flushEffects();
  const pending = task.run((signal) => client.exports.runImageVectorizer(new File(["x"], "a.png"), loadLocalModule("app/lib/image-vectorizer-options.ts").defaultImageVectorizer, signal)), worker = client.workers[0], late = worker.onmessage;
  app.unmount(); assert.equal(await pending, undefined); assert.equal(worker.terminations, 1); assert.equal(client.timers.size, 0); late({ data: { result: { blob: new Blob(["late"]) } } }); assert.equal(worker.terminations, 1);
  const made = [], revoked = [], urls = mountComponent("app/components/local-workbench.tsx", "useBlobUrl", resolve, { URL: { createObjectURL(blob) { const url = `blob:${made.length}`; made.push({ blob, url }); return url; }, revokeObjectURL(url) { revoked.push(url); } } });
  urls.render(new Blob(["source"])); urls.flushEffects(); urls.render(new Blob(["svg"])); urls.flushEffects(); assert.equal(revoked.length, 1); urls.unmount(); assert.deepEqual(revoked, made.map((item) => item.url));
});
