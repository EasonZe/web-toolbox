import assert from "node:assert/strict";
import test from "node:test";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function button(tree, label) { const node = allElements(tree, (n) => n.type === "button" && text(n) === label)[0]; assert.ok(node, label); return node; }
function input(tree, label) { const node = allElements(tree, (n) => n.type === "label" && Array.isArray(n.props.children) && n.props.children.filter((v) => typeof v === "string").join("") === label)[0]; assert.ok(node, label); return allElements(node, (n) => /^(input|textarea|select)$/.test(n.type))[0]; }
function task() { return { result: null, busy: false, error: "", reset() { this.result = null; this.error = ""; }, run(work) { this.reset(); this.pending = (async () => { try { this.result = await work(new AbortController().signal, () => {}); } catch (cause) { this.error = cause.message; } })(); return this.pending; } }; }
function workbench(path, name, props) {
  const tasks = [task(), task(), task()], calls = []; let cursor = 0;
  const app = loadHookComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => tasks[cursor++], TaskFeedback: "feedback", LocalUpload: "upload", LocalDownload: "download", useBlobUrl: (blob) => blob ? "blob:local" : "" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./pdf-local-preview") return { PdfLocalPreview: "pdf-preview" };
    if (id === "./design-color-input") return { DesignColorInput: "color-input" };
    if (id === "./text-utility-parts") return { TextUtilityResult: "text-result" };
    if (id === "../lib/local-files") return { fileSize: (size) => `${size} B` };
    if (id === "../lib/raster-preview") return { readRasterPreview: async (file) => ({ file, width: 100, height: 50, thumbnail: new Blob() }) };
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request) => { calls.push(request); if (request.action === "pdf-page-info") return [{ displayWidth: 300, displayHeight: 400 }]; if (request.action === "image-color-sample") return { hex: "#112233", alpha: 128, x: request.x, y: request.y }; if (request.action === "pptx-extract") return { blob: new Blob(), text: "slide body", images: [], slides: 1, emptySlides: 0 }; return { blob: new Blob(), preview: new Blob(), changedPages: 1, width: 100, height: 50, changed: 10 }; } };
    for (const lib of ["pdf-page-options", "image-color-replace", "resource-limits"]) if (id === `../lib/${lib}`) return loadLocalModule(`app/lib/${lib}.ts`);
  });
  return { tasks, calls, render() { cursor = 0; return app.render(props); } };
}

test("PDF 页码 UI 传递当前范围、中文模板和不透明度，更改设置清理输出", async () => {
  const app = workbench("pdf-page-tools", "PdfPageTools", { mode: "numbers" }), file = new File(["pdf"], "a.pdf");
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([file]);
  input(app.render(), "页码范围（留空处理全部）").props.onChange({ target: { value: "1" } });
  button(app.render(), "第 {n} 页，共 {total} 页").props.onClick();
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "range")[0].props.onChange({ target: { value: "55" } });
  button(app.render(), "添加页码并导出").props.onClick(); await app.tasks[1].pending;
  assert.equal(app.calls[1].action, "pdf-number"); assert.equal(app.calls[1].file, file); assert.equal(app.calls[1].options.range, "1"); assert.equal(app.calls[1].options.opacity, 55); assert.match(app.calls[1].options.template, /第/);
  assert.equal(allElements(app.render(), (n) => n.type === "pdf-preview")[0].props.file, app.tasks[1].result.blob);
  input(app.render(), "起始编号").props.onChange({ target: { value: "7" } }); assert.equal(app.tasks[1].result, null);
});

test("PDF 裁剪 UI 无效边距禁用导出，预览向源文件传递裁切框，换文件清空旧结果", async () => {
  const app = workbench("pdf-page-tools", "PdfPageTools", { mode: "crop" });
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([new File(["x"], "a.pdf")]);
  input(app.render(), "顶部裁去（%）").props.onChange({ target: { value: "95" } }); assert.equal(button(app.render(), "裁剪并导出").props.disabled, true);
  assert.equal(allElements(app.render(), (n) => n.type === "pdf-preview")[0].props.margins, undefined);
  button(app.render(), "四边 5%").props.onClick(); assert.equal(allElements(app.render(), (n) => n.type === "pdf-preview")[0].props.margins.left, 5);
  button(app.render(), "裁剪并导出").props.onClick(); await app.tasks[1].pending; assert.equal(app.calls[1].action, "pdf-crop");
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([]); assert.equal(app.tasks[1].result, null); assert.match(app.tasks[0].error, /一个 PDF/);
});

