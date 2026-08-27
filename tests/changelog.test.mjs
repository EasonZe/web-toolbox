import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../app/components/floating-dock.tsx", import.meta.url),
  "utf8",
);

test("removes the changelog entry and dialog while preserving other dock actions", () => {
  assert.doesNotMatch(componentSource, /更新日志|changelog|懒得写|FiRefreshCw/i);
  assert.match(componentSource, /aria-label="爱发电支持作者"/);
  assert.match(componentSource, /aria-label="打开设置"/);
  assert.match(componentSource, /aria-label="回到顶部"/);
  assert.match(componentSource, /window\.scrollY > 32/);
  assert.match(componentSource, /if \(!settingsOpen\) return/);
  assert.match(componentSource, /event\.key === "Escape"/);
  assert.match(componentSource, /dialogTriggerRef\.current\?\.focus\(\)/);
});
