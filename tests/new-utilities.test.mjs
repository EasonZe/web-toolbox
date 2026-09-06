import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const exports = {};
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`)(exports, createRequire(import.meta.url));
  return exports;
}
const lottery = await load("../app/lib/lottery.ts");
const calculator = await load("../app/lib/calculator.ts");
const links = await load("../worker/short-links.ts");

test("名单保留同名概率，忽略空行并拒绝超限，随机索引不会越界", () => {
  assert.equal(lottery.parseNames("\uFEFF小明\r\n\n 小红 \n小明").join(","), "小明,小红,小明");
  assert.throws(() => lottery.parseNames("名字\n".repeat(501)));
  assert.throws(() => lottery.randomWinner(0));
  for (let i = 0; i < 100; i++) { const index = lottery.randomWinner(7); assert.ok(index >= 0 && index < 7); }
});

test("计算器正确处理小数、括号、百分比和角度/弧度", () => {
  assert.equal(calculator.calculate("0.1 + 0.2"), "0.3");
  assert.equal(calculator.calculate("(12 + 8) × 5"), "100");
  assert.equal(calculator.calculate("50%"), "0.5");
  assert.equal(calculator.calculate("sqrt(81) + 2^3"), "17");
  assert.ok(Math.abs(Number(calculator.calculate("sin(30)")) - .5) < 1e-12);
  assert.ok(Math.abs(Number(calculator.calculate("cos(pi)", false)) + 1) < 1e-12);
  for (const value of ["1/0", "a=5", "import(1)", "[1,2]", "9^9^9", "sqrt(-1)"]) assert.throws(() => calculator.calculate(value));
});

function environment() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE short_links (code TEXT PRIMARY KEY, url TEXT NOT NULL, created_at INTEGER, expires_at INTEGER)");
  return { db, env: {
    LINK_LIMITER: { limit: async () => ({ success: true }) },
    SHORT_LINKS: { prepare: (sql) => ({ bind: (...values) => ({
      run: async () => ({ meta: { changes: db.prepare(sql).run(...values).changes } }),
      first: async () => db.prepare(sql).get(...values) ?? null,
    }) }) },
  } };
}
function createRequest(body, origin = "https://tool.easonzhan.xyz") {
  return new Request("https://tool.easonzhan.xyz/api/short-links", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
}
test("短链接写入数据库后可以真实跳转，过期和不存在状态正确", async () => {
  const { db, env } = environment();
  try {
    const destination = "https://example.com/video?a=1&b=中文#play";
    const response = await links.handleShortLinks(createRequest({ url: destination, days: 7 }), env);
    assert.equal(response.status, 201);
    const result = await response.json();
    const redirect = await links.handleShortLinks(new Request(result.url), env);
    assert.equal(redirect.status, 302); assert.equal(redirect.headers.get("Location"), new URL(destination).href);
    db.prepare("UPDATE short_links SET expires_at = 1").run();
    assert.equal((await links.handleShortLinks(new Request(result.url), env)).status, 410);
    assert.equal((await links.handleShortLinks(new Request("https://tool.easonzhan.xyz/s/xxxxxxxxx"), env)).status, 404);
  } finally { db.close(); }
});
test("短链接拒绝脚本、畸形网址、超长请求和跨站创建，并执行频率限制", async () => {
  const { db, env } = environment();
  try {
    for (const url of ["javascript:alert(1)", "https://user:password@example.com", "http://localhost", "https://tool.easonzhan.xyz/s/xxxxxxx", "not a url"]) {
      assert.equal((await links.handleShortLinks(createRequest({ url }), env)).status, 400);
    }
    assert.equal((await links.handleShortLinks(createRequest({ url: "x".repeat(10000) }), env)).status, 400);
    assert.equal((await links.handleShortLinks(createRequest({ url: "https://example.com" }, "https://other.example"), env)).status, 403);
    env.LINK_LIMITER.limit = async () => ({ success: false });
    assert.equal((await links.handleShortLinks(createRequest({ url: "https://example.com" }), env)).status, 429);
  } finally { db.close(); }
});
