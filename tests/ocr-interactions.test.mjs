import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => { const value = allElements(tree, (node) => node.type === "button" && content(node) === title)[0]; assert.ok(value, title); return value; };
function fixture(deferred = false) {
  const calls = [], downloads = [], pending = []; let generation = 0, controller;
  const task = { result: null, busy: false, error: "", reset() { controller?.abort(); generation++; this.result = null; this.busy = false; this.error = ""; }, setError(value) { this.error = value; },
    async run(work) { this.reset(); const job = generation; controller = new AbortController(); this.busy = true; try { const value = await work(controller.signal, () => {}); if (job === generation && !controller.signal.aborted) { this.result = value; return value; } } catch (cause) { if (job === generation) this.error = cause.message; } finally { if (job === generation) this.busy = false; } },
  };
  async function recognize(engine, signal, extras) { calls.push({ engine, signal, ...extras }); if (deferred) return new Promise((resolve) => pending.push(resolve)); return { text: "中 文 字\nEnglish 123\n  code = 1", confidence: 90, engine }; }
  const app = mountComponent("app/components/image-ocr.tsx", "ImageOcr", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask: () => task, LocalUpload: "upload", TaskFeedback: "feedback", useBlobUrl: (blob) => blob ? "blob:source" : "" };
    if (id === "../lib/ocr-image") return { ...loadLocalModule("app/lib/ocr-image.ts"), prepareOcrImage: async (file, options, signal) => { signal.throwIfAborted(); return { image: { data: new Uint8ClampedArray(16), width: 2, height: 2 }, actualScale: 2 }; } };
    if (id === "../lib/ocr-client") return { recognizeImage: (blob, language, signal, report, layout) => recognize("Tesseract", signal, { language, layout }) };
    if (id === "../lib/paddle-ocr-client") return { recognizeWithPaddle: (image, signal) => recognize("PaddleOCR", signal, { image }) };
    if (id === "../lib/local-images") return { pixelsToPng: async () => new Blob(["image"]) };
    if (id === "../lib/local-files") return { ...loadLocalModule("app/lib/local-files.ts"), downloadLocal: (blob, name) => downloads.push({ blob, name }) };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, task, calls, downloads, pending, render() { const tree = app.render(); app.flushEffects(); return tree; } };
}
const edited = (tree) => allElements(tree, (node) => node.type === "textarea" && node.props["aria-label"] === "OCR 识别文字")[0];
const raw = (tree) => allElements(tree, (node) => node.type === "textarea" && node.props["aria-label"] === "OCR 原始识别文字")[0];
const source = new File(["image"], "source.png");
test("默认新引擎整理中文间距但不改英文与缩进，原始结果可独立导出", async () => {
  const app = fixture(); one(app.render(), "upload").props.onFiles([source]); await button(app.render(), "开始识别").props.onClick();
  assert.equal(app.calls[0].engine, "PaddleOCR"); assert.equal(edited(app.render()).props.value, "中文字\nEnglish 123\n  code = 1"); assert.equal(raw(app.render()).props.value, "中 文 字\nEnglish 123\n  code = 1");
  edited(app.render()).props.onChange({ target: { value: "手 动 修 改" } }); button(app.render(), "整理当前中文间距").props.onClick(); assert.equal(edited(app.render()).props.value, "手动修改");
  button(app.render(), "导出原始 TXT").props.onClick(); assert.match(await app.downloads[0].blob.text(), /中 文 字/); assert.equal(app.downloads[0].name, "ocr-raw.txt");
  const key = one(app.render(), "upload").key; button(app.render(), "清空").props.onClick(); assert.notEqual(one(app.render(), "upload").key, key); assert.equal(raw(app.render()), undefined); app.unmount();
});
test("可关闭中文间距整理，兼容引擎保留语言与布局设置", async () => {
  const app = fixture(); one(app.render(), "upload").props.onFiles([source]);
  allElements(app.render(), (node) => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: false } });
  const selects = allElements(app.render(), (node) => node.type === "select"); selects.find((node) => node.props.value === "paddle").props.onChange({ target: { value: "tesseract" } });
  const english = allElements(app.render(), (node) => node.type === "select" && node.props.value === "chi_sim+eng")[0]; assert.equal(english.props.disabled, false); english.props.onChange({ target: { value: "eng" } });
  allElements(app.render(), (node) => node.type === "select" && node.props.value === 11)[0].props.onChange({ target: { value: "7" } });
  await button(app.render(), "开始识别").props.onClick(); assert.equal(app.calls[0].language, "eng"); assert.equal(app.calls[0].layout, 7); assert.match(edited(app.render()).props.value, /中 文 字/); app.unmount();
});
test("识别中换图、调整选区或清空终止旧任务，迟到结果不能回填", async () => {
  for (const action of ["upload", "option", "clear"]) {
    const app = fixture(true); one(app.render(), "upload").props.onFiles([source]); const job = button(app.render(), "开始识别").props.onClick();
    for (let tick = 0; tick < 20 && !app.pending.length; tick++) await Promise.resolve(); assert.equal(app.pending.length, 1);
    if (action === "upload") one(app.render(), "upload").props.onFiles([source]);
    else if (action === "option") allElements(app.render(), (node) => node.type === "input" && node.props.type === "number")[0].props.onChange({ target: { value: "10" } });
    else button(app.render(), "清空").props.onClick();
    assert.equal(app.calls[0].signal.aborted, true); app.pending[0]({ text: "old", confidence: 90 }); await job; assert.equal(edited(app.render()).props.value, ""); assert.equal(raw(app.render()), undefined); app.unmount();
  }
});
