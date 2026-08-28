import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const source = compile(await readFile(new URL("../app/components/image-base64.tsx", import.meta.url), "utf8"));
const helpers = {};
vm.runInNewContext(compile(await readFile(new URL("../app/lib/image-base64.ts", import.meta.url), "utf8")), { exports: helpers });
const content = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);

function harness() {
  const slots = [], cleanups = [], requests = [], revoked = [], blobs = new Map(), copied = [];
  let cursor = 0, root, nextUrl = 0;
  const clipboard = { async writeText(value) { copied.push(value); }, async readText() { return "clipboard-value"; } };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(callback) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(callback()); } },
  };
  const exports = {}, jsx = (type, props) => ({ type, props });
  const convert = (input, signal) => new Promise((resolve, reject) => requests.push({ input, signal, resolve, reject }));
  vm.runInNewContext(source, {
    exports, AbortController, Error, Blob, navigator: { clipboard },
    URL: { createObjectURL(blob) { const url = `blob:test-${++nextUrl}`; blobs.set(url, blob); return url; }, revokeObjectURL(url) { if (url) revoked.push(url); } },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return {};
      if (name === "./file-drop-zone") return { FileDropZone: "drop-zone" };
      if (name === "../lib/image-base64") return { ...helpers, imageFileToBase64: convert, base64ToImage: convert };
      throw new Error(name);
    },
  });
  function find(predicate, node = root) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children.flat(Infinity)) { if (child == null) continue; const found = find(predicate, child); if (found) return found; }
  }
  const render = () => { cursor = 0; root = exports.default(); };
  render();
  return {
    requests, revoked, blobs, copied, clipboard, render, find,
    button(label) { return find((n) => n.type === "button" && content(n) === label)?.props; },
    click(label) { const props = this.button(label); assert.ok(props, label); assert.ok(!props.disabled, label); const promise = props.onClick(); render(); return promise; },
    choose(file) { const done = find((n) => n.type === "drop-zone").props.onFile(file); render(); return done; },
    input(value) { find((n) => n.props?.id === "image-base64-input").props.onChange({ target: { value } }); render(); },
    get status() { return content(find((n) => n.props?.role === "status")); },
    get error() { return content(find((n) => n.props?.role === "alert")); },
    get download() { return find((n) => n.type === "a" && n.props.download)?.props; },
    unmount() { cleanups.forEach((callback) => callback?.()); },
  };
}
const file = new File(["test"], "example.png");
const output = () => ({ blob: new Blob(["original bytes"], { type: "image/png" }), mime: "image/png", width: 32, height: 24, base64: "A".repeat(5000) });

test("自动编码显示完成提示，截断预览不影响完整复制和TXT下载", async () => {
  const ui = harness(); assert.equal(ui.button("复制完整编码").disabled, true);
  const done = ui.choose(file); ui.requests[0].resolve(output()); await done; ui.render();
  const full = `data:image/png;base64,${"A".repeat(5000)}`;
  assert.match(ui.status, /生成完成/);
  assert.equal(ui.find((n) => n.props?.["aria-label"] === "生成的Base64编码").props.value.length, 4000);
  await ui.click("复制完整编码"); ui.render(); assert.equal(ui.copied[0], full);
  assert.equal(await ui.blobs.get(ui.download.href).text(), full);
  assert.equal(ui.download.download, "example-base64.txt");
  const oldUrl = ui.download.href; ui.click("纯Base64");
  assert.ok(ui.revoked.includes(oldUrl)); assert.equal(await ui.blobs.get(ui.download.href).text(), "A".repeat(5000));
  await ui.click("复制完整编码"); assert.equal(ui.copied[1], "A".repeat(5000));
  ui.unmount(); assert.equal(ui.revoked.length, 3);
});

test("还原结果可下载原始图片，修改输入或方向清理旧结果", async () => {
  const ui = harness(); ui.click("Base64 → 图片"); assert.equal(ui.button("还原图片").disabled, true);
  await ui.click("粘贴"); ui.render();
  const done = ui.click("还原图片"); assert.equal(ui.requests[0].input, "clipboard-value");
  ui.requests[0].resolve(output()); await done; ui.render();
  assert.match(ui.status, /还原完成/); assert.equal(ui.download.download, "还原图片.png");
  assert.equal(await ui.blobs.get(ui.download.href).text(), "original bytes");
  ui.input("changed"); assert.equal(ui.download, undefined); assert.equal(ui.revoked.length, 1);
  const bad = ui.click("还原图片"); ui.requests[1].reject(new Error("格式不正确")); await bad; ui.render();
  assert.match(ui.error, /格式不正确/); assert.equal(ui.download, undefined);
  ui.click("图片 → Base64"); assert.equal(ui.error, "");
});

test("取消、切换方向和离开页面不接收迟到的转换结果", async () => {
  const ui = harness(); const first = ui.choose(file);
  ui.click("取消转换"); assert.equal(ui.requests[0].signal.aborted, true);
  const second = ui.choose(file); ui.requests[0].resolve(output()); await first; ui.render();
  assert.equal(ui.download, undefined);
  ui.click("Base64 → 图片"); assert.equal(ui.requests[1].signal.aborted, true);
  ui.requests[1].resolve(output()); await second; ui.render(); assert.equal(ui.download, undefined);
  ui.input("new"); const third = ui.click("还原图片"); ui.unmount(); assert.equal(ui.requests[2].signal.aborted, true);
  ui.requests[2].resolve(output()); await third; assert.equal(ui.blobs.size, 0);
});

test("剪贴板被拒绝时提示手动操作，迟到的粘贴不会覆盖新输入", async () => {
  const ui = harness(); const done = ui.choose(file); ui.requests[0].resolve(output()); await done; ui.render();
  ui.clipboard.writeText = async () => { throw new Error("denied"); };
  await ui.click("复制完整编码"); ui.render(); assert.match(ui.error, /下载TXT/);
  ui.click("Base64 → 图片");
  ui.clipboard.readText = async () => { throw new Error("denied"); };
  await ui.click("粘贴"); ui.render(); assert.match(ui.error, /手动粘贴/);
  let resolvePaste; ui.clipboard.readText = () => new Promise((resolve) => { resolvePaste = resolve; });
  const pasted = ui.click("粘贴"); ui.input("keep-new-input"); resolvePaste("stale"); await pasted; ui.render();
  assert.equal(ui.find((n) => n.props?.id === "image-base64-input").props.value, "keep-new-input");
});
