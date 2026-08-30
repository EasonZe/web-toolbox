import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/tool-search-grid.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("首页提供简洁的实时工具搜索和清空操作", () => {
  assert.match(source, /type="search"/);
  assert.match(source, /aria-label="搜索工具"/);
  assert.match(source, /placeholder="搜索工具"/);
  assert.match(source, /tools\.filter\(\(tool\) => toolMatchesSearch\(tool, query\)\)/);
  assert.doesNotMatch(source, /共\$\{tools\.length\}个工具|找到\$\{filteredTools\.length\}个工具/);
  assert.match(source, /没有找到相关工具/);
  assert.match(source, /aria-label="清空搜索"/);
});

test("工具搜索支持名称、标题、关键词和多关键词匹配", () => {
  assert.match(source, /value\.normalize\("NFKC"\)/);
  assert.match(source, /tool\.name} \$\{tool\.title} \$\{tool\.keywords}/);
  assert.match(source, /terms\.every\(\(term\) => haystack\.includes\(term\)\)/);
  for (const keyword of ["无水印", "bilibili", "批量", "马赛克", "sha256", "去除背景"]) {
    assert.ok(source.includes(keyword), keyword);
  }
});

test("搜索布局保持卡片网格左对齐且手机端可用", () => {
  assert.match(styles, /\.tool-search\s*\{[^}]*width:\s*min\(560px, 100%\)/s);
  assert.match(styles, /\.tool-grid\.is-searching \.tool-card\s*\{\s*animation:\s*none;/s);
  assert.match(styles, /\.tool-search-empty\s*\{/);
});
