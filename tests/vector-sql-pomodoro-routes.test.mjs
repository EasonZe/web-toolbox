import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { loadBuiltWorker } from "./helpers/load-built-worker.mjs";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const routes = [
  ["image-vectorizer", "图片转 SVG 矢量图", ["生成 SVG", "处理最长边", "颜色数量（2–32）", "线条拟合", "小斑点过滤", "背景处理", "SVG · 可缩放的真实路径", "半透明和边缘会近似"]],
  ["sql-formatter", "SQL 格式化", ["格式化 SQL", "SQL 方言", "关键词大小写", "2 个空格", "PostgreSQL", "格式化结果", "不执行查询", "超过 30 秒"]],
  ["pomodoro", "番茄专注钟", ["开始专注", "暂停", "轮次设置", "专注时长", "长休间隔", "提示音", "25:00", "不自动补算多轮"]],
];
for (const [path, title, markers] of routes) test(`/${path} 生产SSR返回完整初始控件、标题及页面边界`, async () => {
  const worker = await loadBuiltWorker();
  const response = await worker.fetch(new Request(`https://tool.easonzhan.xyz/${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text();
  assert.ok(html.includes(`<title>${title} | 多功能工具箱</title>`));
  for (const marker of markers) assert.ok(html.includes(marker), `${path}: ${marker}`);
  assert.match(html, /name="viewport"/); assert.doesNotMatch(html, /C:[/\\]Users[/\\]|INTERNAL_SERVER_ERROR/);
  if (path === "image-vectorizer") {
    const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , text]) => text === "生成 SVG");
    assert.ok(button); assert.match(button[1], /\bdisabled/);
  }
});

test("新工具按需分包；SQL引擎及矢量引擎不进入初始页面依赖，产物无本机路径", async () => {
  const manifest = JSON.parse(await read("dist/client/.vite/manifest.json"));
  const files = new Set(), visited = new Set();
  async function collect(key) {
    if (visited.has(key)) return; visited.add(key); const item = manifest[key]; assert.ok(item, key);
    files.add(item.file); for (const path of item.css ?? []) files.add(path);
    for (const next of item.imports ?? []) await collect(next);
  }
  for (const [path] of routes) await collect(`app/components/${path}.tsx`);
  for (const file of files) {
    assert.doesNotMatch(file, /sql-format-[\w-]+\.js|imagetracer_v|image-vectorizer\.worker/);
    const code = await read(`dist/client/${file}`);
    assert.doesNotMatch(code, /[A-Za-z]:(?:\/|\\{1,2})Users(?:\/|\\{1,2})|file:\/\/\/[A-Za-z]:/i, file);
    assert.doesNotMatch(code, /imagedataToTracedata\s*[:=]|class NearleyParser/, file);
  }
});

// These are exact source declarations; this is not a browser/computed-layout test.
function value(sheets, selector, property, width) {
  let found;
  for (const sheet of sheets) sheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    for (let p = rule.parent; p; p = p.parent) if (p.type === "atrule" && p.name === "media") {
      for (const [, direction, bound] of p.params.matchAll(/(max|min)-width:\s*(\d+)px/g)) if (direction === "max" ? width > +bound : width < +bound) return;
    }
    rule.walkDecls(property, (decl) => { found = decl.value; });
  });
  return found;
}
test("三工具1440/390/360px布局声明保留完整标签、手机分栏保护、主题与计时数字", async () => {
  const sheets = await Promise.all(["app/styles/additional-utilities.css", "app/globals.css", "app/styles/mobile-tools.css"].map(async (p) => postcss.parse(await read(p))));
  for (const width of [1440, 390, 360]) {
    assert.equal(value(sheets, ".sql-format-fields", "grid-template-columns", width), width > 680 ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)");
    assert.equal(value(sheets, ".image-vectorizer-fields", "grid-template-columns", width), "minmax(0, 1fr)");
    assert.equal(value(sheets, ".pomodoro-inputs", "grid-template-columns", width), width > 380 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)");
    for (const selector of [".sql-format-fields label", ".image-vectorizer-fields label", ".pomodoro-inputs label", ".pomodoro-input-unit input"]) assert.equal(value(sheets, selector, "min-width", width), "0", selector);
    assert.equal(value(sheets, ".pomodoro-time", "font-variant-numeric", width), "tabular-nums");
    assert.equal(value(sheets, ".pomodoro-time", "color", width), "var(--ui-accent)");
    assert.equal(value(sheets, ".pomodoro-input-unit > span", "white-space", width), "nowrap");
  }
  for (const path of ["image-vectorizer", "sql-formatter"]) assert.match(await read(`app/components/${path}.tsx`), /task\.reset|output\.reset/);
});
