import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/components/file-hash.tsx", import.meta.url), "utf8");
const helpersSource = await readFile(new URL("../app/lib/file-hash.ts", import.meta.url), "utf8");
const compile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const helpers = {};
vm.runInNewContext(compile(helpersSource), { exports: helpers });

function harness() {
  const slots = [], workers = [], cleanups = [], copied = [];
  let cursor = 0, root;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(callback) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(callback()); } },
  };
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compile(source.replaceAll("import.meta.url", '"https://example.test/tool.js"')), {
    exports, URL,
    Worker: class {
      constructor() { workers.push(this); }
      terminate() { this.terminated = true; }
      postMessage(request) { this.request = request; }
      emit(data) { this.onmessage({ data }); }
    },
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return {};
      if (name === "./file-drop-zone") return { FileDropZone: "drop-zone" };
      if (name === "../lib/file-hash") return helpers;
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
    workers, copied, render,
    find,
    button(label) { return find((n) => n.type === "button" && (n.props.children === label || n.props["aria-label"] === label))?.props; },
    click(label) { const props = this.button(label); assert.ok(props); if (!props.disabled) props.onClick(); render(); },
    choose(file) { find((n) => n.type === "drop-zone").props.onFile(file); render(); },
    get status() { return find((n) => n.props?.className === "file-hash-status").props.children; },
    get resultCount() { return find((n) => n.props?.className === "file-hash-result-list")?.props.children.length ?? 0; },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test("选择文件后启动独立计算，完成后显示结果并复制", async () => {
  const ui = harness();
  assert.equal(ui.button("开始计算").disabled, true);
  ui.choose(new File(["abc"], "test.txt"));
  ui.click("开始计算");
  const worker = ui.workers[0];
  assert.deepEqual([...worker.request.algorithms], ["SHA-256"]);
  assert.equal(worker.request.file.name, "test.txt");
  worker.emit({ type: "progress", loaded: 2, total: 3 }); ui.render();
  assert.equal(ui.find((n) => n.type === "progress").props.value, 66);
  const digest = "a".repeat(64);
  worker.emit({ type: "done", results: { "SHA-256": digest } }); ui.render();
  assert.equal(ui.status, "计算完成");
  assert.equal(ui.resultCount, 1);
  assert.equal(worker.terminated, true);
  await ui.button("复制 SHA-256").onClick();
  assert.equal(ui.copied[0], digest);
});

test("取消或更换文件终止旧任务，忽略迟到的结果，可重新计算", () => {
  const ui = harness();
  ui.choose(new File(["a"], "a.txt")); ui.click("开始计算");
  const first = ui.workers[0];
  ui.click("取消计算");
  assert.equal(first.terminated, true);
  first.emit({ type: "done", results: { MD5: "late" } }); ui.render();
  assert.equal(ui.resultCount, 0);
  assert.match(ui.status, /已取消/);
  ui.click("开始计算");
  const second = ui.workers[1];
  ui.choose(new File(["b"], "b.txt"));
  assert.equal(second.terminated, true);
  second.emit({ type: "error", message: "old error" }); ui.render();
  assert.equal(ui.find((n) => n.props?.role === "alert"), undefined);
  assert.equal(ui.button("开始计算").disabled, false);
  ui.click("开始计算");
  assert.equal(ui.workers[2].request.file.name, "b.txt");
  ui.unmount();
  assert.equal(ui.workers[2].terminated, true);
});

test("读取失败和组件加载失败都会恢复计算按钮", () => {
  const ui = harness();
  ui.choose(new File(["a"], "a.txt")); ui.click("开始计算");
  ui.workers[0].emit({ type: "error", message: "无法读取文件" }); ui.render();
  assert.equal(ui.find((n) => n.props?.role === "alert").props.children, "无法读取文件");
  assert.equal(ui.button("开始计算").disabled, false);
  ui.click("开始计算");
  ui.workers[1].onerror({ preventDefault() {} }); ui.render();
  assert.match(ui.find((n) => n.props?.role === "alert").props.children, /加载失败/);
  assert.equal(ui.button("开始计算").disabled, false);
});
