import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { createDraftAutosave } = loadLocalModule("app/lib/draft-autosave.ts");

test("连续编辑只写入最后一份草稿，离开页面可立即补存且不重复写入", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = [], writer = createDraftAutosave((text) => saved.push(text));
  for (let i = 0; i < 100; i++) writer.schedule(`草稿${i}`);
  assert.equal(saved.length, 0);
  t.mock.timers.tick(400);
  assert.deepEqual(saved, ["草稿99"]);
  writer.schedule("离开前的中文😀"); writer.flush(); writer.flush();
  t.mock.timers.tick(400);
  assert.deepEqual(saved, ["草稿99", "离开前的中文😀"]);
});
test("关闭自动保存会丢弃待存任务，空文档仍能正确保存", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = [], writer = createDraftAutosave((text) => saved.push(text));
  writer.schedule("不能重新写回已删除草稿"); writer.cancel();
  t.mock.timers.tick(400); writer.flush();
  assert.deepEqual(saved, []);
  writer.schedule(""); writer.flush();
  assert.deepEqual(saved, [""]);
});
test("编辑器在卸载、页面隐藏时补存，在关闭自动保存时取消待存任务", async () => {
  const code = await readFile(new URL("../app/components/plain-text-editor.tsx", import.meta.url), "utf8");
  assert.match(code, /addEventListener\("pagehide", flushDraft\)/);
  assert.match(code, /document\.visibilityState === "hidden"/);
  assert.match(code, /return \(\) => \{\s*writer\.flush\(\)/);
  assert.match(code, /if \(!autosave\) \{\s*draftWriter\.current\?\.cancel\(\)/);
  assert.doesNotMatch(code, /setItem\(draftStorageKey, nextText\)/);
});
