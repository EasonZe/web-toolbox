import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/site-visit-count.tsx", import.meta.url), "utf8");
const workerEntry = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/site-visits.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0001_site_visits.sql", import.meta.url), "utf8");
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

const transpiledWorker = ts.transpileModule(workerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHandler() {
  const exports = {};
  vm.runInNewContext(transpiledWorker, { exports, Request, Response, URL, Headers });
  return exports.handleSiteVisits;
}

function createCounterEnv() {
  let total = 0;
  let calls = 0;
  return {
    env: {
      VISITS_DB: {
        prepare(sql) {
          assert.match(sql, /ON CONFLICT\(name\) DO UPDATE SET total = site_counters\.total \+ 1/);
          return {
            bind(name) {
              assert.equal(name, "site_visits");
              return {
                async first() {
                  calls += 1;
                  total += 1;
                  return { total };
                },
              };
            },
          };
        },
      },
    },
    calls: () => calls,
  };
}

test("页脚只显示本站累计访问次数", () => {
  assert.match(page, /<footer className="site-footer">/);
  assert.match(page, /本站累计访问次数：<SiteVisitCount/);
  assert.doesNotMatch(page, /有幸与你相遇|第\s*\d+\s*位访客/);
  assert.match(component, /visitCountRequest \?\?= requestVisitCount\(\)/);
  assert.match(component, /method: "POST"/);
});

test("访问计数使用 D1 持久化并由 Worker 接管接口", () => {
  assert.ok(config.d1_databases.some((database) => database.binding === "VISITS_DB"));
  assert.match(workerEntry, /url\.pathname === "\/api\/visits"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS site_counters/);
  assert.match(migration, /VALUES \('site_visits', 0\)/);
});

test("同源 POST 原子累加，其他请求不会增加次数", async () => {
  const handleSiteVisits = loadHandler();
  const counter = createCounterEnv();
  const request = () => new Request("https://tool.easonzhan.xyz/api/visits", {
    method: "POST",
    headers: { Origin: "https://tool.easonzhan.xyz" },
  });

  const first = await handleSiteVisits(request(), counter.env);
  const second = await handleSiteVisits(request(), counter.env);
  assert.deepEqual(await first.json(), { success: true, total: 1 });
  assert.deepEqual(await second.json(), { success: true, total: 2 });

  const crossOrigin = await handleSiteVisits(new Request("https://tool.easonzhan.xyz/api/visits", {
    method: "POST",
    headers: { Origin: "https://example.com" },
  }), counter.env);
  const get = await handleSiteVisits(new Request("https://tool.easonzhan.xyz/api/visits"), counter.env);
  assert.equal(crossOrigin.status, 403);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal(counter.calls(), 2);
});
