import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const component = await readFile(new URL("../app/components/video-tool.tsx", import.meta.url), "utf8");
const links = await readFile(new URL("../app/lib/video-links.ts", import.meta.url), "utf8");

function compile(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const linkExports = {};
vm.runInNewContext(compile(links, "video-links.ts"), { exports: linkExports, URL });
const componentCode = compile(component, "video-tool.tsx");

// Execute the actual component handlers with isolated hooks and clipboard APIs.
// No clipboard contents from the user's machine are accessed by these tests.
function harness(config, readText) {
  const slots = [];
  let cursor = 0;
  let clipboardReads = 0;
  let focused = false;
  let root;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(componentCode, {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return { FiClipboard: "svg", FiDownload: "svg" };
      if (name === "../lib/video-links") return linkExports;
      throw new Error(`Unexpected import: ${name}`);
    },
    navigator: readText ? { clipboard: { readText: async () => { clipboardReads++; return readText(); } } } : {},
    setTimeout: () => 1,
    clearTimeout() {},
  });

  function find(predicate, node = root) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children.flat(Infinity)) {
      if (child == null) continue;
      const match = find(predicate, child);
      if (match) return match;
    }
  }
  function render() {
    cursor = 0;
    root = exports.default({ config });
    find((node) => node.type === "textarea").props.ref.current = { focus() { focused = true; } };
  }
  function textarea() { return find((node) => node.type === "textarea"); }
  render();
  return {
    get value() { return textarea().props.value; },
    get reads() { return clipboardReads; },
    get focused() { return focused; },
    get toast() { return find((node) => node.props?.className === "toast")?.props.children; },
    get message() { return find((node) => node.props?.className === "message")?.props.children; },
    get result() { return find((node) => node.type === "a" && node.props?.className === "open-button")?.props.href; },
    change(value) { textarea().props.onChange({ target: { value } }); render(); },
    async paste() {
      await find((node) => node.props?.className === "copy-button paste-share-button").props.onClick();
      // The click handler intentionally discards the promise; settle clipboard continuation.
      await new Promise((resolve) => setImmediate(resolve));
      render();
    },
    submit() { find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); render(); },
  };
}

const cases = [
  { name: "抖音", domains: ["douyin.com"], apiPrefix: "https://douyin-api.easonzhan.xyz/?url=", source: "https://v.douyin.com/example/" },
  { name: "B站", domains: ["bilibili.com"], canonicalizeBilibili: true, apiPrefix: "https://bilibili-api.easonzhan.xyz/?url=", source: "https://www.bilibili.com/video/BV1aJMV6jEdg/" },
];

for (const config of cases) {
  test(`${config.name}：点击后读取分享文字，成功转换显示完成提示`, async () => {
    const text = `分享视频 ${config.source} 复制此链接观看`;
    const ui = harness(config, () => text);
    assert.equal(ui.reads, 0, "do not read clipboard on page load");
    await ui.paste();
    assert.equal(ui.reads, 1);
    assert.equal(ui.value, text);
    assert.equal(ui.focused, true);
    assert.equal(ui.result, undefined, "paste does not submit the form");
    ui.submit();
    assert.equal(ui.result, config.apiPrefix + config.source);
    assert.equal(ui.toast, "转换完成");
    ui.change("更换链接");
    assert.equal(ui.result, undefined);
    assert.equal(ui.toast, undefined);
  });
}

test("空输入或无效链接不显示转换完成", () => {
  const ui = harness(cases[0], () => "");
  for (const value of ["", "https://example.com/"]) {
    ui.change(value);
    ui.submit();
    assert.equal(ui.toast, undefined);
    assert.equal(ui.result, undefined);
    assert.ok(ui.message);
  }
});

test("剪贴板为空、拒绝访问或不受支持时保留原文并提供手动粘贴提示", async () => {
  for (const read of [() => "   ", () => { throw new Error("NotAllowedError"); }, undefined]) {
    const ui = harness(cases[0], read);
    ui.change("保留原内容");
    await ui.paste();
    assert.equal(ui.value, "保留原内容");
    assert.equal(ui.focused, true);
    assert.match(ui.message, /剪贴板|粘贴/);
    assert.equal(ui.toast, undefined);
  }
});
