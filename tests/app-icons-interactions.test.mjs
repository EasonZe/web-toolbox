import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const text = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
const elements = (tree, type) => allElements(tree, (node) => node.type === type);
function button(tree, title) { const found = elements(tree, "button").find((node) => text(node) === title); assert.ok(found, title); return found; }
function checkbox(tree, title) { const label = elements(tree, "label").find((node) => text(node) === title); assert.ok(label, title); const input = elements(label, "input")[0]; assert.ok(input, title); return input; }
function fixture(deferred = false) {
  const tasks = [], calls = [], pending = [], previews = []; let cursor = 0;
  const lib = loadLocalModule("app/lib/app-icons.ts");
  function createTask() {
    let generation = 0, controller;
    return { busy: false, result: null, error: "", reset() { generation++; controller?.abort(); this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const current = generation; controller = new AbortController(); this.busy = true;
      return (async () => { try { const result = await work(controller.signal, () => {}); if (generation === current && !controller.signal.aborted) { this.result = result; return result; } } catch (cause) { if (generation === current) this.error = cause.message; } finally { if (generation === current) this.busy = false; } })();
    } };
  }
  const app = mountComponent("app/components/app-icons.tsx", "AppIcons", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./design-color-input") return { DesignColorInput: "color" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= createTask(); }, LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl(blob) { previews.push(blob); return blob ? "blob:owned" : ""; } };
    if (id === "../lib/image-canvas") return { async prepareCanvasSource(file, signal) { calls.push({ action: "source", file, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { file, width: 2000, height: 1200, thumbnail: new Blob(["small"]) }; } };
    if (id === "../lib/app-icons") return { ...lib, async renderAppIcons(file, options, signal) { calls.push({ action: "generate", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { icons: [{ size: 192, platform: "web", path: "web/icons/icon-192.png", label: "Web 192", blob: new Blob(["image"], { type: "image/png" }) }], zip: new Blob(["zip"], { type: "application/zip" }) }; } };
  });
  return { ...app, tasks, calls, pending, previews, render() { cursor = 0; return app.render(); } };
}

test("图标未上传不运行，上传只预览缩略图；改名称/颜色/平台等设置不会反复解码", async () => {
  const app = fixture(); assert.equal(app.calls.length, 0); assert.equal(button(app.render(), "生成图标").props.disabled, true);
  const file = new File(["a"], "a.png"); await elements(app.render(), "upload")[0].props.onFiles([file]);
  assert.equal(app.calls.length, 1); assert.ok(app.previews.every((blob) => !(blob instanceof File)));
  await button(app.render(), "生成图标").props.onClick(); assert.equal(app.calls.at(-1).file, file); assert.ok(elements(app.render(), "download").length);
  elements(app.render(), "input").find((node) => node.props.maxLength === 80).props.onChange({ target: { value: "新名字" } }); assert.equal(app.tasks[1].result, null);
  elements(app.render(), "color")[0].props.onChange("#12"); assert.equal(button(app.render(), "生成图标").props.disabled, true);
  elements(app.render(), "color")[0].props.onChange("#ffffff");
  for (const title of ["Web / PWA", "Apple", "Android 传统图标"]) checkbox(app.render(), title).props.onChange({ target: { checked: false } });
  assert.equal(button(app.render(), "生成图标").props.disabled, true); assert.equal(app.calls.length, 2);
  button(app.render(), "重置设置").props.onClick(); assert.equal(button(app.render(), "生成图标").props.disabled, false); app.unmount();
});

test("重选取消旧上传，改参数取消生成，迟到结果不会重新出现；清空后禁用生成", async () => {
  const app = fixture(true), file = new File(["a"], "a.png"), second = new File(["b"], "b.png");
  const upload = () => elements(app.render(), "upload")[0];
  const first = upload().props.onFiles([file]), next = upload().props.onFiles([second]); assert.equal(app.calls[0].signal.aborted, true);
  app.pending[0]({ file, width: 8, height: 6, thumbnail: new Blob(["old"]) }); await first; assert.equal(app.tasks[0].result, null);
  app.pending[1]({ file: second, width: 20, height: 20, thumbnail: new Blob(["new"]) }); await next;
  const generated = button(app.render(), "生成图标").props.onClick(); elements(app.render(), "input").find((node) => node.props.type === "number").props.onChange({ target: { value: "20" } }); assert.equal(app.calls[2].signal.aborted, true);
  app.pending[2]({ icons: [], zip: new Blob(["old-zip"]) }); await generated; assert.equal(app.tasks[1].result, null);
  const again = upload().props.onFiles([file]); button(app.render(), "清空图片").props.onClick(); assert.equal(app.calls[3].signal.aborted, true);
  app.pending[3]({ file, width: 20, height: 20, thumbnail: new Blob(["late"]) }); await again;
  assert.equal(app.tasks[0].result, null); assert.equal(button(app.render(), "生成图标").props.disabled, true); app.unmount();
});

test("平台选择、透明与裁切参数传递正确，上传新图取消旧生成并移除旧下载", async () => {
  const app = fixture(), file = new File(["a"], "a.png"); await elements(app.render(), "upload")[0].props.onFiles([file]);
  elements(app.render(), "select")[0].props.onChange({ target: { value: "cover" } });
  checkbox(app.render(), "Web / Android 保留透明背景").props.onChange({ target: { checked: true } });
  checkbox(app.render(), "Apple").props.onChange({ target: { checked: false } });
  await button(app.render(), "生成图标").props.onClick(); assert.equal(app.calls.at(-1).options.fit, "cover"); assert.equal(app.calls.at(-1).options.transparent, true); assert.deepEqual([...app.calls.at(-1).options.platforms], ["web", "android"]);
  await elements(app.render(), "upload")[0].props.onFiles([new File(["b"], "b.png")]); assert.equal(app.tasks[1].result, null); assert.equal(elements(app.render(), "download").length, 0); app.unmount();
});
