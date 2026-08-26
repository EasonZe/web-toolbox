import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../app/components/floating-dock.tsx", import.meta.url),
  "utf8",
);

test("keeps the changelog intentionally empty", () => {
  assert.match(componentSource, /懒得写\.\.\./);
  assert.doesNotMatch(componentSource, /const changelog\s*=/);
  assert.doesNotMatch(componentSource, /全工具箱稳定性检查/);
  assert.doesNotMatch(componentSource, /三个视频工具上线/);
});
