import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const routes = [
  { path: "image-blur", title: "图片模糊", button: "生成模糊图片", markers: ["处理范围", "整张图片", "局部矩形", "均值半径（原图 px）", "模糊强度", "原图与结果", "不是高斯模糊", "不用于敏感信息安全脱敏"] },
  { path: "app-icons", title: "多尺寸应用图标", button: "生成图标", markers: ["目标平台", "Web / PWA", "Apple", "Android 传统图标", "应用名称", "每侧内边距（%）", "背景色（Apple 始终使用）", "无透明通道的 RGB PNG", "不是 adaptive 图标"] },
  { path: "pdf-watermark", title: "PDF 文字水印", button: "生成带水印 PDF", markers: ["水印文字", "页码范围（留空处理全部）", "单个水印", "网格水印", "交错平铺", "字号（pt）", "倾斜角度（°）", "水印颜色", "不透明度", "水平位置", "垂直位置", "原文件预览", "不会防止复制、编辑或移除"] },
];

for (const { path, title, button, markers } of routes) test(`生产 SSR /${path} 保留标题、初始控件及未导入时的禁用操作`, async () => {
  const worker = await loadBuiltWorker();
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(`<title>${title} | 多功能工具箱</title>`));
  assert.match(html, /class="[^"]*tool-shell/);
  assert.match(html, /name="viewport"/);
  for (const marker of markers) assert.ok(html.includes(marker), `${path}: ${marker}`);
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const generate = buttons.find(([, , text]) => text === button);
  assert.ok(generate, `${path}: ${button}`);
  assert.match(generate[1], /\bdisabled(?:="")?(?:\s|$)/);
  assert.doesNotMatch(html, /[A-Za-z]:(?:\/|\\{1,2})Users(?:\/|\\{1,2})|INTERNAL_SERVER_ERROR/);
});

test("新页面各有生产客户端分包，依赖分包与 CSS 不泄漏本地用户绝对路径", async () => {
  const manifest = JSON.parse(await read("dist/client/.vite/manifest.json"));
  const entries = routes.map(({ path }) => `app/components/${path}.tsx`);
  const files = new Set();
  const visited = new Set();
  function collect(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    assert.ok(entry, `Missing manifest entry: ${key}`);
    assert.ok(entry.file?.startsWith("_next/static/"), key);
    files.add(entry.file);
    for (const css of entry.css ?? []) files.add(css);
    for (const dependency of [...entry.imports ?? [], ...entry.dynamicImports ?? []]) collect(dependency);
  }
  for (const key of entries) collect(key);
  assert.equal(new Set(entries.map((key) => manifest[key].file)).size, 3, "三个独立工具不能遗漏客户端入口");
  for (const file of files) {
    assert.doesNotMatch(file, /^(?:\/|[A-Za-z]:)|(?:^|\/)\.\.(?:\/|$)/);
    const code = await read(`dist/client/${file}`);
    assert.doesNotMatch(code, /[A-Za-z]:(?:\/|\\{1,2})Users(?:\/|\\{1,2})|file:\/\/\/[A-Za-z]:/i, file);
  }
});

// Deliberately limited to exact selectors and width media conditions. This
// checks declared layout contracts, not computed widths or browser rendering.
function widthMatches(rule, width) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type !== "atrule" || parent.name !== "media") continue;
    for (const [, direction, bound] of parent.params.matchAll(/(max|min)-width:\s*(\d+)px/g)) {
      if (direction === "max" ? width > Number(bound) : width < Number(bound)) return false;
    }
  }
  return true;
}
function declared(sheets, selectors, property, width) {
  let result;
  let specificity = -1;
  for (const sheet of sheets) sheet.walkRules((rule) => {
    if (!widthMatches(rule, width)) return;
    for (const selector of rule.selectors) {
      if (!selectors.includes(selector)) continue;
      const weight = (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
      rule.walkDecls(property, (decl) => {
        if (weight >= specificity) { specificity = weight; result = decl.value; }
      });
    }
  });
  return result;
}

test("1440 / 390px CSS 声明保留桌面分栏、手机单列、完整标签与主题变量（非浏览器排版验收）", async () => {
  const extra = postcss.parse(await read("app/styles/additional-utilities.css"));
  const base = postcss.parse(await read("app/globals.css"));
  const mobile = postcss.parse(await read("app/styles/mobile-tools.css"));
  const layout = await read("app/layout.tsx");
  assert.ok(layout.indexOf('import "./styles/mobile-tools.css"') > layout.indexOf('import "./globals.css"'));
  const sheets = [extra, base, mobile];
  for (const width of [1440, 390]) {
    const value = (selectors, property) => declared(sheets, Array.isArray(selectors) ? selectors : [selectors], property, width);
    assert.equal(value([".utility-columns", ".tool-shell .utility-columns"], "grid-template-columns"), width === 390 ? "minmax(0, 1fr)" : "minmax(0, 1.3fr) minmax(300px, 1fr)");
    for (const selector of [".image-blur-region-fields", ".watermark-number-fields"]) {
      assert.equal(value(selector, "grid-template-columns"), width === 390 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))");
      assert.equal(value(`${selector} label`, "min-width"), "0");
    }
    assert.equal(value(".image-blur-fields", "grid-template-columns"), "minmax(0, 1fr)");
    assert.equal(value(".app-icon-results", "grid-template-columns"), width === 390 ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(min(140px, 100%), 1fr))");
    assert.equal(value(".utility-controls label", "flex-direction"), "column");
    assert.equal(value(".contrast-color-input", "grid-template-columns"), "minmax(0, 1fr) 54px");
    assert.equal(value(".contrast-color-input label", "min-width"), "0");
    assert.equal(value('.additional-utilities .utility-controls .contrast-color-input > input[type="color"]', "min-width"), "54px");
    assert.equal(value(".app-icon-result > a", "white-space"), "normal");
    assert.equal(value(".app-icon-result > a", "min-height"), "44px");
    assert.equal(value(".utility-controls input[type=\"range\"]", "accent-color"), "var(--ui-accent)");
    assert.equal(value(".utility-range-control output", "color"), "var(--ui-accent)");
    assert.equal(value(".app-icon-preview", "border"), "1px solid var(--line)");
    assert.match(value(".image-blur-selection-box", "background"), /var\(--ui-accent\)/);
  }
  assert.equal(declared(sheets, [".tool-shell .utility-controls label"], "min-width", 390), "0");
  assert.equal(declared(sheets, [".tool-shell .utility-actions > :is(button, a)"], "min-height", 390), "44px");
  assert.equal(declared(sheets, [".tool-shell .utility-actions > :is(button, a)"], "white-space", 390), "normal");
});
