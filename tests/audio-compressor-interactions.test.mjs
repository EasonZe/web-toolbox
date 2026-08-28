import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const source = compile(await readFile(new URL("../app/components/audio-compressor.tsx", import.meta.url), "utf8"));
const helperSource = compile(await readFile(new URL("../app/lib/audio-compression.ts", import.meta.url), "utf8"));
const helpers = {};
vm.runInNewContext(helperSource, { exports: helpers });

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
    exports, AbortController,
    URL: { createObjectURL() { return `blob:test-${++nextUrl}`; }, revokeObjectURL(url) { if (url) revoked.push(url); } },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return {};
      if (name === "./file-drop-zone") return { FileDropZone: "drop-zone" };
      if (name === "../lib/audio-compression") return { ...helpers,
        async readAudioInfo() { return { duration: 8, sampleRate: 44100, channels: 2 }; },
        compressAudio(file, settings, signal, onProgress) { return new Promise((resolve, reject) => requests.push({ file, settings, signal, onProgress, resolve, reject })); },
      };
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
    async choose(file) { await find((n) => n.type === "drop-zone").props.onFile(file); render(); },
    get status() { return find((n) => n.props?.role === "status").props.children; },
    get download() { return find((n) => n.type === "a" && n.props.download)?.props; },
    timeout() { [...timers.values()].at(-1)(); render(); },
    unmount() { cleanups.forEach((callback) => callback?.()); },
  };
}
const file = new File([new Uint8Array(1000)], "example.wav", { type: "audio/wav" });

test("音频压缩完成显示下载，参数改变清除旧结果并回收URL", async () => {
  const ui = harness(); assert.equal(ui.button("开始压缩").disabled, true);
  await ui.choose(file); const done = ui.click("开始压缩");
  ui.requests[0].onProgress(40); ui.render();
  assert.equal(ui.find((n) => n.type === "progress").props.value, 40);
  ui.requests[0].resolve(new Blob([new Uint8Array(200)])); await done; ui.render();
  assert.equal(ui.status, "压缩完成"); assert.equal(ui.download.download, "example-compressed.mp3");
  const url = ui.download.href; ui.click("M4A");
  assert.equal(ui.download, undefined); assert.ok(ui.revoked.includes(url));
  assert.equal(ui.status, "");
});

test("取消后可重试，迟到结果不覆盖新任务", async () => {
  const ui = harness(); await ui.choose(file); const first = ui.click("开始压缩");
  const cancel = ui.find((n) => n.props?.className === "audio-compressor-cancel"); cancel.props.onClick(); ui.render();
  assert.equal(ui.requests[0].signal.aborted, true); assert.match(ui.status, /已取消/);
  const second = ui.click("开始压缩");
  ui.requests[0].resolve(new Blob(["late"])); await first; ui.render(); assert.equal(ui.download, undefined);
  ui.requests[1].resolve(new Blob(["current"])); await second; ui.render(); assert.equal(ui.status, "压缩完成");
  ui.unmount(); assert.ok(ui.revoked.includes(ui.download.href));
});

test("未变小不冒充压缩成功，错误和超时恢复按钮", async () => {
  const ui = harness(); await ui.choose(file); const first = ui.click("开始压缩");
  ui.requests[0].resolve(new Blob([new Uint8Array(2000)])); await first; ui.render();
  assert.match(ui.status, /没有变小/); assert.ok(ui.download);
  const second = ui.click("开始压缩"); ui.requests[1].reject(new Error("bad codec")); await second; ui.render();
  assert.ok(ui.find((n) => n.props?.role === "alert")); assert.equal(ui.button("开始压缩").disabled, false);
  const third = ui.click("开始压缩"); ui.timeout();
  assert.equal(ui.requests[2].signal.aborted, true); assert.equal(ui.button("开始压缩").disabled, false);
  ui.requests[2].resolve(new Blob(["late"])); await third; ui.render(); assert.equal(ui.download, undefined);
});

test("离开页面取消正在执行的压缩并释放源文件URL", async () => {
  const ui = harness(); await ui.choose(file); const done = ui.click("开始压缩");
  ui.unmount(); assert.equal(ui.requests[0].signal.aborted, true); assert.ok(ui.revoked.includes("blob:test-1"));
  ui.requests[0].resolve(new Blob(["late"])); await done; ui.render(); assert.equal(ui.download, undefined);
});
