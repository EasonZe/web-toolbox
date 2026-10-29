import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source = ts.transpileModule(await readFile(new URL("../app/components/floating-dock.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const appearanceSource = ts.transpileModule(await readFile(new URL("../app/lib/appearance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function renderDock({ savedTheme, savedAccent, savedCustomAccent, osDark = true, storageBlocked = false, initialDataset = {}, mediaApi = "modern" } = {}) {
  const effects = [], cleanups = [], states = [], properties = {}, dataset = { ...initialDataset }, queries = [], storage = new Map([
    ["eason-toolbox-theme", savedTheme], ["eason-toolbox-accent", savedAccent],
    ["eason-toolbox-custom-accent", savedCustomAccent],
  ]);
  const mediaListeners = new Set(), removedMediaListeners = [], mediaQuery = { matches: osDark };
  if (mediaApi === "modern") {
    mediaQuery.addEventListener = (event, callback) => { assert.equal(event, "change"); mediaListeners.add(callback); };
    mediaQuery.removeEventListener = (event, callback) => { assert.equal(event, "change"); removedMediaListeners.push(callback); mediaListeners.delete(callback); };
  } else if (mediaApi === "legacy") {
    mediaQuery.addListener = (callback) => mediaListeners.add(callback);
    mediaQuery.removeListener = (callback) => { removedMediaListeners.push(callback); mediaListeners.delete(callback); };
  }
  const exports = {}, appearanceExports = {}, jsx = (type, props) => ({ type, props });
  const scope = {
    window: {
      localStorage: { getItem(key) { if (storageBlocked) throw new Error("denied"); return storage.get(key) ?? null; }, setItem(key, value) { if (storageBlocked) throw new Error("denied"); storage.set(key, value); } },
      matchMedia(query) { queries.push(query); return query === "(prefers-color-scheme: dark)" ? mediaQuery : { matches: false }; },
      scrollY: 0, addEventListener() {}, removeEventListener() {},
    },
    document: { documentElement: { dataset, style: { setProperty(key, value) { properties[key] = value; } } } },
  };
  const requireMock = (name) => {
      if (name === "../lib/appearance") return appearanceExports;
      if (name === "react") return { useState(initial) { const value = typeof initial === "function" ? initial() : initial; states.push(value); return [value, () => {}]; }, useRef: (current) => ({ current }), useEffect(callback) { effects.push(callback); }, useCallback: (callback) => callback };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { usePathname: () => "/" };
      if (name === "react-icons/fi") return {};
      if (name === "../lib/home-preferences") return {
        isToolViewMode: (value) => ["groups", "table", "minimal", "cards"].includes(value),
        openFavoritesEvent: "eason-toolbox-open-favorites",
        replayToolAnimationEvent: "eason-toolbox-replay-animation",
        toolViewChangeEvent: "eason-toolbox-tool-view-change",
        toolViewStorageKey: "eason-toolbox-tool-view",
      };
      throw new Error(name);
  };
  // Both CommonJS modules execute in one browser scope; the appearance module's
  // storage readers must observe exactly the same window/document as the dock.
  const context = vm.createContext(scope);
  const load = (code, target) => vm.runInContext(`(function(exports, require) { ${code}\n })`, context)(target, requireMock);
  load(appearanceSource, appearanceExports);
  load(source, exports);
  exports.default();
  effects.forEach((callback) => { const cleanup = callback(); if (typeof cleanup === "function") cleanups.push(cleanup); });
  return {
    states, dataset, properties, storage, queries, mediaListeners, removedMediaListeners,
    get colorScheme() { return scope.document.documentElement.style.colorScheme; },
    changeSystemTheme(dark) { mediaQuery.matches = dark; for (const listener of mediaListeners) listener(); },
    cleanup() { cleanups.forEach((callback) => callback()); },
  };
}
test("无主题偏好时默认浅色，即使系统为深色", () => {
  for (const savedTheme of [undefined, "invalid"]) {
    const ui = renderDock({ savedTheme });
    assert.equal(ui.dataset.theme, "light"); assert.equal(ui.dataset.themePreference, "light");
    assert.equal(ui.storage.get("eason-toolbox-theme"), "light");
  }
});
test("保留用户已经选择的主题，并兼容禁用存储的浏览器", () => {
  for (const [savedTheme, expected] of [["light", "light"], ["dark", "dark"], ["system", "dark"]]) {
    const ui = renderDock({ savedTheme }); assert.equal(ui.dataset.theme, expected); assert.equal(ui.dataset.themePreference, savedTheme);
  }
  assert.equal(renderDock({ storageBlocked: true }).dataset.theme, "light");
});
test("第二个主题颜色为DAD7ED，保存的紫色偏好使用更新后的色值", () => {
  const ui = renderDock({ savedAccent: "purple" });
  assert.equal(ui.properties["--accent"], "#DAD7ED");
  assert.equal(ui.properties["--accent-hover"], "#c9c4e3");
  assert.equal(ui.storage.get("eason-toolbox-accent"), "purple");
});
test("自定义主题颜色生成清晰的浅色、悬浮色和强调色", () => {
  const ui = renderDock({ savedAccent: "custom", savedCustomAccent: "#00a86b" });
  assert.equal(ui.properties["--accent"], "#9edec7");
  assert.equal(ui.properties["--accent-hover"], "#6bcda9");
  assert.equal(ui.properties["--accent-strong"], "#00a86b");
  assert.equal(ui.storage.get("eason-toolbox-accent"), "custom");
});

test("挂载时继承首屏主题和自定义强调色，存储不可用也不回退成浅色", () => {
  const ui = renderDock({
    storageBlocked: true,
    initialDataset: { theme: "dark", themePreference: "dark", accentPreference: "custom", customAccent: "#00a86b" },
  });
  assert.equal(ui.states[0], "dark");
  assert.equal(ui.states[1], "custom");
  assert.equal(ui.states[2], "#00a86b");
  assert.equal(ui.dataset.theme, "dark");
  assert.equal(ui.colorScheme, "dark");
  assert.equal(ui.properties["--accent-strong"], "#00a86b");
  assert.ok(!ui.queries.includes("(prefers-color-scheme: dark)"));
});

test("系统主题持续响应变化，并清理现代和旧版媒体查询监听", () => {
  for (const mediaApi of ["modern", "legacy"]) {
    const ui = renderDock({ savedTheme: "system", mediaApi });
    assert.equal(ui.dataset.theme, "dark");
    assert.equal(ui.colorScheme, "dark");
    assert.equal(ui.mediaListeners.size, 1);
    ui.changeSystemTheme(false);
    assert.equal(ui.dataset.theme, "light");
    assert.equal(ui.dataset.themePreference, "system");
    assert.equal(ui.colorScheme, "light");
    ui.changeSystemTheme(true);
    assert.equal(ui.dataset.theme, "dark");
    ui.cleanup();
    assert.equal(ui.mediaListeners.size, 0);
    assert.equal(ui.removedMediaListeners.length, 1);
    ui.changeSystemTheme(false);
    assert.equal(ui.dataset.theme, "dark");
  }
});

test("媒体查询没有监听 API 时仍能应用系统主题", () => {
  const ui = renderDock({ savedTheme: "system", osDark: false, mediaApi: "none" });
  assert.equal(ui.dataset.theme, "light");
  assert.equal(ui.dataset.themePreference, "system");
  assert.equal(ui.mediaListeners.size, 0);
  assert.doesNotThrow(() => ui.cleanup());
});
