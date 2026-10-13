import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const nativeRequire = createRequire(import.meta.url),
  cache = new Map();
export function loadLocalModule(path) {
  const url =
    path instanceof URL ? path : new URL(`../../${path}`, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const exports = {};
  cache.set(url.href, exports);
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (id) =>
    id.startsWith(".")
      ? loadLocalModule(new URL(`${id}.ts`, url))
      : nativeRequire(id);
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`, {
    filename: url.pathname,
  })(exports, require);
  return exports;
}
