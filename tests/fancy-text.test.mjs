import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/fancy-text.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, { exports: helpers, Array, String });

test("双线体准确生成用户要求的花体字", () => {
  const style = helpers.fancyTextStyles.find((item) => item.id === "double-struck");
  assert.equal(helpers.transformFancyText("Eason", style), "𝔼𝕒𝕤𝕠𝕟");
  assert.equal(helpers.transformFancyText("Hi 中国!", style), "ℍ𝕚 中国!");
});

test("提供多种可复制的Unicode样式并保留中文", () => {
  assert.ok(helpers.fancyTextStyles.length >= 8);
  for (const style of helpers.fancyTextStyles) {
    assert.match(helpers.transformFancyText("A1中文", style), /中文/);
  }
});
