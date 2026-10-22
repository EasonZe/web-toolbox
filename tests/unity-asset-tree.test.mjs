import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const treeLib = loadLocalModule("app/lib/unity-asset-tree.ts");
const make = (guid, path, kind = "文本") => ({ guid, path, kind, size: 12 });
const fixtures = [
  make("img", "Assets/Avatar/Textures/face.png", "图片"),
  make("folder", "Assets/Avatar", "文件夹"),
  make("model", "Assets/Avatar/Models/body.fbx", "模型"),
  make("meta", "Assets/Avatar/readme.txt"),
  make("other", "Assets/Other/data.json"),
];
const eligible = new Set(fixtures.map((asset) => asset.guid));
test("Unity 目录树补全缺失父目录并按文件夹优先排序，不重复显式目录", () => {
  const tree = treeLib.buildUnityAssetTree(fixtures);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].name, "Assets");
  assert.deepEqual(tree.roots[0].children.map((node) => node.name), ["Avatar", "Other"]);
  const avatar = tree.nodes.get("assets/avatar");
  assert.equal(avatar.asset.guid, "folder");
  assert.deepEqual(avatar.children.map((node) => node.name), ["Models", "Textures", "readme.txt"]);
  assert.equal(tree.assetNodes.get("img").parent, "assets/avatar/textures");
  assert.equal(treeLib.isUnityFolder(tree.roots[0]), true);
});
test("目录树展开收起只改变可见行，不丢失资源或选择状态", () => {
  const tree = treeLib.buildUnityAssetTree(fixtures), selected = new Set(["img"]);
  const counts = treeLib.unityTreeCounts(tree, eligible, selected);
  const expanded = treeLib.unityTreeDefaultExpanded(tree, "img");
  assert.equal(counts.get("assets/avatar").total, 4);
  assert.equal(counts.get("assets/avatar").selected, 1);
  const visible = treeLib.unityTreeRows(tree, counts, expanded);
  assert.ok(visible.some((row) => row.node.asset?.guid === "img"));
  expanded.delete("assets/avatar");
  const collapsed = treeLib.unityTreeRows(tree, counts, expanded);
  assert.ok(collapsed.some((row) => row.node.id === "assets/avatar"));
  assert.ok(!collapsed.some((row) => row.node.asset?.guid === "img"));
  expanded.add("assets/avatar");
  assert.equal(treeLib.unityTreeRows(tree, counts, expanded).length, visible.length);
  assert.equal(selected.size, 1);
});
test("筛选保留全部父级路径，只勾选符合筛选条件的资源", () => {
  const tree = treeLib.buildUnityAssetTree(fixtures), images = new Set(["img"]);
  const counts = treeLib.unityTreeCounts(tree, images, new Set(["model", "img"]));
  const rows = treeLib.unityTreeRows(tree, counts, new Set(), true);
  assert.deepEqual(rows.map((row) => row.node.path), ["Assets", "Assets/Avatar", "Assets/Avatar/Textures", "Assets/Avatar/Textures/face.png"]);
  assert.deepEqual(rows.map((row) => row.depth), [0, 1, 2, 3]);
  assert.deepEqual(treeLib.unityTreeAssetIds(tree.nodes.get("assets/avatar"), images), ["img"]);
  assert.equal(counts.get("assets/avatar").selected, 1);
  assert.equal(counts.get("assets/avatar").total, 1);
  const collapsed = treeLib.unityTreeRows(tree, counts, new Set(), true, new Set(["assets/avatar"]));
  assert.deepEqual(collapsed.map((row) => row.node.name), ["Assets", "Avatar"]);
});
test("勾选目录包含目录 .meta 对应项和后代，不跨入同名前缀的旁支", () => {
  const assets = [...fixtures, make("elsewhere", "Assets/AvatarExtra/no.txt")], ids = new Set(assets.map((asset) => asset.guid));
  const tree = treeLib.buildUnityAssetTree(assets);
  const checked = treeLib.unityTreeAssetIds(tree.nodes.get("assets/avatar"), ids);
  assert.deepEqual(new Set(checked), new Set(["folder", "model", "img", "meta"]));
  assert.ok(!checked.includes("elsewhere"));
  const all = treeLib.unityTreeCounts(tree, ids, new Set(checked));
  assert.equal(all.get("assets/avatar").selected, all.get("assets/avatar").total);
});
test("目录树兼容空目录、大小写相同的父路径和数字自然排序", () => {
  const assets = [make("b", "Assets/Folder/file10.txt"), make("a", "Assets/folder/file2.txt"), make("empty", "Assets/Empty", "文件夹")];
  const tree = treeLib.buildUnityAssetTree(assets);
  assert.equal(tree.roots[0].children.length, 2);
  assert.deepEqual(tree.nodes.get("assets/folder").children.map((node) => node.name), ["file2.txt", "file10.txt"]);
  const counts = treeLib.unityTreeCounts(tree, new Set(assets.map((asset) => asset.guid)), new Set());
  assert.equal(counts.get("assets/empty").total, 1);
});

