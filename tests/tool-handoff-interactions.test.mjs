import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
const handoff = loadLocalModule("app/lib/tool-handoff.ts"), limits = loadLocalModule("app/lib/resource-limits.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const pdf = () => new File(["%PDF-1.7"], "source.pdf", { type: "application/pdf" });
const image = () => new File(["png"], "source.png", { type: "image/png" });
const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function button(tree, label) { const node = allElements(tree, (n) => n.type === "button" && text(n) === label)[0]; assert.ok(node, label); return node; }
function setup(name, options = {}) {
  const store = handoff.createToolHandoffStore({ schedule: () => 1, cancel: () => {} }), paths = [], reads = [];
  const app = mountComponent("app/components/tool-handoff.tsx", name, (id) => {
    if (id === "next/navigation") return { useRouter: () => ({ push(path) { if (options.navigationError) throw new Error("navigation failed"); paths.push(path); } }) };
    if (id === "../lib/tool-handoff") return { ...handoff, offerHandoff: store.offer, discardHandoff: store.discard, peekHandoff: store.peek, subscribeHandoff: store.subscribe, handoffSnapshot: store.snapshot };
    if (id === "../lib/resource-limits") return { ...limits, largeFilesWarning: () => options.large ? "大文件占用更多内存" : "" };
    if (id === "../lib/local-images") return { inspectRasterHeader: (bytes) => { reads.push(bytes.byteLength); return options.largePixels ? { width: 100001, height: 100001 } : { width: 10, height: 20 }; } };
    if (id === "./local-workbench") return { LocalDownload: "download" };
  });
  return { ...app, paths, reads, store };
}

test("继续处理只在点击时创建文件并存入内存，导航仅为白名单原路径", () => {
  const app = setup("ResultContinue"), file = pdf(); let created = 0;
  const props = { source: "PDF 页面管理", targets: ["/pdf-page-numbers", "/pdf-cropper"], getFiles: () => { created++; return [file]; } };
  app.render(props); app.flushEffects(); assert.equal(created, 0); assert.equal(app.store.snapshot(), null);
  button(app.render(props), "PDF 加页码").props.onClick(); assert.equal(created, 1); assert.deepEqual(app.paths, ["/pdf-page-numbers"]); assert.equal(app.store.snapshot().files[0], file);
  app.unmount(); assert.ok(app.store.snapshot(), "source unmount must not erase an in-flight route handoff"); app.store.clear();
});

test("来源工具忙碌时不发送；导航失败清理暂存，格式不支持不导航", () => {
  for (const mode of ["disabled", "navigation", "format"]) {
    const app = setup("ResultContinue", { navigationError: mode === "navigation" }), props = { source: "source", targets: ["/pdf-cropper"], disabled: mode === "disabled", getFiles: () => [mode === "format" ? image() : pdf()] };
    button(app.render(props), "PDF 页面裁剪").props.onClick(); assert.equal(app.paths.length, 0); assert.equal(app.store.snapshot(), null);
    const alerts = allElements(app.render(props), (node) => node.props?.role === "alert"); assert.equal(alerts.length, mode === "disabled" ? 0 : 1); app.unmount();
  }
});

test("目标页不自动导入、不生成下载 URL，确认一次且不重复接收", async () => {
  const app = setup("ToolHandoffInput"); let calls = 0, resolve;
  const props = { target: "/pdf-cropper", behavior: "replace", onFiles: (files) => { calls++; assert.equal(files[0].name, "source.pdf"); return new Promise((done) => resolve = done); } };
  assert.equal(app.render(props), null); app.flushEffects(); app.store.offer("/pdf-cropper", [pdf()], "PDF 页面管理");
  let tree = app.render(props); app.flushEffects(); assert.equal(calls, 0); assert.equal(allElements(tree, (node) => node.type === "download").length, 0); assert.match(text(tree), /替换当前输入并清除旧输出/);
  const receive = button(tree, "接收文件"); receive.props.onClick(); receive.props.onClick(); await tick(); assert.equal(calls, 1);
  tree = app.render(props); assert.equal(button(tree, "正在接收…").props.disabled, true); resolve(true); await tick(); assert.equal(app.store.snapshot(), null); app.unmount();
});

test("接收失败保留原批次，可显式展开下载及重试，成功后才释放", async () => {
  const app = setup("ToolHandoffInput"); let accepted = false;
  const props = { target: "/pdf-cropper", behavior: "replace", onFiles: async () => accepted }, packet = app.store.offer("/pdf-cropper", [pdf()], "source");
  app.render(props); app.flushEffects(); button(app.render(props), "接收文件").props.onClick(); await tick(); assert.equal(app.store.snapshot(), packet); assert.match(text(app.render(props)), /未能导入/);
  button(app.render(props), "查看 / 下载文件").props.onClick(); const download = allElements(app.render(props), (node) => node.type === "download")[0]; assert.equal(download.props.blob, packet.files[0]); assert.equal(download.props.name, "source.pdf");
  accepted = true; button(app.render(props), "接收文件").props.onClick(); await tick(); assert.equal(app.store.snapshot(), null); app.unmount();
});

test("错误目标不显示文件，忙碌目标不能导入，旧忽略与完成不能清理新批次", async () => {
  const app = setup("ToolHandoffInput"); let calls = 0, finish;
  const props = { target: "/pdf-cropper", behavior: "replace", onFiles: () => { calls++; return new Promise((resolve) => finish = resolve); } };
  app.store.offer("/pdf-page-numbers", [pdf()], "wrong"); assert.equal(app.render(props), null); app.flushEffects();
  app.store.offer("/pdf-cropper", [pdf()], "first"); const oldIgnore = button(app.render(props), "忽略");
  let tree = app.render({ ...props, disabled: true }); app.flushEffects(); button(tree, "接收文件").props.onClick(); await tick(); assert.equal(calls, 0);
  tree = app.render(props); app.flushEffects(); button(tree, "接收文件").props.onClick(); await tick();
  const latest = app.store.offer("/pdf-cropper", [pdf()], "latest"); oldIgnore.props.onClick(); finish(true); await tick(); assert.equal(app.store.snapshot(), latest); app.unmount(); app.store.clear();
});

test("图片接收保留 64 KiB 文件头 / 像素预检，未确认不读头，大文件明确提示", async () => {
  const app = setup("ToolHandoffInput", { large: true }); let calls = 0; const slices = [], file = image(), slice = file.slice.bind(file);
  file.slice = (start, end) => { slices.push([start, end]); return slice(start, end); };
  app.store.offer("/images-to-pdf", [file], "source"); const props = { target: "/images-to-pdf", behavior: "append", onFiles: async () => { calls++; return true; } };
  let tree = app.render(props); app.flushEffects(); assert.equal(slices.length, 0); assert.match(text(tree), /添加到当前文件列表/); assert.match(text(tree), /大文件占用更多内存/);
  button(tree, "继续接收文件").props.onClick(); await tick(); assert.deepEqual(slices, [[0, 65536]]); assert.equal(calls, 1); assert.equal(app.store.snapshot(), null); app.unmount();
});

test("坏图片 / 超像素预检失败不调用目标处理函数，仍可保存传入文件", async () => {
  const app = setup("ToolHandoffInput", { largePixels: true }); let calls = 0;
  const packet = app.store.offer("/images-to-pdf", [image()], "source"), props = { target: "/images-to-pdf", behavior: "append", onFiles: async () => { calls++; return true; } };
  app.render(props); app.flushEffects(); button(app.render(props), "接收文件").props.onClick(); await tick(); assert.equal(calls, 0); assert.equal(app.store.snapshot(), packet); assert.match(text(app.render(props)), /像素/); app.unmount(); app.store.clear();
});

test("预检过程中离开、换批次或手动改变输入，迟到文件不进入目标", async () => {
  for (const mode of ["unmount", "replace", "input"]) {
    const app = setup("ToolHandoffInput"), file = image(); let finish, calls = 0;
    file.slice = () => ({ arrayBuffer: () => new Promise((resolve) => finish = resolve) });
    const original = app.store.offer("/images-to-pdf", [file], "source"), props = { target: "/images-to-pdf", behavior: "append", onFiles: async () => { calls++; return true; } };
    app.render(props); app.flushEffects(); button(app.render(props), "接收文件").props.onClick(); await tick();
    if (mode === "unmount") app.unmount();
    if (mode === "replace") app.store.offer("/images-to-pdf", [image()], "new");
    if (mode === "input") { app.render({ ...props, onFiles: async () => { calls++; return true; } }); app.flushEffects(); }
    finish(new ArrayBuffer(8)); await tick(); assert.equal(calls, 0); assert.ok(app.store.snapshot());
    if (mode !== "replace") assert.equal(app.store.snapshot(), original);
    if (mode !== "unmount") app.unmount(); app.store.clear();
  }
});
