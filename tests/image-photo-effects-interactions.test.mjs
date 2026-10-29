import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
function button(tree, label) { const found = allElements(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(found, label); return found; }
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function fixture(kind, deferred = false) {
  const tasks = [], calls = [], pending = []; let cursor = 0;
  function task() {
    let generation = 0, controller;
    return { result: null, busy: false, error: "", setError(message) { this.error = message; }, reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const job = generation; controller = new AbortController(); this.busy = true;
      this.pending = (async () => { try { const result = await work(controller.signal, () => {}); if (job === generation && !controller.signal.aborted) { this.result = result; return result; } } catch (cause) { if (job === generation) this.error = cause.message; } finally { if (job === generation) this.busy = false; } })(); return this.pending;
    } };
  }
  const app = mountComponent("app/components/image-photo-effects.tsx", "ImagePhotoEffects", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./design-color-input") return { DesignColorInput: "color" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= task(); }, useBlobUrl: (blob) => blob ? "blob:owned" : "", LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback" };
    if (id === "../lib/image-photo-effects-options") return loadLocalModule("app/lib/image-photo-effects-options.ts");
    if (id === "../lib/image-photo-effects-client") return { async readPhotoEffectSource(file, effect, signal) { calls.push({ action: "preview", file, kind: effect, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { thumbnail: new Blob(["thumb"]), width: 2, height: 1 }; }, async runPhotoEffect(file, options, signal) { calls.push({ action: "process", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { blob: new Blob(["full"]), thumbnail: new Blob(["thumb"]), width: 2, height: 1 }; } };
  });
  return { ...app, tasks, calls, pending, render() { cursor = 0; const tree = app.render({ kind }); app.flushEffects(); return tree; } };
}
test("双色调上传只读取缩略图，显式生成保原尺寸，颜色交换/参数变更清理旧结果", async () => {
  const app = fixture("duotone"), file = new File(["png"], "photo.png"); assert.equal(app.calls.length, 0); assert.equal(button(app.render(), "生成效果").props.disabled, true);
  await one(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls.length, 1); assert.equal(app.calls[0].action, "preview");
  await button(app.render(), "生成效果").props.onClick(); assert.equal(app.calls.at(-1).options.kind, "duotone"); assert.equal(app.calls.at(-1).file, file); assert.ok(one(app.render(), "download"));
  const shadow = app.calls.at(-1).options.shadow, highlight = app.calls.at(-1).options.highlight; button(app.render(), "交换暗亮颜色").props.onClick(); assert.equal(app.tasks[1].result, null);
  await button(app.render(), "生成效果").props.onClick(); assert.equal(app.calls.at(-1).options.shadow, highlight); assert.equal(app.calls.at(-1).options.highlight, shadow);
  one(app.render(), "color").props.onChange("#AABBCC"); assert.equal(one(app.render(), "download"), undefined); assert.equal(app.calls.length, 3);
  button(app.render(), "清空").props.onClick(); assert.equal(button(app.render(), "生成效果").props.disabled, true); assert.equal(app.tasks[0].result, null); app.unmount();
});
test("锐化参数不自动连续任务，重置清理结果，清空或换源会取消旧生成", async () => {
  const app = fixture("sharpen"), file = new File(["x"], "a.png"); await one(app.render(), "upload").props.onFiles([file]);
  const radiusLabel = allElements(app.render(), (node) => node.type === "label" && content(node.props.children[0]) === "邻域半径（原图 px）")[0]; const radius = allElements(radiusLabel, (node) => node.type === "input")[0]; radius.props.onChange({ target: { value: "4" } }); assert.equal(app.calls.length, 1);
  await button(app.render(), "生成效果").props.onClick(); assert.equal(app.calls.at(-1).options.radius, 4); assert.match(content(app.render()), /不是 AI|不能恢复/);
  button(app.render(), "重置参数").props.onClick(); assert.equal(app.tasks[1].result, null); await button(app.render(), "生成效果").props.onClick(); assert.equal(app.calls.at(-1).options.radius, 2);
  await one(app.render(), "upload").props.onFiles([new File(["x"], "b.png")]); assert.equal(app.tasks[1].result, null); app.unmount();
});
test("迟到的旧源预览不复活，换源/参数修改中断旧信号与输出", async () => {
  const app = fixture("duotone", true), a = new File(["a"], "a.png"), b = new File(["b"], "b.png");
  const first = one(app.render(), "upload").props.onFiles([a]); const second = one(app.render(), "upload").props.onFiles([b]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]({ thumbnail: new Blob(["old"]), width: 9, height: 9 }); await first; assert.equal(app.tasks[0].result, null); assert.equal(button(app.render(), "生成效果").props.disabled, true);
  app.pending[1]({ thumbnail: new Blob(["new"]), width: 2, height: 1 }); await second;
  const generation = button(app.render(), "生成效果").props.onClick(); assert.equal(app.calls.at(-1).file, b);
  button(app.render(), "交换暗亮颜色").props.onClick(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending[2]({ blob: new Blob(["late"]), thumbnail: new Blob() }); await generation;
  assert.equal(one(app.render(), "download"), undefined); app.unmount();
});
