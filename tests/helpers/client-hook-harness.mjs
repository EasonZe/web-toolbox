import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
export function loadHookComponent(path, name, resolve, globals = {}) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const slots = [], effects = [], exported = {};
  let cursor = 0;
  const hooks = {
    useMemo(work) { return work(); },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect(work) { effects.push(work); },
  };
  vm.runInNewContext(`${code}\nexports.testComponent = ${name};`, {
    exports: exported, TextDecoder, File, Blob, URL, Error, ...globals,
    require(id) { return id === "react" ? hooks : resolve(id) ?? nativeRequire(id); },
  });
  return {
    slots,
    render(props) { cursor = 0; return exported.testComponent(props); },
    runEffects() { return effects.splice(0).map((work) => work()); },
  };
}

export function allElements(root, predicate) {
  const pending = [root], found = [];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item)) { pending.push(...item); continue; }
    if (predicate(item)) found.push(item);
    pending.push(item.props?.children);
  }
  return found;
}
