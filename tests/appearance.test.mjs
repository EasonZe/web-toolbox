import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(await readFile(new URL("../app/components/floating-dock.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function renderDock({ savedTheme, savedAccent, savedCustomAccent, osDark = true, storageBlocked = false } = {}) {
  const effects = [], states = [], properties = {}, dataset = {}, storage = new Map([
    ["eason-toolbox-theme", savedTheme], ["eason-toolbox-accent", savedAccent],
    ["eason-toolbox-custom-accent", savedCustomAccent],
  ]);
  const exports = {}, jsx = (type, props) => ({ type, props });
  vm.runInNewContext(source, {
    exports,
    window: {
      localStorage: { getItem(key) { if (storageBlocked) throw new Error("denied"); return storage.get(key) ?? null; }, setItem(key, value) { if (storageBlocked) throw new Error("denied"); storage.set(key, value); } },
      matchMedia: () => ({ matches: osDark, addEventListener() {}, removeEventListener() {} }),
      scrollY: 0, addEventListener() {}, removeEventListener() {},
    },
    document: { documentElement: { dataset, style: { setProperty(key, value) { properties[key] = value; } } } },
    require(name) {
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
    },
  });
  exports.default(); effects.forEach((callback) => callback());
  return { states, dataset, properties, storage };
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
