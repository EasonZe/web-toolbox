import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const find = (tree, type) => allElements(tree, (node) => node.type === type)[0];
function button(tree, label) { const node = allElements(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(node, label); return node; }
function input(tree, label) { const node = allElements(tree, (node) => node.type === "label" && (content(node.props.children[0]) === label || content(node) === label))[0]; assert.ok(node, label); return allElements(node, (node) => ["input", "select"].includes(node.type))[0]; }
function fixture(defer = false, deferSource = false) {
  const tasks = [], calls = [], pending = [], sourcePending = [], urlInputs = []; let cursor = 0;
  function task() {
    let controller, version = 0;
    return { result: null, busy: false, error: "", reset() { controller?.abort(); version++; this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const own = version; controller = new AbortController(); this.busy = true;
      this.pending = (async () => { try { const value = await work(controller.signal); if (own === version && !controller.signal.aborted) { this.result = value; return value; } } catch (cause) { if (own === version) this.error = cause.message; } finally { if (own === version) this.busy = false; } })(); return this.pending;
    } };
  }
  const component = mountComponent("app/components/image-rounded.tsx", "ImageRounded", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl: (blob) => { urlInputs.push(blob); return blob ? "blob:owned" : ""; }, useLocalTask() { return tasks[cursor++] ??= task(); } };
    if (id === "../lib/image-canvas") return { async prepareCanvasSource(file, signal) { calls.push({ action: "prepare", file, signal }); if (deferSource) return new Promise((resolve) => sourcePending.push(resolve)); return { file, width: 400, height: 200, thumbnail: new Blob(["thumbnail"], { type: "image/png" }) }; } };
    if (id === "../lib/image-rounded") return { ...loadLocalModule("app/lib/image-rounded.ts"), async renderRoundedImage(file, options, signal) { calls.push({ action: "render", file, options, signal }); if (defer) return new Promise((resolve) => pending.push(resolve)); const plan = loadLocalModule("app/lib/image-rounded.ts").planRoundedImage(400, 200, options); return { ...plan, blob: new Blob(["png"], { type: "image/png" }) }; } };
  });
  return { ...component, tasks, calls, pending, sourcePending, urlInputs, render() { cursor = 0; const tree = component.render(); component.flushEffects(); return tree; } };
}
test("圆角工具仅按按钮生成，清楚显示源/输出尺寸，更改设置清理旧下载", async () => {
  const app = fixture(), file = new File(["png"], "source.png"); app.render(); assert.equal(app.calls.length, 0);
  await find(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls.length, 1); assert.equal(app.calls[0].action, "prepare"); assert.match(content(app.render()), /400 × 200px/);
  await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls[1].action, "render"); assert.equal(app.calls[1].file, file); assert.ok(find(app.render(), "download"));
  input(app.render(), "边框位置").props.onChange({ target: { value: "outside" } }); assert.equal(find(app.render(), "download"), undefined); assert.match(content(app.render()), /416 × 216px/); assert.equal(app.calls.length, 2, "changing controls does not calculate the full image");
  input(app.render(), "边框宽度（px）").props.onChange({ target: { value: "20" } }); await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls.at(-1).options.borderWidth, 20); assert.match(content(app.render()), /440 × 240px/); app.unmount();
});
test("圆角四角和单位转换保留实际半径，圆形说明不暗中改变画布", async () => {
  const app = fixture(); await find(app.render(), "upload").props.onFiles([new File(["x"], "a.png")]);
  input(app.render(), "圆角单位").props.onChange({ target: { value: "pixels" } }); assert.equal(input(app.render(), "统一圆角（px）").props.value, 30);
  allElements(app.render(), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } });
  input(app.render(), "左上（px）").props.onChange({ target: { value: "40" } }); input(app.render(), "右下（px）").props.onChange({ target: { value: "10" } });
  await button(app.render(), "生成 PNG").props.onClick(); assert.deepEqual({ ...app.calls.at(-1).options.corners }, { topLeft: 40, topRight: 30, bottomRight: 10, bottomLeft: 30 });
  input(app.render(), "形状").props.onChange({ target: { value: "circle" } }); assert.match(content(app.render()), /圆形外的内容变为透明/); assert.match(content(app.render()), /400 × 200px/);
  button(app.render(), "重置设置").props.onClick(); assert.equal(input(app.render(), "圆角单位").props.value, "percent"); assert.equal(input(app.render(), "统一圆角（%）").props.value, 15); app.unmount();
});
test("改参数、重选或清空取消旧生成，晚到 Blob 不能重新出现", async () => {
  const app = fixture(true), file = new File(["x"], "a.png"); await find(app.render(), "upload").props.onFiles([file]);
  const old = button(app.render(), "生成 PNG").props.onClick(); assert.equal(button(app.render(), "生成 PNG").props.disabled, true);
  input(app.render(), "统一圆角（%）").props.onChange({ target: { value: "20" } }); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending.shift()({ blob: new Blob(["late"]) }); await old; assert.equal(find(app.render(), "download"), undefined);
  const replaced = button(app.render(), "生成 PNG").props.onClick(); const oldSignal = app.calls.at(-1).signal;
  await find(app.render(), "upload").props.onFiles([new File(["b"], "b.png")]); assert.equal(oldSignal.aborted, true); app.pending.shift()({ blob: new Blob(["late"]) }); await replaced; assert.equal(find(app.render(), "download"), undefined);
  const cleared = button(app.render(), "生成 PNG").props.onClick(); button(app.render(), "清空图片").props.onClick(); assert.equal(app.calls.at(-1).signal.aborted, true); app.pending.shift()({ blob: new Blob(["late"]) }); await cleared;
  assert.equal(find(app.render(), "download"), undefined); assert.equal(app.tasks[0].result, null); assert.equal(allElements(app.render(), (node) => node.type === "img").length, 0); app.unmount();
});
test("无效圆角或过宽外框明确报错并禁用生成，不再继续计算", async () => {
  const app = fixture(); await find(app.render(), "upload").props.onFiles([new File(["x"], "a.png")]);
  input(app.render(), "统一圆角（%）").props.onChange({ target: { value: "51" } }); assert.equal(button(app.render(), "生成 PNG").props.disabled, true); assert.match(content(app.render()), /0–50%/);
  button(app.render(), "重置设置").props.onClick(); input(app.render(), "边框位置").props.onChange({ target: { value: "outside" } }); input(app.render(), "边框宽度（px）").props.onChange({ target: { value: "8192" } });
  assert.equal(button(app.render(), "生成 PNG").props.disabled, true); assert.match(content(app.render()), /8192px/); assert.equal(app.calls.length, 1); app.unmount();
});
test("源预览仅使用1024缩略图Blob，不将原始File直接交给HTML图片解码", async () => {
  const code = readFileSync(new URL("../app/components/image-rounded.tsx", import.meta.url), "utf8");
  assert.match(code, /useBlobUrl\(current\?\.thumbnail\)/); assert.doesNotMatch(code, /useBlobUrl\(current\?\.file\)/); assert.match(code, /prepareCanvasSource\(files\[0\], signal\)/);
  const app = fixture(), file = new File(["source"], "large.png"); await find(app.render(), "upload").props.onFiles([file]); app.render();
  assert.ok(app.urlInputs.includes(app.tasks[0].result.thumbnail)); assert.ok(!app.urlInputs.includes(file)); assert.match(content(app.render()), /原图预览最长边 1024px/);
  await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls.at(-1).file, file, "full-resolution export still receives the original File");
  button(app.render(), "清空图片").props.onClick(); assert.equal(allElements(app.render(), (node) => node.type === "img").length, 0); app.unmount();
});
test("源缩略图准备中重选或清空会取消旧信号，晚到预览不能复活", async () => {
  const app = fixture(false, true), oldFile = new File(["a"], "a.png"), newFile = new File(["b"], "b.png");
  const old = find(app.render(), "upload").props.onFiles([oldFile]), fresh = find(app.render(), "upload").props.onFiles([newFile]);
  assert.equal(app.calls[0].signal.aborted, true); app.sourcePending.shift()({ file: oldFile, width: 400, height: 200, thumbnail: new Blob(["old"]) }); await old;
  assert.equal(app.tasks[0].result, null); assert.equal(allElements(app.render(), (node) => node.type === "img").length, 0);
  app.sourcePending.shift()({ file: newFile, width: 400, height: 200, thumbnail: new Blob(["new"]) }); await fresh; assert.equal(app.tasks[0].result.file, newFile);
  const clearing = find(app.render(), "upload").props.onFiles([oldFile]); button(app.render(), "清空图片").props.onClick(); assert.equal(app.calls.at(-1).signal.aborted, true);
  app.sourcePending.shift()({ file: oldFile, width: 400, height: 200, thumbnail: new Blob(["late"]) }); await clearing; assert.equal(app.tasks[0].result, null); app.unmount();
});
