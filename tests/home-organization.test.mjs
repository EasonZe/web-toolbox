import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

async function read(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("每个首页工具都有分类并提供四种视图", async () => {
  const [source, dock] = await Promise.all([
    read("../app/components/tool-search-grid.tsx"),
    read("../app/components/floating-dock.tsx"),
  ]);
  const toolRows = source.match(/\{ name: [^\n]+\}/g) ?? [];
  assert.ok(toolRows.length >= 50);
  for (const row of toolRows) assert.match(row, /category: "/, row);
  for (const category of ["视频工具", "音频工具", "图片与设计", "文字与文档", "编码与开发", "计算与换算", "时间与生活", "设备与网络", "其他服务"]) assert.ok(source.includes(category), category);
  for (const view of ["groups", "table", "minimal", "cards"]) assert.ok(dock.includes(`value: "${view}"`), view);
});

test("首页偏好能校验视图并安全解析收藏夹", async () => {
  const exports = {};
  const source = await read("../app/lib/home-preferences.ts");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`)(exports, createRequire(import.meta.url));
  assert.equal(exports.isToolViewMode("cards"), true);
  assert.equal(exports.isToolViewMode("unknown"), false);
  assert.deepEqual([...exports.parseFavoriteHrefs('["/color",7,"/calculator"]')], ["/color", "/calculator"]);
  assert.deepEqual([...exports.parseFavoriteHrefs("broken")], []);
});

test("收藏入口、列表设置、个人卡片和默认参考网格均已接入", async () => {
  const [dock, home, model] = await Promise.all([
    read("../app/components/floating-dock.tsx"),
    read("../app/page.tsx"),
    read("../app/components/model-turntable.tsx"),
  ]);
  for (const text of ["打开收藏夹", "折叠分组", "紧凑表格", "极简分割线", "卡片网格", "toolViewStorageKey"]) assert.ok(dock.includes(text), text);
  for (const text of ["Eason", "https://github.com/EasonZe", "https://qm.qq.com/q/7dNxa3Hgt2", "https://easonzhan.xyz/", "/images/eason-avatar.png"]) assert.ok(home.includes(text), text);
  assert.ok(!home.includes("一个零手工纯AI开发小白"));
  assert.match(model, /useState\(true\).*?showGrid|\[showGrid, setShowGrid\] = useState\(true\)/s);
  assert.match(model, /grid\.visible = true/);
});

test("首页分类标签、滚动渐入和收藏夹切换均已接入", async () => {
  const [source, styles] = await Promise.all([
    read("../app/components/tool-search-grid.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(source, /tool-category-tabs-desktop" aria-label="工具分类"/);
  assert.match(source, /activeCategory === "全部"/);
  assert.match(source, /aria-controls="more-tool-categories"/);
  assert.match(source, />\{mobileCategoriesOpen \? "收起" : "更多"\}<\/button>/);
  assert.doesNotMatch(source, /常用工具集中在这里/);
  assert.match(source, /matchMedia\("\(max-width: 680px\)"\)\.matches \? "table" : "cards"/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /threshold: \[0, 0\.5\]/);
  assert.match(source, /tool-card-shell is-reveal-pending/);
  assert.match(source, /setFavoritesOnly\(\(current\) =>/);
  assert.match(styles, /\.tool-card-shell\.is-reveal-pending\.is-revealed/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("设置中的列表选项保持简洁并支持自定义主题颜色", async () => {
  const [dock, styles] = await Promise.all([
    read("../app/components/floating-dock.tsx"),
    read("../app/globals.css"),
  ]);
  assert.doesNotMatch(dock, /description: "按分类展开或收起"/);
  assert.match(dock, /localStorage\.setItem\(toolViewStorageKey, value\)/);
  assert.match(dock, /setToolView\(value\);\s*setSettingsOpen\(false\);/);
  assert.doesNotMatch(dock, /selectToolView[\s\S]*?window\.location\.assign\("\/"\);/);
  assert.match(dock, /type="color"/);
  assert.match(dock, /<strong>自定义<\/strong>/);
  assert.match(dock, /eason-toolbox-custom-accent/);
  assert.match(styles, /\.theme-mode-grid \{\s*grid-template-columns: repeat\(3/);
  assert.match(styles, /\.is-table \.tool-table-chevron/);
});
