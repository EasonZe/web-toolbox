import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
// Dependency-aware effect runner for isolated component logic, not a DOM/browser substitute.
export function mountComponent(path, name, resolve, globals = {}) {
  const slots = [], refs = [], pending = new Set();
  let cursor = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  function memoSlot(work, deps) {
    const i = cursor++;
    if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: work(), deps };
    return slots[i].value;
  }
  const hooks = {
    useMemo: memoSlot, useCallback: (fn, deps) => memoSlot(() => fn, deps),
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (next) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useRef(value) { const i = cursor++; if (!slots[i]) { slots[i] = { current: value }; refs.push(slots[i]); } return slots[i]; },
    useEffect(work, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { slots[i] = { deps, work, cleanup: slots[i]?.cleanup }; pending.add(i); } },
  };
  const scope = { exports: {}, Error, URL, Blob, File, AbortController, AbortSignal, DOMException, setTimeout, clearTimeout, ...globals };
  scope.require = (id) => id === "react" ? hooks : resolve(id) ?? nativeRequire(id);
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(`${code}\nexports.testComponent = ${name};`, scope);
  return {
    refs,
    render(props) { cursor = 0; return scope.exports.testComponent(props); },
    flushEffects() { for (const i of pending) { slots[i].cleanup?.(); slots[i].cleanup = slots[i].work(); } pending.clear(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); pending.clear(); },
  };
}
