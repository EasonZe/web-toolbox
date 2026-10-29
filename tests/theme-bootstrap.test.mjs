import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";

const { createAppearance } = loadLocalModule("app/lib/appearance.ts");
const { themeBootstrap } = loadLocalModule("app/lib/theme-bootstrap.ts");
const keys = { theme: "eason-toolbox-theme", accent: "eason-toolbox-accent", custom: "eason-toolbox-custom-accent" };
const factoryScript = `(${createAppearance.toString()})()`;
// Bound accidental loops, not execution speed: loaded CI hosts can pause a VM.
const vmTimeout = 5000;
const presets = [
  ["blue", "#cfe2f1", "#bad7e9", "#4f7890"],
  ["purple", "#DAD7ED", "#c9c4e3", "#756c9c"],
  ["cyan", "#bde8e8", "#9edcdd", "#397f82"],
  ["green", "#cfe9c4", "#b9dda9", "#527f42"],
  ["orange", "#f8d6ad", "#f2c487", "#9a672b"],
  ["pink", "#f4c7df", "#efadcf", "#9a4e78"],
  ["red", "#f2c4c8", "#eba7ad", "#9b4f57"],
];

// This intentionally models only the bootstrap's platform boundary, not a DOM
// or a visual browser. No React, application imports or external helpers exist
// in the VM; executing the production string catches serialization captures.
function platform({ saved = {}, dark = false, media = "available", blockedStorage = false, badKey, storageGetterThrows = false } = {}) {
  const values = new Map(Object.entries(saved)), reads = [], writes = [], mediaQueries = [];
  const css = new Map();
  const root = { dataset: {}, style: { setProperty(name, value) { css.set(name, value); } } };
  const store = {
    getItem(key) { reads.push(key); if (blockedStorage || key === badKey) throw new Error("Storage unavailable"); return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); if (blockedStorage) throw new Error("Storage unavailable"); values.set(key, value); },
  };
  const window = {};
  Object.defineProperty(window, "localStorage", { configurable: true, get() { if (storageGetterThrows) throw new Error("Storage getter unavailable"); return store; } });
  if (media !== "missing") window.matchMedia = (query) => { mediaQueries.push(query); if (media === "throw") throw new Error("matchMedia unavailable"); return { matches: dark }; };
  const context = vm.createContext({ document: { documentElement: root }, window });
  const run = (script) => vm.runInContext(script, context, { timeout: vmTimeout });
  return { context, root, css, reads, writes, mediaQueries, window, run, factory: () => run(factoryScript) };
}
function execute(script, options) { const app = platform(options); app.run(script); return app; }
function snapshot(app) {
  return { dataset: { ...app.root.dataset }, scheme: app.root.style.colorScheme, css: Object.fromEntries(app.css) };
}
function assertVisible(app) {
  assert.equal(app.root.style.display, undefined);
  assert.equal(app.root.style.visibility, undefined);
  assert.equal(app.root.style.opacity, undefined);
}

test("主题源码：React 未执行前恢复保存的深色及 color-scheme，不写存储或隐藏页面", () => {
  const app = execute(themeBootstrap, { saved: { [keys.theme]: "dark" } });
  assert.equal(app.root.dataset.theme, "dark");
  assert.equal(app.root.dataset.themePreference, "dark");
  assert.equal(app.root.style.colorScheme, "dark");
  assert.equal(app.root.dataset.accentPreference, "blue");
  assert.deepEqual(app.writes, []);
  assertVisible(app);
});

test("主题源码：系统跟随两种 OS 状态；没有偏好仍浅色，缺少或异常 matchMedia 安全回退", () => {
  for (const dark of [true, false]) {
    const app = execute(themeBootstrap, { saved: { [keys.theme]: "system" }, dark });
    assert.equal(app.root.dataset.themePreference, "system");
    assert.equal(app.root.dataset.theme, dark ? "dark" : "light");
    assert.equal(app.root.style.colorScheme, dark ? "dark" : "light");
    assert.deepEqual(app.mediaQueries, ["(prefers-color-scheme: dark)"]);
  }
  assert.equal(execute(themeBootstrap, { dark: true }).root.dataset.theme, "light", "默认偏好不应擅自改为跟随系统");
  for (const media of ["missing", "throw"]) {
    const system = execute(themeBootstrap, { saved: { [keys.theme]: "system" }, media });
    assert.equal(system.root.dataset.theme, "light"); assert.equal(system.root.dataset.themePreference, "system");
    assert.equal(execute(themeBootstrap, { saved: { [keys.theme]: "dark" }, media }).root.dataset.theme, "dark");
  }
});

