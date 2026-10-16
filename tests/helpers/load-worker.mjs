import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

// Every test gets its own isolate, including its memory cache and in-flight jobs.
export function loadWorker(path, mocks = {}) {
  const modules = new Map();
  const scope = vm.createContext({
    console: { log() {}, error() {} }, Date, performance, crypto: webcrypto,
    URL, Request, Response, Headers, TextEncoder, TextDecoder, Uint8Array,
    AbortController, AbortSignal, DOMException, setTimeout, clearTimeout,
    fetch() { throw new Error("Unexpected network request in Worker test"); },
    ...mocks,
  });
  function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const workerModule = { exports: {} }; modules.set(url.href, workerModule.exports);
    const code = ts.transpileModule(readFileSync(url, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = (id) => {
      if (id.startsWith(".")) return load(new URL(id.endsWith(".js") || id.endsWith(".ts") ? id : `${id}.ts`, url));
      if (id === "cloudflare:sockets") return { connect: mocks.connect || (() => { throw Error("Unexpected socket"); }) };
      if (id === "@cloudflare/puppeteer") return mocks.puppeteer || { launch() { throw Error("Unexpected browser launch"); } };
      throw Error(`Unexpected module: ${id}`);
    };
    vm.runInContext(`(function(module, exports, require) { ${code}\n })`, scope, { filename: url.pathname })(workerModule, workerModule.exports, require);
    modules.set(url.href, workerModule.exports);
    return workerModule.exports;
  }
  return load(new URL(`../../${path}`, import.meta.url));
}

export function mockEdgeCache() {
  const entries = new Map();
  return { default: {
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, new Response(await response.text(), { headers: response.headers })); },
    async delete(request) { return entries.delete(request.url); },
  }, entries };
}
