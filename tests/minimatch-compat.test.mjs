import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const require = createRequire(import.meta.url);

test("minimatch旧CommonJS函数、新命名导出与默认选项都委托已修复引擎", async () => {
  const legacy = require("minimatch"), modern = await import("minimatch");
  assert.equal(typeof legacy, "function"); assert.equal(modern.default, legacy); assert.equal(modern.minimatch, legacy);
  assert.equal(legacy("app/page.tsx", "**/*.tsx"), true); assert.equal(legacy("app/page.css", "**/*.tsx"), false);
  assert.equal(new modern.Minimatch("**/*.tsx").match("app/page.tsx"), true);
  assert.equal(legacy.defaults({ dot: true })(".config.ts", "*.ts"), true);
  assert.equal(legacy.defaults({ dot: true }).defaults({ nocase: true })(".CONFIG.TS", "*.ts"), true);
  assert.deepEqual(modern.match(["a.ts", "b.css"], "*.ts"), ["a.ts"]);
  assert.equal(modern.filter("*.ts")("a.ts"), true);
  assert.deepEqual(modern.braceExpand("a.{js,ts}"), ["a.js", "a.ts"]);
});

test("ESLint与React插件获得同一个可调用入口，忽略和拓展匹配语义可用", () => {
  const root = require("minimatch");
  const configRequire = createRequire(require.resolve("eslint-config-next"));
  for (const resolve of [createRequire(require.resolve("eslint")), createRequire(configRequire.resolve("eslint-plugin-react")), createRequire(require.resolve("@eslint/eslintrc")), createRequire(require.resolve("@eslint/config-array"))]) {
    const api = resolve("minimatch"); assert.equal(api, root);
    assert.equal(api("renderItem", "render*"), true);
    assert.equal(new api.Minimatch("**/.*", { dot: true }).match("app/.hidden"), true);
    assert.equal(api("Foo_bar", "Foo_*", { noglobstar: true }), true);
    assert.equal(api("a.ts", "!*.css"), true);
  }
});

test("依赖锁保留兼容包真实名称，只安装11.0.1及以上的实际minimatch引擎", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["packages/minimatch-compat"].name, "@web-toolbox/minimatch-compat");
  let found = 0;
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (entry.link || entry.name === "@web-toolbox/minimatch-compat") continue;
    if (entry.name !== "minimatch" && !path.endsWith("/node_modules/minimatch") && path !== "node_modules/minimatch") continue;
    found++; const [major, minor, patch] = entry.version.split(".").map(Number);
    assert.ok(major > 11 || major === 11 && (minor > 0 || patch >= 1), `${path}: ${entry.version}`);
  }
  assert.ok(found > 0, "真实引擎不能被一个改名版本号的空包替代");
});

test("重复globstar父目录模式在独立进程内受控完成，不再展开放大", { timeout: 10000 }, async () => {
  const code = `const mm = require('minimatch'); for (const n of [10, 20, 30]) { const pattern = '**/../'.repeat(n) + '*.tsx'; try { new mm.Minimatch(pattern, { optimizationLevel: 2 }).match('app/page.tsx'); } catch (error) { if (!/complex|limit|pattern|expand/i.test(error.message)) throw error; } } console.log('bounded');`;
  const { stdout } = await promisify(execFile)(process.execPath, ["-e", code], { cwd: new URL("../", import.meta.url), timeout: 5000 });
  assert.match(stdout, /bounded/);
});
