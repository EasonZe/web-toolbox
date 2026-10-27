import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Isolated browser-worker lifecycle adapter. This is not a browser or decoder.
export function workerClientHarness(path, options = {}) {
  const workers = [], timers = new Map(), modules = new Map(); let sequence = 0;
  class BrowserWorker {
    constructor(url, config) {
      if (options.failLoad) throw new Error("worker unavailable");
      this.url = url; this.options = this.config = config; this.terminations = 0;
      workers.push(this); options.construct?.(this);
    }
    postMessage(request, transfer = []) {
      if (options.failPost) throw new Error("cannot send");
      this.request = request; this.transfer = transfer; options.post?.(request, transfer);
    }
    terminate() { this.terminations++; this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
  }
  function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const exports = {}; modules.set(url.href, exports);
    const source = readFileSync(url, "utf8").replaceAll("import.meta.url", JSON.stringify(url.href));
    const scope = {
      exports, URL, Error, DOMException, Blob, Worker: BrowserWorker,
      setTimeout(callback, delay) { timers.set(++sequence, { callback, delay }); return sequence; }, clearTimeout(id) { timers.delete(id); },
      require(id) { if (!id.startsWith(".")) throw new Error(`Unexpected client dependency: ${id}`); return load(new URL(`${id}.ts`, url)); },
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope, { filename: url.pathname });
    return exports;
  }
  return { exports: load(new URL(`../../${path}`, import.meta.url)), workers, timers };
}