test("图片换色 UI 按原图坐标取色、标记位置和键盘中心；改设置清理旧输出", async () => {
  const app = workbench("image-color-replace", "ImageColorReplace"), file = new File(["x"], "a.png");
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([file]);
  const picker = () => allElements(app.render(), (n) => n.props?.className === "color-replace-picker")[0];
  picker().props.onClick({ detail: 1, clientX: 150, clientY: 35, currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 10, width: 100, height: 50 }) } }); await app.tasks[2].pending;
  assert.equal(app.calls[0].x, 50); assert.equal(app.calls[0].y, 25); assert.equal(allElements(app.render(), (n) => n.type === "color-input" && n.props.label === "源颜色")[0].props.value, "#112233");
  assert.equal(allElements(app.render(), (n) => n.props?.className === "color-pick-cross")[0].props.style.left, "50.5%"); assert.match(text(app.render()), /原图坐标 x=50, y=25/);
  picker().props.onClick({ detail: 0, currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 10, width: 100, height: 50 }) } }); await app.tasks[2].pending; assert.equal(app.calls[1].x, 50);
  button(app.render(), "开始替换").props.onClick(); await app.tasks[1].pending; assert.equal(app.calls[2].file, file); assert.equal(app.calls[2].options.from, "#112233");
  allElements(app.render(), (n) => n.type === "color-input" && n.props.label === "源颜色")[0].props.onChange("#FFFFFF"); assert.equal(app.tasks[1].result, null); assert.equal(allElements(app.render(), (n) => n.props?.className === "color-pick-cross").length, 0);
});

test("PPTX UI 只在提取后展示下载与正文，不内联执行图片或 SVG", async () => {
  const app = workbench("pptx-extractor", "PptxExtractor"); assert.equal(allElements(app.render(), (n) => n.type === "download").length, 0);
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([new File(["x"], "a.pptx")]);
  assert.equal(app.calls[0].action, "pptx-extract"); assert.equal(allElements(app.render(), (n) => n.type === "text-result")[0].props.text, "slide body");
  app.tasks[0].result.images = [{ blob: new Blob(["<svg/>"]), name: "images/a.svg", size: 6, mime: "image/svg+xml" }];
  assert.equal(allElements(app.render(), (n) => typeof n.type === "string" && /^(img|iframe|object|embed)$/.test(n.type)).length, 0);
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([]); assert.equal(app.tasks[0].result, null);
});

function typingApp() {
  let clock = 0, tick, cleared = 0;
  const app = mountComponent("app/components/typing-test.tsx", "TypingTest", (id) => {
    if (id === "../lib/typing-test") return loadLocalModule("app/lib/typing-test.ts");
    if (id === "./utility-shell") return { UtilityShell: "shell" };
  }, { performance: { now: () => clock }, setInterval: (cb) => { tick = cb; return 1; }, clearInterval: () => cleared++ });
  return { ...app, input: () => input(app.render(), "在此输入"), clock: (n) => clock = n, tick: () => tick(), cleared: () => cleared };
}

test("打字 UI 中文输入法组合期不计时，候选确认才开始；到时拒绝组合中的迟到输入", () => {
  const app = typingApp(); app.render(); app.flushEffects();
  app.clock(1000); app.input().props.onCompositionStart(); app.input().props.onChange({ target: { value: "sheng" }, nativeEvent: { isComposing: true } });
  assert.match(text(app.render()), /首次提交有效输入/); assert.equal(app.input().props.value, "sheng");
  app.input().props.onCompositionEnd({ currentTarget: { value: "生活" } }); assert.match(text(app.render()), /正在测试/); app.flushEffects();
  app.input().props.onCompositionStart(); app.input().props.onChange({ target: { value: "生活ming" }, nativeEvent: { isComposing: true } });
  app.clock(61001); app.tick(); app.render(); app.flushEffects(); assert.equal(app.input().props.readOnly, true);
  app.input().props.onCompositionEnd({ currentTarget: { value: "生活明" } }); assert.equal(app.input().props.value, "生活"); assert.ok(app.cleared() >= 1); app.unmount();
});

test("打字 UI 重新开始隔离旧输入法回调，拦截粘贴/拖放；退出清理计时器", () => {
  const app = typingApp(); app.render(); app.flushEffects(); app.clock(1000);
  const old = app.input(); old.props.onCompositionStart(); button(app.render(), "重新开始").props.onClick(); old.props.onCompositionEnd({ currentTarget: { value: "不应计入" } });
  assert.equal(app.input().props.value, ""); assert.match(text(app.render()), /首次提交/);
  let prevented = 0; for (const name of ["onPaste", "onDrop"]) app.input().props[name]({ preventDefault: () => prevented++ });
  app.input().props.onBeforeInput({ nativeEvent: { inputType: "insertFromPaste" }, preventDefault: () => prevented++ }); assert.equal(prevented, 3);
  app.input().props.onChange({ target: { value: "生活" }, nativeEvent: {} }); app.render(); app.flushEffects(); app.unmount(); assert.equal(app.cleared(), 1);
});

test("打字 UI 无效参考文本不能继续显示旧目标的新成绩，切换示例可恢复", () => {
  const app = typingApp(); input(app.render(), "参考文本").props.onChange({ target: { value: "" } }); button(app.render(), "应用参考文本").props.onClick();
  assert.equal(app.input().props.readOnly, true); assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
  button(app.render(), "英文示例").props.onClick(); assert.equal(app.input().props.readOnly, false); assert.equal(app.input().props.value, ""); app.unmount();
});