const nativeRequire = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/components/unity-asset-tree.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, require(name) {
  if (name === "../lib/unity-asset-tree") return treeLib;
  if (name === "../lib/local-files") return loadLocalModule("app/lib/local-files.ts");
  return nativeRequire(name);
} });
const props = { assets: fixtures, filteredIds: eligible, filterKey: "", activeId: "img", selected: new Set(["img"]), busy: false, onActivate() {}, onSelect() {} };
test("真实目录组件渲染层级、展开按钮、半选状态和当前预览资源", () => {
  const html = renderToStaticMarkup(createElement(exports.UnityAssetTree, props));
  assert.match(html, /role="tree"/);
  assert.match(html, /aria-label="Unity 资源目录树"/);
  assert.match(html, /aria-level="4"/);
  assert.match(html, /aria-checked="mixed"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /face\.png/);
  assert.match(html, /全部展开/);
  assert.match(html, /全部收起/);
  assert.doesNotMatch(html, /<table/);
});

test("实际 Unity 页面左侧仅有目录树，空态与加载资源的预览均位于操作区上方", () => {
  for (const assets of [[], fixtures]) {
    let taskIndex = 0, stateIndex = 0;
    const page = {};
    const pageSource = ts.transpileModule(readFileSync(new URL("../app/components/unity-package-preview.tsx", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(pageSource, { exports: page, require(name) {
      if (name === "react") {
        const react = nativeRequire("react");
        return { ...react, useState: (value) => react.useState(stateIndex++ === 4 && assets.length ? assets[0].guid : value) };
      }
      if (name === "next/dynamic") return { default: () => () => null };
      if (name === "./utility-shell") return { UtilityShell: ({ children }) => createElement("main", null, children) };
      if (name === "./local-workbench") return {
        useLocalTask: () => ({ result: taskIndex++ === 0 ? { assets } : null, busy: false, reset() {}, run() {} }),
        useBlobUrl: () => "",
        LocalUpload: () => null, TaskFeedback: () => null, LocalDownload: () => null,
      };
      if (name === "./unity-asset-tree") return exports;
      if (name === "../lib/local-files") return loadLocalModule("app/lib/local-files.ts");
      if (name === "../lib/unity-preview") return loadLocalModule("app/lib/unity-preview.ts");
      if (name === "../lib/resource-limits") return loadLocalModule("app/lib/resource-limits.ts");
      if (name === "../lib/game-asset-client" || name === "../lib/local-images") return {};
      return nativeRequire(name);
    } });
    const html = renderToStaticMarkup(createElement(page.default));
    const directory = html.match(/<section class="utility-panel unity-directory"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(directory, "页面应保留独立的左侧目录面板");
    assert.match(directory, /role="tree"/);
    assert.doesNotMatch(directory, /搜索路径或 GUID|资源类型|筛选后|已选|选择全部筛选结果|清空选择|全部展开|全部收起|勾选文件夹/);
    const sidebarStart = html.indexOf('<div class="asset-preview-stack unity-sidebar">');
    assert.ok(sidebarStart > html.indexOf('aria-label="资源目录"'));
    const sidebar = html.slice(sidebarStart);
    const previewStart = sidebar.indexOf('aria-label="资源预览"'), controlsStart = sidebar.indexOf('aria-label="资源操作"');
    assert.ok(previewStart >= 0 && controlsStart > previewStart, "资源预览应先于资源操作，而非仅通过 CSS 调换视觉顺序");
    if (assets.length) assert.ok(sidebar.includes("Assets/Avatar/Textures/face.png"));
    for (const text of ["搜索路径或 GUID", "资源类型", "筛选后", "已选", "选择全部筛选结果", "清空选择", "全部展开", "全部收起", "勾选文件夹", "资源预览"]) {
      assert.ok(sidebar.includes(text), `右侧应包含 ${text}`);
    }
  }
});

test("紧凑样式只作用于 Unity 右侧卡片，目录树行高及其他工具不变", () => {
  const css = postcss.parse(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
  const values = (selector) => {
    const result = {};
    css.walkRules((rule) => {
      if (rule.selector === selector) rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
    });
    return result;
  };
  assert.equal(values(".unity-sidebar").gap, "12px");
  assert.equal(values(".unity-sidebar > .utility-panel").padding, "14px");
  assert.equal(values(".unity-sidebar .utility-controls").gap, "10px");
  assert.equal(values(".unity-preview").gap, "10px");
  assert.equal(values(".unity-sidebar .asset-path").margin, "0");
  assert.equal(values(".unity-sidebar .workbench-details").gap, "6px 10px");
  assert.equal(values(".unity-tree-row").height, "44px");
  assert.equal(values(".utility-panel").padding, "14px", "保留现有窄屏公共面板内边距");
  assert.equal(values(".utility-controls").gap, "16px");
});

test("精灵图页面、独立处理模块、依赖和公开入口已移除", () => {
  for (const path of ["app/sprite-sheet/page.tsx", "app/components/sprite-sheet.tsx", "app/lib/sprite-sheet.ts", "app/lib/sprite-render.ts"]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  }
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.dependencies["maxrects-packer"], undefined);
  for (const path of ["app/components/tool-search-grid.tsx", "public/sitemap.xml", "package-lock.json", "scripts/prepare-document-assets.mjs"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), /sprite-sheet|maxrects-packer/);
  }
});

test("目录展开控件使用实心小三角，专用样式覆盖通用按钮边框和内边距", () => {
  const html = renderToStaticMarkup(createElement(exports.UnityAssetTree, props));
  const toggles = [...html.matchAll(/<button\b[^>]*class="unity-tree-toggle"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.ok(toggles.length > 0);
  for (const [, content] of toggles) {
    assert.match(content, /<svg[^>]*viewBox="0 0 12 12"[^>]*aria-hidden="true"/);
    assert.match(content, /<path d="M4 2 9 6 4 10Z" fill="currentColor"/);
  }
  const css = postcss.parse(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
  const declarations = (selector) => {
    const result = {};
    css.walkRules((rule) => {
      if (rule.selector === selector) rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
    });
    return result;
  };
  // Retain the generic button selector's specificity and add the toggle class.
  // The former `.utility-card .unity-tree-toggle` lost to :not(.primary-button).
  const toggle = declarations(".utility-card button.unity-tree-toggle:not(.primary-button)");
  for (const [property, value] of Object.entries({ padding: "0", border: "0", "border-radius": "0", background: "transparent", gap: "0" })) {
    assert.equal(toggle[property], value, `展开控件应覆盖通用按钮的 ${property}`);
  }
  const svg = declarations(".unity-tree-toggle svg");
  assert.equal(svg.width, "12px");
  assert.equal(svg.height, "12px");
  assert.equal(svg.flex, "none", "小三角不能被按钮布局挤没");
  assert.equal(declarations('.unity-tree-toggle[aria-expanded="true"] svg').transform, "rotate(90deg)");
});
test("两万项资源只渲染可见行，保留完整层级和后代计数", () => {
  const assets = Array.from({ length: 20_000 }, (_, i) => make(String(i), `Assets/Sprites/frame${i}.png`, "图片"));
  const ids = new Set(assets.map((asset) => asset.guid));
  const tree = treeLib.buildUnityAssetTree(assets), counts = treeLib.unityTreeCounts(tree, ids, new Set());
  assert.equal(counts.get("assets").total, 20_000);
  assert.equal(treeLib.unityTreeRows(tree, counts, new Set(tree.nodes.keys())).length, 20_002);
  const html = renderToStaticMarkup(createElement(exports.UnityAssetTree, { ...props, assets, filteredIds: ids, activeId: "0" }));
  assert.ok((html.match(/role="treeitem"/g) ?? []).length <= 30);
  assert.match(html, /aria-setsize="20000"/);
  assert.ok(html.length < 50_000);
});

function interactionHarness(initial) {
  const slots = [], exported = {};
  let cursor = 0, currentProps = { ...initial }, output;
  const hooks = {
    useMemo(callback) { return callback(); },
    useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
  };
  vm.runInNewContext(source, { exports: exported, requestAnimationFrame(callback) { callback(); }, require(name) {
    if (name === "react") return hooks;
    if (name === "../lib/unity-asset-tree") return treeLib;
    if (name === "../lib/local-files") return loadLocalModule("app/lib/local-files.ts");
    return nativeRequire(name);
  } });
  function render(patch = {}) {
    currentProps = { ...currentProps, ...patch, onSelect(ids, checked) {
      const next = new Set(currentProps.selected);
      for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
      currentProps.selected = next;
    } };
    cursor = 0; output = exported.UnityAssetTree(currentProps);
  }
  function find(predicate) {
    const pending = [output];
    while (pending.length) {
      const next = pending.pop();
      if (!next || typeof next !== "object") continue;
      if (Array.isArray(next)) { pending.push(...next); continue; }
      if (predicate(next)) return next;
      pending.push(next.props?.children);
    }
  }
  function findAll(predicate) {
    const pending = [output], found = [];
    while (pending.length) {
      const next = pending.pop();
      if (!next || typeof next !== "object") continue;
      if (Array.isArray(next)) { pending.push(...next); continue; }
      if (predicate(next)) found.push(next);
      pending.push(next.props?.children);
    }
    return found;
  }
  render();
  return { render, find, findAll, get selected() { return currentProps.selected; } };
}
test("目录组件实测勾选、半选与展开收起，操作后不会丢失目录或资源", () => {
  const ui = interactionHarness(props), click = { stopPropagation() {} };
  ui.find((item) => item.type === "input" && item.props["aria-label"] === "选择 Assets/Avatar及其子项").props.onChange();
  ui.render();
  assert.deepEqual(ui.selected, new Set(["img", "folder", "model", "meta"]));
  assert.equal(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar，文件夹").props["aria-checked"], true);
  ui.find((item) => item.type === "input" && item.props["aria-label"] === "选择 Assets/Avatar/Textures/face.png").props.onChange();
  ui.render();
  assert.equal(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar，文件夹").props["aria-checked"], "mixed");
  ui.find((item) => item.type === "button" && item.props["aria-label"] === "收起 Assets/Avatar").props.onClick(click);
  ui.render();
  assert.ok(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar，文件夹"));
  assert.equal(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar/Textures/face.png，图片"), undefined);
  ui.find((item) => item.type === "button" && item.props["aria-label"] === "展开 Assets/Avatar").props.onClick(click);
  ui.render();
  assert.ok(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar/Textures/face.png，图片"));
  assert.equal(ui.selected.size, 3);
});
test("目录组件搜索自动展示父路径，展开全部与键盘开关都能生效", () => {
  const ui = interactionHarness({ ...props, children: ({ tree, controls }) => createElement("div", null,
    createElement("section", { "aria-label": "资源目录" }, tree),
    createElement("aside", { "aria-label": "资源操作" }, controls),
  ) });
  ui.find((item) => item.type === "button" && item.props.children === "全部收起").props.onClick();
  ui.render();
  assert.equal(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar，文件夹"), undefined);
  const root = ui.find((item) => item.props?.["aria-label"] === "Assets，文件夹"), target = {};
  root.props.onKeyDown({ key: "ArrowRight", target, currentTarget: target, preventDefault() {} });
  ui.render();
  assert.ok(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar，文件夹"));
  ui.find((item) => item.type === "button" && item.props.children === "全部展开").props.onClick();
  ui.render();
  assert.ok(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar/Models/body.fbx，模型"));
  ui.render({ filterKey: "图片", filteredIds: new Set(["img"]) });
  assert.ok(ui.find((item) => item.props?.["aria-label"] === "Assets/Avatar/Textures/face.png，图片"));
  assert.equal(ui.find((item) => item.props?.["aria-label"] === "Assets/Other，文件夹"), undefined);
});

test("虚拟目录滚动、返回顶部及筛选后始终保留一个可见键盘入口", () => {
  const assets = Array.from({ length: 100 }, (_, i) => make(String(i), `Assets/f${i}.txt`));
  const ui = interactionHarness({ ...props, assets, filteredIds: new Set(assets.map((item) => item.guid)), activeId: "0", selected: new Set() });
  const entries = () => ui.findAll((item) => item.props?.role === "treeitem" && item.props.tabIndex === 0);
  assert.equal(entries().length, 1);
  const rootId = entries()[0].props["aria-label"];
  ui.find((item) => item.props?.role === "tree").props.onScroll({ currentTarget: { scrollTop: 1760 } });
  ui.render();
  assert.equal(entries().length, 1);
  assert.notEqual(entries()[0].props["aria-label"], rootId);
  assert.equal(entries()[0].props["aria-label"], "Assets/f39.txt，文本", "Tab 入口应是视口首行，而非上方预渲染的隐藏行");
  entries()[0].props.onFocus();
  ui.render();
  const focusedRow = entries()[0];
  const checkbox = ui.find((item) => item.type === "input" && item.props["aria-label"] === `选择 ${focusedRow.props["aria-label"].split("，")[0]}`);
  assert.ok(checkbox);
  const target = {};
  focusedRow.props.onKeyDown({ key: " ", target, currentTarget: target, preventDefault() {} });
  ui.render();
  assert.equal(ui.selected.size, 1, "滚动后通过 Tab 聚焦的行仍能用空格勾选");
  ui.find((item) => item.props?.role === "tree").props.onScroll({ currentTarget: { scrollTop: 0 } });
  ui.render();
  assert.equal(entries().length, 1);
  assert.equal(entries()[0].props["aria-label"], rootId);
  ui.render({ filterKey: "f99", filteredIds: new Set(["99"]) });
  assert.equal(entries().length, 1);
  ui.render({ filterKey: "no-match", filteredIds: new Set() });
  assert.equal(entries().length, 0);
});