test("主题源码：localStorage getter 或读取失败不报错，单个键失败不丢其它有效设置", () => {
  for (const options of [{ storageGetterThrows: true }, { blockedStorage: true }]) {
    const app = execute(themeBootstrap, options);
    assert.equal(app.root.dataset.theme, "light"); assert.equal(app.root.dataset.accentPreference, "blue"); assert.deepEqual(app.writes, []);
  }
  const saved = { [keys.theme]: "dark", [keys.accent]: "custom", [keys.custom]: "#123456" };
  const themeBad = execute(themeBootstrap, { saved, badKey: keys.theme });
  assert.equal(themeBad.root.dataset.theme, "light"); assert.equal(themeBad.root.dataset.accentPreference, "custom"); assert.equal(themeBad.css.get("--accent-strong"), "#123456");
  const accentBad = execute(themeBootstrap, { saved, badKey: keys.accent });
  assert.equal(accentBad.root.dataset.theme, "dark"); assert.equal(accentBad.root.dataset.accentPreference, "blue");
  const customBad = execute(themeBootstrap, { saved, badKey: keys.custom });
  assert.equal(customBad.root.dataset.theme, "dark"); assert.equal(customBad.root.dataset.accentPreference, "custom"); assert.equal(customBad.root.dataset.customAccent, "#756c9c");
});

test("主题源码：七种预设与自定义色均与交互 apply 共用同一调色规则", () => {
  for (const [accent, color, hover, strong] of presets) {
    const app = execute(themeBootstrap, { saved: { [keys.theme]: "dark", [keys.accent]: accent } });
    assert.deepEqual(Object.fromEntries(app.css), { "--accent": color, "--accent-hover": hover, "--accent-strong": strong });
    const interaction = platform();
    interaction.factory().applyTheme(interaction.root, "dark");
    interaction.factory().applyAccent(interaction.root, accent, "#756c9c");
    assert.deepEqual(snapshot(app), snapshot(interaction)); assert.deepEqual(app.writes, []);
  }
  for (const custom of ["#123456", "#ABCDEF", "#ffffff", "#000000"]) {
    const app = execute(themeBootstrap, { saved: { [keys.theme]: "dark", [keys.accent]: "custom", [keys.custom]: custom } });
    const interaction = platform();
    const appearance = interaction.factory(); appearance.applyTheme(interaction.root, "dark"); appearance.applyAccent(interaction.root, "custom", custom);
    assert.deepEqual(snapshot(app), snapshot(interaction)); assert.equal(app.root.dataset.customAccent, custom.toLowerCase());
  }
  const darkCustom = execute(themeBootstrap, { saved: { [keys.accent]: "custom", [keys.custom]: "#123456" } });
  assert.deepEqual(Object.fromEntries(darkCustom.css), { "--accent": "#a5b2bf", "--accent-hover": "#76899d", "--accent-strong": "#123456" });
  assert.equal(execute(themeBootstrap, { saved: { [keys.accent]: "custom", [keys.custom]: "#ffffff" } }).css.get("--accent-strong"), "#90969a");
});

