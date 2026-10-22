import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const currency = loadLocalModule("app/lib/currency.ts");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function client() {
  const requests = [], timers = new Map(); let nextTimer = 0;
  const component = mountComponent("app/components/currency-converter.tsx", "CurrencyConverter", (id) =>
    id === "../lib/currency" ? currency : id === "./utility-shell" ? { UtilityShell: "section" } : undefined,
  {
    window: { setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } },
    fetch(url, options) { const job = deferred(); requests.push({ ...job, url, signal: options.signal }); return job.promise; },
  });
  return { component, requests, load() { component.flushEffects(); for (const [id, fn] of timers) { timers.delete(id); fn(); } } };
}
const response = (base, quote, rate) => ({ ok: true, json: async () => ({ base, quote, rate, date: "2026-10-22", fetchedAt: 1000 }) });
const settle = () => new Promise((done) => setImmediate(done));
const text = (tree) => JSON.stringify(tree);
test("切换货币后不能把旧汇率套在新币种上，旧请求迟到也不能覆盖新结果", async () => {
  const { component, requests, load } = client();
  component.render(); load();
  requests[0].resolve(response("CNY", "USD", .14)); await settle();
  let tree = component.render(); assert.match(text(tree), /0.14/);
  allElements(tree, (node) => node.type === "select" && node.props.value === "CNY")[0].props.onChange({ target: { value: "EUR" } });
  tree = component.render(); assert.doesNotMatch(text(tree), /0.14/); load();
  allElements(tree, (node) => node.type === "select" && node.props.value === "EUR")[0].props.onChange({ target: { value: "GBP" } });
  component.render(); load(); assert.equal(requests[1].signal.aborted, true);
  requests[2].resolve(response("GBP", "USD", 1.3)); await settle();
  requests[1].resolve(response("EUR", "USD", 1.1)); await settle();
  tree = component.render(); assert.match(text(tree), /1.3/); assert.doesNotMatch(text(tree), /1.1/);
  component.unmount();
});
test("在等待新币种时交换不会反转不匹配的旧汇率", async () => {
  const { component, requests, load } = client(); component.render(); load();
  requests[0].resolve(response("CNY", "USD", .14)); await settle();
  let tree = component.render();
  allElements(tree, (node) => node.type === "select" && node.props.value === "CNY")[0].props.onChange({ target: { value: "EUR" } });
  tree = component.render();
  allElements(tree, (node) => node.props?.["aria-label"] === "交换货币")[0].props.onClick();
  tree = component.render(); assert.doesNotMatch(text(tree), /7.142857|0.14/);
  component.unmount();
});

async function server(fetch) {
  const exports = {}, source = await readFile(new URL("../app/api/exchange-rates/route.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, fetch, AbortSignal,
    require(id) { return id === "next/server" ? { NextResponse: Response } : { currencyCodes: currency.currencyCodes }; },
  });
  return (base = "CNY", quote = "USD", signal = new AbortController().signal) => {
    const request = new Request(`http://localhost/api/exchange-rates?base=${base}&quote=${quote}`, { signal });
    return exports.GET(Object.assign(request, { nextUrl: new URL(request.url) }));
  };
}
test("汇率接口拒绝畸形上游数据，不缓存负数、字符串与非有限汇率", async () => {
  for (const rate of [-1, 0, "0.14", Infinity, NaN]) {
    const get = await server(async () => ({ ok: true, json: async () => [{ base: "CNY", quote: "USD", rate, date: "2026-10-22" }] }));
    assert.equal((await get()).status, 502);
  }
  let calls = 0;
  const get = await server(async () => { calls++; return { ok: true, json: async () => [{ base: "CNY", quote: "USD", rate: .14, date: "2026-10-22" }] }; });
  assert.equal((await get("CNY", "CNY")).status, 200); assert.equal(calls, 0);
  const valid = await get(); assert.equal(valid.status, 200); assert.match(valid.headers.get("cache-control"), /max-age=900/);
  assert.equal((await get("BAD")).status, 400);
});
test("汇率上游请求有 8 秒超时且跟随调用方取消", async (t) => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, "timeout", (milliseconds) => { assert.equal(milliseconds, 8000); return deadline.signal; });
  let options;
  const get = await server(async (_, init) => { options = init; return { ok: true, json: async () => [] }; });
  const controller = new AbortController(); await get("CNY", "USD", controller.signal);
  assert.equal(options.signal.aborted, false); controller.abort(); assert.equal(options.signal.aborted, true);
  await get(); assert.equal(options.signal.aborted, false); deadline.abort(); assert.equal(options.signal.aborted, true);
});
