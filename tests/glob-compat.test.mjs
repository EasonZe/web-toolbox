import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const glob = require("../packages/glob-compat/index.cjs");

test("tinyglobby 兼容层保持 ESLint 与 Vite 的路径匹配语义", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "toolbox-glob-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const file of ["app/page.tsx", "app/index.js", "app/.hidden.js", "app/child/index.ts", "app/child/other.txt", "app/excluded.tsx", "other/index.mjs"]) {
    await mkdir(join(cwd, file, ".."), { recursive: true });
    await writeFile(join(cwd, file), "fixture");
  }
  assert.deepEqual(glob.sync("./app/*.{js,ts,tsx}", { cwd }).sort(), ["app/excluded.tsx", "app/index.js", "app/page.tsx"]);
  assert.deepEqual(glob.globSync("./app/*/index.{js,ts,tsx}", { cwd }), ["app/child/index.ts"]);
  assert.deepEqual(glob.sync(["**/*.{js,ts,tsx}", "!**/excluded.*"], { cwd }).sort(), ["app/child/index.ts", "app/index.js", "app/page.tsx"]);
  assert.deepEqual(glob.sync("app", { cwd, onlyDirectories: true }), ["app"]);
  assert.deepEqual(glob.sync("app/*", { cwd, onlyDirectories: true }), ["app/child"]);
  assert.deepEqual(glob.sync("app", { cwd }), []);
  assert.deepEqual(glob.sync("app/*.js", { cwd, dot: true }).sort(), ["app/.hidden.js", "app/index.js"]);
  assert.deepEqual(glob.sync("app/*.{js,tsx}", { cwd, ignore: "**/excluded.*" }).sort(), ["app/index.js", "app/page.tsx"]);
  assert.deepEqual(await glob("**/*.ts", { cwd }), glob.globSync("**/*.ts", { cwd }));
  assert.deepEqual(glob.sync("app/page.tsx", { cwd, absolute: true }), [join(cwd, "app/page.tsx").replaceAll("\\", "/")]);
});

test("glob 兼容层拒绝超深模式及未实现的 fast-glob 功能", async () => {
  const nested = "{".repeat(10000) + "a" + "}".repeat(10000);
  assert.throws(() => glob.sync(nested), /nesting exceeds/);
  await assert.rejects(glob(nested), /nesting exceeds/);
  assert.throws(() => glob.sync("*", { ignore: nested }), /nesting exceeds/);
  assert.throws(() => glob.sync("a".repeat(65537)), /too long/);
  assert.throws(() => glob.sync("*", { objectMode: true }), /Unsupported fast-glob option/);
  assert.throws(() => glob.sync([1]), /must be a string/);
  assert.equal(glob.isDynamicPattern("app/*.{js,tsx}"), true);
  assert.equal(glob.isDynamicPattern("app/page.tsx"), false);
});
