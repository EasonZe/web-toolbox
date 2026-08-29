import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(await readFile(new URL("../app/components/home-scroll-restorer.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function run(stored, now = 10_000) {
  const scrolls = [], frames = [], timers = [], removed = [], attributes = [];
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date: { now: () => now }, JSON, Number,
    document: {
      documentElement: {
        setAttribute: (name, value) => attributes.push([name, value]),
      },
    },
    window: {
      sessionStorage: { getItem: () => stored, removeItem: (key) => removed.push(key) },
      scrollTo: (value) => scrolls.push(value),
      requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
      cancelAnimationFrame() {},
      setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    },
    require(name) {
      if (name === "react") return { useLayoutEffect(callback) { callback(); } };
      if (name === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
      throw new Error(name);
    },
  });
  exports.HomeScrollRestorer();
  while (frames.length) frames.shift()();
  timers.forEach((callback) => callback());
  return { scrolls, removed, attributes };
}

test("restores a recent saved position and consumes it once", () => {
  const result = run(JSON.stringify({ top: 1480, savedAt: 9000 }));
  assert.ok(result.scrolls.length >= 2);
  assert.ok(result.scrolls.every(({ top, behavior }) => top === 1480 && behavior === "auto"));
  assert.deepEqual(result.removed, ["eason-toolbox-home-scroll"]);
  assert.deepEqual(result.attributes, [["data-home-scroll-restored", "true"]]);
});

test("ignores missing, invalid, negative, or expired positions", () => {
  for (const stored of [null, "bad-json", JSON.stringify({ top: -1, savedAt: 9000 }), JSON.stringify({ top: 50, savedAt: 1 })]) {
    assert.equal(run(stored, 31 * 60 * 1000).scrolls.length, 0);
  }
});