test("主题源码：非法枚举和颜色仅回退白名单，不把恶意存储值写入 DOM 或 CSS", () => {
  const invalid = ['</script><script>alert(1)</script>', 'dark" onload="alert(1)', "dark;display:none", "url(https://example.invalid/x)", "#abc", "#12345g", "__proto__", "constructor", "", "DARK"];
  for (const value of invalid) {
    const app = execute(themeBootstrap, { saved: { [keys.theme]: value, [keys.accent]: value, [keys.custom]: value } });
    assert.equal(app.root.dataset.theme, "light"); assert.equal(app.root.dataset.themePreference, "light");
    assert.equal(app.root.dataset.accentPreference, "blue"); assert.equal(app.root.dataset.customAccent, "#756c9c");
    assert.deepEqual(Object.keys(app.root.dataset).sort(), ["accentPreference", "customAccent", "theme", "themePreference"]);
    assert.deepEqual([...app.css.keys()].sort(), ["--accent", "--accent-hover", "--accent-strong"]);
    assert.ok([...app.css.values()].every((color) => /^#[\da-f]{6}$/i.test(color))); assertVisible(app);
  }
});

test("主题源码：启动后的交互初值优先读取 root，存储随后不可用也不退回浅色或默认色", () => {
  for (const theme of ["dark", "system"]) {
    const app = execute(themeBootstrap, { saved: { [keys.theme]: theme, [keys.accent]: "custom", [keys.custom]: "#123456" }, dark: true });
    Object.defineProperty(app.window, "localStorage", { configurable: true, get() { throw new Error("Storage became unavailable"); } });
    const state = app.factory();
    assert.equal(state.initialTheme(), theme); assert.equal(state.initialAccent(), "custom"); assert.equal(state.initialCustomAccent(), "#123456");
    state.applyTheme(app.root, state.initialTheme()); state.applyAccent(app.root, state.initialAccent(), state.initialCustomAccent());
    assert.equal(app.root.dataset.theme, "dark"); assert.equal(app.css.get("--accent-strong"), "#123456");
  }
});

test("主题源码：无 window/document 的 SSR 环境可安全加载、初始化并读取默认值", () => {
  const context = vm.createContext({});
  assert.doesNotThrow(() => vm.runInContext(themeBootstrap, context, { timeout: vmTimeout }));
  const appearance = vm.runInContext(factoryScript, context, { timeout: vmTimeout });
  assert.equal(appearance.initialTheme(), "light"); assert.equal(appearance.initialAccent(), "blue"); assert.equal(appearance.initialCustomAccent(), "#756c9c"); assert.equal(appearance.systemMediaQuery(), null);
});

test("主题源码：布局在 head 注册 beforeInteractive，容忍根属性同步但不隐藏页面", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<html\b[^>]*\bsuppressHydrationWarning\b/);
  assert.equal([...layout.matchAll(/id="appearance-init"/g)].length, 1);
  const beforeBody = layout.slice(layout.indexOf("<head>"), layout.indexOf("<body>"));
  assert.match(beforeBody, /<Script\b[^>]*id="appearance-init"[^>]*strategy="beforeInteractive"[^>]*dangerouslySetInnerHTML=\{\{ __html: themeBootstrap \}\}/);
  assert.doesNotMatch(layout, /<(?:html|body)\b[^>]*\bhidden(?:\s|=|>)/);
  const styles = postcss.parse(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  styles.walkRules((rule) => {
    if (!rule.selectors.some((selector) => ["html", "body", ":root"].includes(selector.trim()))) return;
    rule.walkDecls((decl) => { assert.ok(!(decl.prop === "display" && decl.value === "none" || decl.prop === "visibility" && decl.value === "hidden" || decl.prop === "opacity" && Number(decl.value) === 0), `${rule.selector}: ${decl.toString()}`); });
  });
});

async function render(path) {
  const worker = await loadBuiltWorker();
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); return response.text();
}
function productionBootstrap(html, path) {
  const headStart = html.indexOf("<head>"), headEnd = html.indexOf("</head>"), bodyStart = html.search(/<body(?:\s|>)/);
  assert.ok(headStart >= 0 && headEnd > headStart && bodyStart > headEnd, `${path}: 正常 head/body 顺序`);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attributes]) => /\bid=["']appearance-init["']/.test(attributes));
  assert.equal(scripts.length, 1, `${path}: 只输出一次首帧脚本`);
  const script = scripts[0]; assert.ok(script.index > headStart && script.index < headEnd, `${path}: 首帧脚本必须在 head 中`);
  assert.doesNotMatch(html.slice(headStart, script.index), /<link\b[^>]*\brel=["']stylesheet["']/i, `${path}: 首帧主题不能等待先前样式文件`);
  assert.doesNotMatch(script[1], /\b(?:async|defer|src)(?:\s|=|$)|\btype=["']module["']/i);
  assert.ok(script[2].trim().length > 0); assert.doesNotMatch(script[2], /<\/script|__webpack_require__|require\s*\(|\bimport\s*\(/i);
  assert.doesNotMatch(html.match(/<(?:html|body)\b[^>]*>/gi)?.join(" ") ?? "", /\bhidden(?:\s|=|>)|(?:visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0)/i);
  return script[2];
}

for (const path of ["/", "/app-icons"]) test(`生产 SSR ${path}：实际首帧内联脚本在 body 前执行且无需 React/外部 helper`, async () => {
  const html = await render(path), script = productionBootstrap(html, path);
  for (const options of [
    { saved: { [keys.theme]: "dark" } },
    { saved: { [keys.theme]: "system" }, dark: true },
    { saved: { [keys.theme]: "system" }, dark: false },
    { saved: { [keys.theme]: "dark", [keys.accent]: "custom", [keys.custom]: "#123456" } },
    { saved: { [keys.theme]: "system" }, media: "missing" },
    { saved: { [keys.theme]: "dark" }, storageGetterThrows: true },
    { saved: { [keys.theme]: '</script><script>alert(1)</script>', [keys.accent]: "custom", [keys.custom]: "red;display:none" } },
  ]) {
    const actual = execute(script, options), source = execute(themeBootstrap, options);
    assert.deepEqual(snapshot(actual), snapshot(source), `${path}: 生产压缩代码必须与源码配置相同`);
    assert.deepEqual(actual.writes, []); assertVisible(actual);
  }
});
