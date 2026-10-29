import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => { const result = allElements(tree, (node) => node.type === "button" && content(node) === title)[0]; assert.ok(result, title); return result; };
const lib = loadLocalModule("app/lib/browser-info.ts");
const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Hook harness verifies handlers and invalidation; it does not simulate browser layout or permissions.
function fixture({ deferred = false, currentError = false } = {}) {
  const calls = [], pending = []; let reads = 0, inspections = 0, generation = 0, controller;
  const task = {
    result: null, error: "", busy: false,
    reset() { controller?.abort(); controller = null; generation++; this.result = null; this.error = ""; this.busy = false; },
    setError(value) { this.error = value; },
    cancel() { this.reset(); },
    run(work) {
      this.reset(); const job = generation; controller = new AbortController(); const signal = controller.signal; this.busy = true;
      this.pending = (async () => {
        try { const result = await work(signal); if (job === generation && !signal.aborted) this.result = result; }
        catch (error) { if (job === generation) this.error = error.message; }
        finally { if (job === generation) this.busy = false; }
      })(); return this.pending;
    },
  };
  const app = mountComponent("app/components/browser-info.tsx", "BrowserInfo", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask: () => task, TaskFeedback: "feedback" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
    if (id === "../lib/browser-info") return {
      ...lib,
      parseUserAgent: async (value, source, signal) => {
        calls.push({ value, source, signal });
        if (deferred) return new Promise((resolve) => pending.push(resolve));
        return lib.parseUserAgent(value, source, signal);
      },
      readCurrentUserAgent() { reads++; if (currentError) throw new Error("无法读取当前 UA。"); return chrome; },
      inspectBrowserCapabilities() { inspections++; return lib.inspectBrowserCapabilities({ Worker() {}, isSecureContext: true }); },
    };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, calls, pending, task, counts: () => ({ reads, inspections }), render() { const tree = app.render(); app.flushEffects(); return tree; } };
}

test("界面初始不采集，粘贴解析和当前 UA 按显式来源导出，错误输入清理结果", async () => {
  const app = fixture(); assert.deepEqual(app.counts(), { reads: 0, inspections: 0 }); assert.equal(one(app.render(), "text-input").props.text, "");
  one(app.render(), "text-input").props.onChange(chrome); button(app.render(), "解析 User-Agent").props.onClick(); await app.task.pending;
  assert.equal(app.calls[0].source, "pasted-user-agent"); assert.equal(JSON.parse(one(app.render(), "text-result").props.text).browser.name, "Chrome"); assert.equal(app.counts().reads, 0);
  button(app.render(), "读取当前浏览器").props.onClick(); await app.task.pending;
  assert.equal(app.counts().reads, 1); assert.equal(app.calls[1].source, "current-user-agent"); assert.equal(one(app.render(), "text-input").props.text, chrome);
  button(app.render(), "清空 User-Agent").props.onClick(); assert.equal(one(app.render(), "text-result"), undefined);
  button(app.render(), "解析 User-Agent").props.onClick(); await app.task.pending; assert.match(app.task.error, /请输入/); app.unmount();
});

test("本机能力独立展示与导出，粘贴 UA 不被混入能力报告，清空互不影响", async () => {
  const app = fixture(); button(app.render(), "检查当前环境 API").props.onClick();
  assert.equal(app.counts().inspections, 1); assert.equal(app.counts().reads, 0);
  const results = () => allElements(app.render(), (node) => node.type === "text-result");
  assert.equal(results()[0].props.name, "current-browser-capabilities.json"); assert.equal(JSON.parse(results()[0].props.text).userAgent, undefined);
  assert.match(content(app.render()), /存在（不代表可用）/);
  one(app.render(), "text-input").props.onChange(chrome); button(app.render(), "解析 User-Agent").props.onClick(); await app.task.pending;
  assert.equal(results().length, 2);
  assert.equal(JSON.parse(results().find((node) => node.props.name === "browser-user-agent.json").props.text).apis, undefined);
  assert.equal(JSON.parse(results().find((node) => node.props.name === "current-browser-capabilities.json").props.text).browser, undefined);
  button(app.render(), "清空 User-Agent").props.onClick(); assert.equal(results().length, 1); assert.equal(results()[0].props.name, "current-browser-capabilities.json");
  button(app.render(), "重新检查当前环境").props.onClick(); assert.equal(app.counts().inspections, 2);
  button(app.render(), "清空 API 检测").props.onClick(); assert.equal(results().length, 0); app.unmount();
});

test("新输入、清空和取消使解析中的信号失效，迟到结果不展示", async () => {
  for (const mode of ["input", "clear", "cancel"]) {
    const app = fixture({ deferred: true }); one(app.render(), "text-input").props.onChange(chrome);
    button(app.render(), "解析 User-Agent").props.onClick(); const pending = app.task.pending;
    assert.equal(button(app.render(), "解析 User-Agent").props.disabled, true);
    if (mode === "input") one(app.render(), "text-input").props.onChange("new ua");
    else if (mode === "clear") button(app.render(), "清空 User-Agent").props.onClick();
    else one(app.render(), "feedback").props.task.cancel();
    assert.equal(app.calls[0].signal.aborted, true);
    app.pending[0](await lib.parseUserAgent(chrome)); await pending;
    assert.equal(one(app.render(), "text-result"), undefined); app.unmount();
  }
});

test("当前 UA 读取失败时展示错误，不保留旧解析结果", async () => {
  const app = fixture({ currentError: true }); one(app.render(), "text-input").props.onChange(chrome);
  button(app.render(), "解析 User-Agent").props.onClick(); await app.task.pending; assert.ok(one(app.render(), "text-result"));
  button(app.render(), "读取当前浏览器").props.onClick(); assert.match(app.task.error, /无法读取/); assert.equal(one(app.render(), "text-result"), undefined); app.unmount();
});
