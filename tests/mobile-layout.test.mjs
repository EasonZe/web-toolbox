import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { mobileLayoutInventory } from "../scripts/mobile-layout-inventory.mjs";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const extra = postcss.parse(await read("app/styles/additional-utilities.css"));
const base = postcss.parse(await read("app/globals.css"));
const mobile = postcss.parse(await read("app/styles/mobile-tools.css"));
function declaration(sheet, selector, property) {
  let found;
  sheet.walkRules((rule) => { if (rule.selectors.includes(selector)) rule.walkDecls(property, (decl) => { found = decl.value; }); });
  return found;
}
// Only used for these simple class/type/attribute selectors; not a general CSS engine.
function weight(selector) {
  assert.doesNotMatch(selector, /:is\(|:where\(|#/);
  return (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
}
test("颜色控件固定取色器的优先级高于后加载的通用100%输入框，不能挤窄标签", () => {
  const generic = '.utility-controls input:not([type="checkbox"]):not([type="range"])';
  const picker = '.additional-utilities .utility-controls .contrast-color-input > input[type="color"]';
  assert.equal(declaration(base, generic, "width"), "100%");
  assert.equal(declaration(extra, picker, "width"), "54px");
  assert.equal(declaration(extra, picker, "min-width"), "54px");
  assert.ok(weight(picker) > weight(generic));
  assert.equal(declaration(extra, ".contrast-color-input", "grid-template-columns"), "minmax(0, 1fr) 54px");
  assert.equal(declaration(extra, ".contrast-color-input label", "min-width"), "0");
});
test("色标与参数字段分组不再被通用fieldset重置覆盖", () => {
  assert.equal(declaration(extra, ".utility-controls .design-stop-editor", "padding"), "14px");
  assert.equal(declaration(extra, ".utility-controls .url-parameter-list fieldset", "border"), "1px solid var(--line)");
  assert.equal(declaration(base, ".utility-controls fieldset", "padding"), "0");
});
test("手机规则只作用于工具页和窄视口，不隐藏整页溢出或更改电脑卡片交互", async () => {
  const layout = await read("app/layout.tsx");
  assert.ok(layout.indexOf('import "./styles/mobile-tools.css"') > layout.indexOf('import "./globals.css"'));
  mobile.walkRules((rule) => {
    assert.doesNotMatch(rule.selector, /home-shell|tool-card|tool-grid|author-card/);
    if (rule.selector === ".science-matrix-scroll") return;
    assert.equal(rule.parent.type, "atrule");
    assert.match(rule.parent.params, /^\(max-width: (680|480)px\)$/);
    for (const selector of rule.selectors) assert.ok(selector.startsWith(".tool-shell"), selector);
  });
  mobile.walkDecls("overflow-x", (decl) => assert.equal(decl.value, "auto"));
  assert.equal(declaration(mobile, ".tool-shell .utility-heading", "flex-wrap"), "wrap");
  assert.equal(declaration(mobile, ".tool-shell .utility-inline", "flex-wrap"), "wrap");
  assert.equal(declaration(mobile, ".tool-shell .workbench-fields", "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(declaration(mobile, ".tool-shell .workbench-table th", "white-space"), "nowrap");
  assert.equal(declaration(mobile, ".tool-shell .workbench-table td", "min-width"), "7rem");
});
test("大矩阵保留44px输入单元并有独立可聚焦的横向滚动区域", async () => {
  const component = await read("app/components/scientific-tool.tsx");
  assert.match(component, /className="science-matrix-scroll" role="region" aria-label=\{`矩阵/);
  assert.match(component, /tabIndex=\{0\}><div className="science-matrix-cells"/);
  assert.match(component, /minmax\(44px, 1fr\)/);
  assert.equal(declaration(mobile, ".science-matrix-scroll", "overflow-x"), "auto");
});
test("手机源码清单覆盖目录内全部121个工具及其本地UI组件，不以首页抽样代替全站", async () => {
  const result = await mobileLayoutInventory();
  assert.equal(result.tools.length, 121);
  assert.equal(new Set(result.tools.map((tool) => tool.path)).size, 121);
  assert.equal(Object.keys(result.counts).length, 8);
  assert.ok(result.sourceFiles >= 121);
  for (const path of ["/gradient-generator", "/shadow-generator", "/color-contrast", "/matrix-calculator", "/image-ocr", "/video-converter", "/font-preview", "/unity-package", "/image-rounded", "/image-canvas", "/image-duotone", "/image-sharpen"]) assert.ok(result.tools.some((tool) => tool.path === path), path);
  assert.match(result.note, /does not measure rendered widths/);
});
