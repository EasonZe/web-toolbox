import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const source = compile(await readFile(new URL("../app/components/document-converter.tsx", import.meta.url), "utf8"));
const helpers = {};
vm.runInNewContext(compile(await readFile(new URL("../app/lib/document-conversion.ts", import.meta.url), "utf8")), { exports: helpers });

function harness() {
  const slots = [], cleanups = [], requests = [], revoked = [], timers = new Map();
  let cursor = 0, root, nextUrl = 0, nextTimer = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(callback) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(callback()); } },
  };
  const exports = {}, jsx = (type, props) => ({ type, props });
  vm.runInNewContext(source, {
    exports, AbortController, Error,
    URL: { createObjectURL() { return `blob:test-${++nextUrl}`; }, revokeObjectURL(url) { if (url) revoked.push(url); } },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return {};
      if (name === "./file-drop-zone") return { FileDropZone: "drop-zone" };
      if (name === "../lib/document-conversion") return helpers;
      if (name === "../lib/document-engine") return { convertDocument(file, settings, signal, progress) { return new Promise((resolve, reject) => requests.push({ file, settings, signal, progress, resolve, reject })); } };
      throw new Error(name);
    },
  });
  function find(predicate, node = root) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children.flat(Infinity)) { if (child == null) continue; const result = find(predicate, child); if (result) return result; }
  }
  const render = () => { cursor = 0; root = exports.default(); };
  render();
  return {
    requests, revoked, render, find,
    button(label) { return find((n) => n.type === "button" && n.props.children === label)?.props; },
    click(label) { const props = this.button(label); assert.ok(props, label); const promise = props.onClick(); render(); return promise; },
    choose(file) { find((n) => n.type === "drop-zone").props.onFile(file); render(); },
    get status() { return find((n) => n.props?.role === "status").props.children; },
    get download() { return find((n) => n.type === "a" && n.props.download)?.props; },
    timeout() { [...timers.values()].at(-1)(); render(); },
    unmount() { cleanups.forEach((callback) => callback?.()); },
  };
}
const file = new File(["test"], "example.docx");
const output = () => ({ blob: new Blob(["pdf"]), preview: new Blob(["png"]), pages: 2, warnings: [] });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("文档转换完成显示下载与完成提示，调整设置回收结果和预览", async () => {
  const ui = harness(); assert.equal(ui.button("开始转换").disabled, true);
  ui.choose(file); const done = ui.click("开始转换"); await tick();
  ui.requests[0].progress(65, "生成PDF"); ui.render();
  assert.equal(ui.find((n) => n.type === "progress").props.value, 65);
  ui.requests[0].resolve(output()); await done; ui.render();
  assert.match(ui.status, /转换完成/); assert.equal(ui.download.download, "example.pdf");
  ui.click("横向"); assert.equal(ui.download, undefined); assert.equal(ui.revoked.length, 2);
});

test("文档取消后迟到结果不覆盖新任务，离开页面释放资源", async () => {
  const ui = harness(); ui.choose(file); const first = ui.click("开始转换"); await tick();
  ui.click("取消转换"); assert.equal(ui.requests[0].signal.aborted, true);
  const second = ui.click("开始转换"); await tick();
  ui.requests[0].resolve(output()); await first; ui.render(); assert.equal(ui.download, undefined);
  ui.requests[1].resolve(output()); await second; ui.render(); assert.ok(ui.download);
  ui.unmount(); assert.equal(ui.revoked.length, 2);
});

test("转换方向清空源文件，错误、超时和旧版DOC不会假报成功", async () => {
  const ui = harness(); ui.choose(new File(["x"], "old.doc"));
  assert.ok(ui.find((n) => n.props?.role === "alert")); assert.equal(ui.button("开始转换").disabled, true);
  ui.choose(file); ui.click("PDF → Word"); assert.equal(ui.button("开始转换").disabled, true);
  ui.choose(new File(["pdf"], "test.pdf")); const failed = ui.click("开始转换"); await tick();
  ui.requests[0].reject(new Error("损坏PDF")); await failed; ui.render();
  assert.match(ui.find((n) => n.props?.role === "alert").props.children, /损坏PDF/); assert.equal(ui.download, undefined);
  const timed = ui.click("开始转换"); await tick(); ui.timeout(); assert.equal(ui.requests[1].signal.aborted, true);
  ui.requests[1].resolve(output()); await timed; ui.render(); assert.equal(ui.download, undefined);
});