function promptApp() {
  let callback, canceled = 0; const events = new Map(), document = { hidden: false, fullscreenElement: null, addEventListener: (name, work) => events.set(name, work), removeEventListener: (name, work) => { if (events.get(name) === work) events.delete(name); } };
  const app = mountComponent("app/components/teleprompter.tsx", "Teleprompter", (id) => {
    if (id === "../lib/resource-limits") return loadLocalModule("app/lib/resource-limits.ts");
    if (id === "../lib/teleprompter") return { startPromptScroll: (opts) => loadLocalModule("app/lib/teleprompter.ts").startPromptScroll({ ...opts, schedule: (work) => { callback = work; return 1; }, cancel: () => canceled++, now: () => 1000 }) };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
  }, { document });
  const tree = app.render(), player = allElements(tree, (n) => n.props?.className === "teleprompter-player")[0], scroller = allElements(tree, (n) => n.props?.className === "teleprompter-scroll")[0];
  const element = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 }; scroller.props.ref.current = element; player.props.ref.current = { requestFullscreen: async () => { throw new Error("全屏被浏览器拒绝"); } }; app.flushEffects();
  return { ...app, element, events, document, tick: (time) => callback(time), canceled: () => canceled, player: () => allElements(app.render(), (n) => n.props?.className === "teleprompter-player")[0] };
}

test("提词器 UI 手动滚动后从当前位置继续，后台自动暂停并清理 RAF", () => {
  const app = promptApp(); button(app.render(), "开始朗读").props.onClick(); app.render(); app.flushEffects();
  app.tick(1050); assert.equal(app.element.scrollTop, 2); app.element.scrollTop = 200; app.tick(1100); assert.equal(app.element.scrollTop, 202);
  app.document.hidden = true; app.events.get("visibilitychange")(); assert.match(text(app.render()), /后台，已暂停/); app.flushEffects(); assert.equal(app.canceled(), 1); assert.equal(app.events.has("visibilitychange"), false);
  app.tick(1200); assert.equal(app.element.scrollTop, 202); app.unmount(); assert.equal(app.events.size, 0);
});

test("提词器 UI 快捷键不截获输入，换稿归零暂停、镜像和全屏失败明确反馈", async () => {
  const app = promptApp(); let prevented = 0;
  app.player().props.onKeyDown({ key: " ", target: { tagName: "TEXTAREA" }, preventDefault: () => prevented++ }); assert.equal(prevented, 0);
  app.player().props.onKeyDown({ key: " ", target: { tagName: "DIV" }, preventDefault: () => prevented++ }); app.render(); app.flushEffects(); assert.equal(prevented, 1); app.tick(1050);
  allElements(app.render(), (n) => n.type === "text-input")[0].props.onChange("新的稿件"); assert.equal(app.element.scrollTop, 0); app.render(); app.flushEffects(); assert.equal(button(app.render(), "开始朗读").props.disabled, false);
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); assert.equal(allElements(app.render(), (n) => n.props?.className === "teleprompter-text")[0].props.style.transform, "scaleX(-1)");
  button(app.render(), "全屏朗读").props.onClick(); await new Promise((resolve) => setImmediate(resolve)); assert.match(text(app.render()), /全屏被浏览器拒绝/);
  app.unmount(); assert.equal(app.events.size, 0);
});

test("PDF 单页预览切页/退出取消旧渲染、销毁文档，旧页不覆盖新页", async () => {
  const renders = [], destroyed = []; let source = 0;
  const app = mountComponent("app/components/pdf-local-preview.tsx", "PdfLocalPreview", (id) => {
    if (id === "./local-workbench") return { useBlobUrl: (blob) => blob ? `blob:${blob.size}` : "" };
    if (id === "../lib/document-pdf") return { loadPdf: async () => { const id = ++source; return { id, loadingTask: { async destroy() { destroyed.push(id); } } }; }, renderPdfPage: (doc, page, signal) => new Promise((resolve) => renders.push({ doc, page, signal, resolve })) };
  });
  const file = new Blob(["pdf"]); app.render({ file, page: 1 }); app.flushEffects(); await new Promise((resolve) => setImmediate(resolve));
  app.render({ file, page: 2 }); app.flushEffects(); await new Promise((resolve) => setImmediate(resolve)); assert.equal(renders[0].signal.aborted, true);
  renders[1].resolve({ blob: new Blob(["new-page"]), width: 200, height: 300 }); await new Promise((resolve) => setImmediate(resolve));
  renders[0].resolve({ blob: new Blob(["old"]), width: 100, height: 100 }); await new Promise((resolve) => setImmediate(resolve));
  const tree = app.render({ file, page: 2 }); assert.equal(allElements(tree, (n) => n.type === "img")[0].props.src, "blob:8"); assert.deepEqual(destroyed.sort(), [1, 2]); app.unmount(); assert.equal(renders[1].signal.aborted, true);
});
