import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const text = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function button(tree, title) { const found = allElements(tree, (node) => node.type === "button" && text(node) === title)[0]; assert.ok(found, title); return found; }
function fixture(deferred = false) {
  const tasks = [], calls = [], pending = [], previews = []; let cursor = 0;
  const lib = loadLocalModule("app/lib/image-canvas.ts");
  function createTask() {
    let generation = 0, controller;
    return { busy: false, result: null, error: "", reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const current = generation; controller = new AbortController(); this.busy = true;
      this.pending = (async () => { try { const result = await work(controller.signal, () => {}); if (generation === current && !controller.signal.aborted) { this.result = result; return result; } } catch (cause) { if (generation === current) this.error = cause.message; } finally { if (generation === current) this.busy = false; } })(); return this.pending;
    } };
  }
  const app = mountComponent("app/components/image-canvas.tsx", "ImageCanvas", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./design-color-input") return { DesignColorInput: "color" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= createTask(); }, LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl(blob) { previews.push(blob); return blob ? "blob:owned" : ""; } };
    if (id === "../lib/image-canvas") return { ...lib, async prepareCanvasSource(file, signal) { calls.push({ action: "source", file, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { file, width: 8, height: 6, thumbnail: new Blob(["small"]) }; }, async createImageCanvas(file, options, signal) { calls.push({ action: "generate", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { blob: new Blob(["image"], { type: "image/png" }), width: options.width, height: options.height }; } };
  });
  return { ...app, tasks, calls, pending, previews, render() { cursor = 0; return app.render(); } };
}

test("画布无需上传即能生成纯色PNG，改参数失效结果，透明模式不受隐藏的无效底色阻挡", async () => {
  const app = fixture(); assert.equal(app.calls.length, 0);
  await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls[0].file, null); assert.equal(app.calls[0].options.width, 1280); assert.ok(allElements(app.render(), (node) => node.type === "download").length);
  button(app.render(), "正方形").props.onClick(); assert.equal(app.tasks[1].result, null);
  allElements(app.render(), (node) => node.type === "color")[0].props.onChange("#12"); assert.equal(button(app.render(), "生成 PNG").props.disabled, true);
  allElements(app.render(), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); assert.equal(button(app.render(), "生成 PNG").props.disabled, false);
  await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls.at(-1).options.transparent, true); assert.equal(app.calls.at(-1).options.width, 1080); app.unmount();
});

test("画布导入原图只预览缩略图，原尺寸按钮正确，清空后回到无图底图生成", async () => {
  const app = fixture(), file = new File(["file"], "a.png");
  await allElements(app.render(), (node) => node.type === "upload")[0].props.onFiles([file]);
  button(app.render(), "使用原图尺寸").props.onClick(); await button(app.render(), "生成 PNG").props.onClick(); const last = app.calls.at(-1);
  assert.equal(last.file, file); assert.equal(last.options.width, 8); assert.equal(last.options.height, 6); assert.equal(last.options.fit, "original"); assert.ok(app.previews.every((blob) => !(blob instanceof File)));
  button(app.render(), "清空图片").props.onClick(); assert.equal(app.tasks[0].result, null); assert.equal(app.tasks[1].result, null);
  await button(app.render(), "生成 PNG").props.onClick(); assert.equal(app.calls.at(-1).file, null); app.unmount();
});

test("画布重选/清空取消旧来源，修改参数取消旧生成，迟到结果不复活", async () => {
  const app = fixture(true), file = new File(["a"], "a.png"), second = new File(["b"], "b.png");
  const upload = () => allElements(app.render(), (node) => node.type === "upload")[0];
  const first = upload().props.onFiles([file]), next = upload().props.onFiles([second]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]({ file, width: 4, height: 2, thumbnail: new Blob(["old"]) }); await first; assert.equal(app.tasks[0].result, null);
  app.pending[1]({ file: second, width: 8, height: 6, thumbnail: new Blob(["new"]) }); await next;
  const generated = button(app.render(), "生成 PNG").props.onClick(); button(app.render(), "交换宽高").props.onClick(); assert.equal(app.calls[2].signal.aborted, true);
  app.pending[2]({ blob: new Blob(["old-result"]), width: 1280, height: 720 }); await generated; assert.equal(app.tasks[1].result, null);
  const again = upload().props.onFiles([file]); button(app.render(), "清空图片").props.onClick(); assert.equal(app.calls[3].signal.aborted, true);
  app.pending[3]({ file, width: 4, height: 2, thumbnail: new Blob(["late"]) }); await again; assert.equal(app.tasks[0].result, null); app.unmount();
});
