import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => { const node = allElements(tree, (node) => node.type === "button" && content(node) === title)[0]; assert.ok(node, title); return node; };
function control(tree, label) { const parent = allElements(tree, (node) => node.type === "label" && content(node.props.children[0]) === label)[0]; assert.ok(parent, label); return allElements(parent, (node) => ["input", "textarea", "select"].includes(node.type))[0]; }
function fixture(name, deferred = false) {
  const tasks = [], calls = [], owners = [], pending = []; let cursor = 0;
  function task() {
    let generation = 0, controller;
    return { result: null, busy: false, error: "", setError(value) { this.error = value; }, reset() { controller?.abort(); generation++; this.result = null; this.busy = false; this.error = ""; }, run(work) {
      this.reset(); const job = generation; controller = new AbortController(); const signal = controller.signal; this.busy = true;
      this.pending = (async () => { try { const result = await work(signal, () => {}); if (job === generation && !signal.aborted) { this.result = result; return result; } } catch (cause) { if (job === generation) this.error = cause.message; } finally { if (job === generation) this.busy = false; } })(); return this.pending;
    } };
  }
  const app = mountComponent(`app/components/${name}.tsx`, { "id-photo": "IdPhoto", "font-preview": "FontPreview", "texture-memory": "TextureMemory" }[name], (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask() { return tasks[cursor++] ??= task(); }, LocalUpload: "upload", LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl: (blob) => blob ? "blob:owned" : "" };
    if (id === "./text-utility-parts") return { TextUtilityResult: "text-result" };
    if (id === "../lib/id-photo") return { ...loadLocalModule("app/lib/id-photo.ts"), makeIdPhoto: async (file, options, signal) => { calls.push({ action: "single", file, options, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { blob: new Blob(["photo"]), width: 295, height: 413, dpi: options.dpi }; }, makeIdPhotoSheet: async (file, options, paper, signal) => { calls.push({ action: "sheet", file, options, paper, signal }); return { blob: new Blob(["sheet"]), copies: paper.copies, dpi: options.dpi, capacity: 9, width: 1200, height: 1800 }; } };
    if (id === "../lib/id-photo-matte-client") return { removePortraitBackground: async (file, signal) => { calls.push({ action: "matte", file, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return new Blob(["transparent"], { type: "image/png" }); } };
    if (id === "../lib/font-preview") return { ...loadLocalModule("app/lib/font-preview.ts"), createFontPreviewSession() {
      const owner = { disposed: 0, dispose() { this.disposed++; }, async load(files, signal) { calls.push({ action: "font", files, signal }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return [{ id: "owned-font", family: "owned-font", name: files[0].name, format: "TTF", size: 100, decodedBytes: 100 }]; } }; owners.push(owner); return owner;
    } };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, tasks, calls, owners, pending, render() { cursor = 0; const tree = app.render(); app.flushEffects(); return tree; } };
}
test("贴图UI按当前格式/数量计算，参数错误清除结果，支持独立JSON导出", async () => {
  const app = fixture("texture-memory"); assert.equal(one(app.render(), "text-result"), undefined);
  button(app.render(), "计算纹理数据量").props.onClick(); await app.tasks[0].pending; assert.equal(JSON.parse(one(app.render(), "text-result").props.text).totalBytes, "22369620");
  control(app.render(), "纹理格式").props.onChange({ target: { value: "bc1" } }); assert.equal(one(app.render(), "text-result"), undefined);
  control(app.render(), "宽度（像素）").props.onChange({ target: { value: "-1" } }); button(app.render(), "计算纹理数据量").props.onClick(); await app.tasks[0].pending; assert.match(app.tasks[0].error, /正整数/); app.unmount();
});
test("字体仅上传时加载，显示本地独立family且不假粗体，重选清空与卸载移除owner", async () => {
  const app = fixture("font-preview"); app.render(); assert.equal(app.calls.length, 0);
  one(app.render(), "upload").props.onFiles([new File(["font"], "a.ttf")]); await app.tasks[0].pending;
  const sample = allElements(app.render(), (node) => node.props?.className === "font-preview-sample")[0]; assert.match(sample.props.style.fontFamily, /owned-font/); assert.equal(sample.props.style.fontSynthesis, "none");
  control(app.render(), "字号（px）").props.onChange({ target: { value: "7" } }); assert.match(content(app.render()), /8–160/);
  button(app.render(), "重置字号与字重").props.onClick();
  one(app.render(), "upload").props.onFiles([new File(["font"], "b.ttf")]); await app.tasks[0].pending; assert.equal(app.owners[0].disposed, 1);
  button(app.render(), "清空字体").props.onClick(); assert.equal(app.owners[1].disposed, 1); assert.equal(app.tasks[0].result, null);
  one(app.render(), "upload").props.onFiles([new File(["font"], "c.ttf")]); await app.tasks[0].pending; app.unmount(); assert.equal(app.owners[2].disposed, 1);
});
test("字体加载中换文件使旧信号失效，原生晚到结果不复活", async () => {
  const app = fixture("font-preview", true); one(app.render(), "upload").props.onFiles([new File(["font"], "a.ttf")]); const job = app.tasks[0].pending;
  one(app.render(), "upload").props.onFiles([new File(["font"], "b.ttf")]); assert.equal(app.calls[0].signal.aborted, true); assert.equal(app.owners[0].disposed, 1);
  app.pending[0]([{ id: "old" }]); await job; assert.equal(app.tasks[0].result, null); app.pending[1]([]); await app.tasks[0].pending; app.unmount();
});
test("证件照不自动下载模型，单张/排版传递规格；换底后旧成品清理，抠图显式启用", async () => {
  const app = fixture("id-photo"), file = new File(["photo"], "portrait.png"); app.render(); assert.equal(app.calls.length, 0);
  one(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls.length, 0);
  button(app.render(), "生成单张证件照").props.onClick(); await app.tasks[1].pending; assert.equal(app.calls[0].file, file); assert.equal(app.calls[0].options.widthMm, 25); assert.equal(app.calls[0].options.dpi, 300);
  assert.ok(allElements(app.render(), (node) => node.type === "download" && node.props.title === "下载单张证件照").length);
  button(app.render(), "蓝").props.onClick(); assert.equal(app.tasks[1].result, null); button(app.render(), "生成相纸排版").props.onClick(); await app.tasks[2].pending; assert.equal(app.calls.at(-1).paper.copies, 8); assert.equal(app.calls.at(-1).options.background, "#438edb");
  button(app.render(), "启用本地人像抠图").props.onClick(); await app.tasks[0].pending; assert.equal(app.calls.at(-1).action, "matte"); assert.equal(app.tasks[2].result, null);
  button(app.render(), "生成单张证件照").props.onClick(); await app.tasks[1].pending; assert.equal(app.calls.at(-1).file.name, "portrait.png"); assert.equal(await app.calls.at(-1).file.text(), "transparent");
  button(app.render(), "还原原图").props.onClick(); assert.equal(app.tasks[0].result, null); assert.equal(app.tasks[1].result, null); app.unmount();
});
test("证件照换源或改参数取消旧生成，模型晚到不能回填到新照片", async () => {
  const app = fixture("id-photo", true), file = new File(["x"], "photo.png"); one(app.render(), "upload").props.onFiles([file]);
  button(app.render(), "启用本地人像抠图").props.onClick(); const job = app.tasks[0].pending; for (let i = 0; i < 20 && !app.pending.length; i++) await Promise.resolve(); assert.equal(app.pending.length, 1);
  one(app.render(), "upload").props.onFiles([file]); assert.equal(app.calls[0].signal.aborted, true); app.pending[0](new Blob(["old"])); await job; assert.equal(app.tasks[0].result, null);
  button(app.render(), "生成单张证件照").props.onClick(); const single = app.tasks[1].pending; assert.equal(button(app.render(), "生成相纸排版").props.disabled, true);
  control(app.render(), "宽度 mm").props.onChange({ target: { value: "35" } }); assert.equal(app.calls[1].signal.aborted, true); app.pending[1]({ blob: new Blob(["old"]) }); await single; assert.equal(app.tasks[1].result, null); app.unmount();
});
