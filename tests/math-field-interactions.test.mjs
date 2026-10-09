import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(await readFile(new URL("../app/components/math-field.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function harness(initial) {
  const slots = [], pendingEffects = [], cleanups = [], fields = [];
  let cursor = 0;
  const hooks = {
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], (next) => { slots[index] = next; }]; },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!(index in slots) || dependencies.some((value, i) => value !== slots[index][i])) {
        slots[index] = dependencies; pendingEffects.push(() => { cleanups[index]?.(); cleanups[index] = callback(); });
      }
    },
  };
  class MathfieldElement {
    constructor() { this.listeners = new Map(); this.attributes = {}; this.value = ""; fields.push(this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    setValue(value, options) { this.value = value; this.lastOptions = options; }
    addEventListener(key, handler) { this.listeners.set(key, handler); }
    removeEventListener(key) { this.listeners.delete(key); }
    remove() { this.removed = true; }
    dispatch(key, event = {}) { this.listeners.get(key)?.(event); }
  }
  const exports = {};
  const jsx = (type, props) => {
    if (props.ref) props.ref.current ??= { appendChild() {} };
    return { type, props };
  };
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "mathlive") return { MathfieldElement };
      throw new Error(name);
    },
  });
  function render(props) { cursor = 0; exports.MathField(props); pendingEffects.splice(0).forEach((effect) => effect()); }
  render(initial);
  await new Promise(setImmediate);
  return { render, fields, get field() { return fields.at(-1); }, unmount() { cleanups.forEach((cleanup) => cleanup?.()); } };
}

test("公式输入只通知实际变化，回车的重复输入事件不取消计算", async () => {
  const changes = []; let submitted = 0;
  const props = { value: "x+1", label: "公式", onChange: (value) => changes.push(value), onEnter: () => { submitted++; } };
  const ui = await harness(props);
  ui.field.dispatch("input");
  assert.equal(changes.length, 0);
  ui.field.value = "x+2"; ui.field.dispatch("input");
  assert.deepEqual(changes, ["x+2"]);
  ui.render({ ...props, value: "x+2" });
  let prevented = false;
  ui.field.dispatch("keydown", { key: "Enter", preventDefault() { prevented = true; } });
  ui.field.dispatch("input");
  assert.equal(submitted, 1);
  assert.equal(prevented, true);
  assert.equal(changes.length, 1);
  ui.field.value = "x".repeat(501); ui.field.dispatch("input");
  assert.equal(ui.field.value, "x+2");
  assert.equal(changes.length, 1);
  ui.unmount(); assert.equal(ui.field.removed, true); assert.equal(ui.field.listeners.size, 0);
});

test("只读公式不会提交，更新结果同步显示与无障碍标签", async () => {
  let submitted = 0;
  const props = { value: "1/2", label: "结果：1/2", readOnly: true, onEnter: () => { submitted++; } };
  const ui = await harness(props);
  assert.equal(ui.field.readOnly, true);
  assert.equal(ui.field.tabIndex, -1);
  ui.field.dispatch("keydown", { key: "Enter" });
  assert.equal(submitted, 0);
  ui.render({ ...props, value: "3", label: "结果：3" });
  assert.equal(ui.field.value, "3");
  assert.equal(ui.field.attributes["aria-label"], "结果：3");
  assert.equal(ui.field.lastOptions.silenceNotifications, true);
  ui.unmount();
});
