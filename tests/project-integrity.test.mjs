import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditDependencies, auditCatalog, auditProject, readToolCatalog } from "../scripts/project-integrity.mjs";
const root = path.resolve("audit-fixture");
function dependencies(change = () => {}) {
  const manifest = { name: "fixture", version: "1.0.0", dependencies: { normal: "^1.0.0", alias: "file:packages/local" }, devDependencies: { "@scope/dev": "2.0.0" } };
  const lock = { lockfileVersion: 3, packages: { "": structuredClone(manifest), "node_modules/normal": { version: "1.2.3" }, "node_modules/@scope/dev": { version: "2.0.0" }, "node_modules/alias": { link: true, resolved: "packages/local" }, "packages/local": { name: "@fixture/local", version: "1.0.0" } } };
  const files = { "package.json": manifest, "package-lock.json": lock, "node_modules/normal/package.json": { name: "normal", version: "1.2.3" }, "node_modules/@scope/dev/package.json": { name: "@scope/dev", version: "2.0.0" }, "node_modules/alias/package.json": { name: "@fixture/local", version: "1.0.0" } };
  const links = { "node_modules/alias": path.join(root, "packages/local"), "packages/local": path.join(root, "packages/local") };
  change({ manifest, lock, files, links });
  const key = (file) => path.relative(root, file).replaceAll("\\", "/");
  return auditDependencies(root, { readJson: async (file) => { if (!Object.hasOwn(files, key(file))) throw new Error("missing"); return files[key(file)]; }, realpath: async (file) => { if (!links[key(file)]) throw new Error("missing link"); return links[key(file)]; } });
}

test("依赖校验读取实际包版本，支持生产/开发依赖及名称不同的本地链接", async () => {
  const result = await dependencies(); assert.equal(result.checked, 3); assert.deepEqual(result.failures, []);
});

test("依赖漂移、锁文件过时、缺包和本地链接越界或指错目标阻止构建", async () => {
  for (const [change, expected] of [
    [({ files }) => files["node_modules/normal/package.json"].version = "9.0.0", /实际安装/],
    [({ files }) => files["node_modules/normal/package.json"].name = "wrong", /实际安装/],
    [({ files }) => delete files["node_modules/@scope/dev/package.json"], /缺失/],
    [({ manifest }) => manifest.dependencies.normal = "^3.0.0", /锁定范围/],
    [({ manifest }) => manifest.version = "2.0.0", /项目名称或版本/],
    [({ lock }) => lock.packages[""].dependencies.stale = "1.0.0", /已移除/],
    [({ lock }) => delete lock.packages["node_modules/normal"], /缺少锁定条目/],
    [({ lock }) => lock.packages["node_modules/alias"].resolved = "../outside", /越出/],
    [({ lock }) => delete lock.packages["packages/local"], /目标锁定/],
    [({ links }) => links["node_modules/alias"] = path.join(root, "packages/wrong"), /实际本地链接/],
    [({ links }) => delete links["node_modules/alias"], /不可读取/],
    [({ lock }) => lock.lockfileVersion = 1, /依赖锁/],
    [({ manifest }) => manifest.devDependencies.normal = "2.0.0", /声明冲突/],
  ]) assert.match((await dependencies(change)).failures.join("\n"), expected);
});

const entry = (next = {}) => ({ name: "fixture", title: "示例工具", href: "/fixture", keywords: "example", category: "文档", icon: "Icon", ...next });
const source = (tools = [entry()], categories = ["文档"]) => `const categoryOrder = ${JSON.stringify(categories)} as const; const tools = ${JSON.stringify(tools).replaceAll('"icon":"Icon"', '"icon": Icon')} satisfies Tool[];`;
const xml = (paths = ["/", "/fixture"]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((url) => `<url><loc>https://fixture.test${url}</loc></url>`).join("")}</urlset>`;
const audit = (next = {}) => auditCatalog({ source: source(), sitemap: xml(), routes: ["/", "/fixture", "/calculator"], homepage: "https://fixture.test/", ...next });

test("目录静态读取不执行 UI；现有旧计算器重定向无需重复注册", () => {
  assert.deepEqual(audit().failures, []); assert.equal(audit().checked, 1);
  assert.equal(readToolCatalog(`${source()} throw new Error('must never run');`).tools[0].icon, "Icon");
  const external = entry({ name: "external", title: "外部", href: "https://example.test/tool", external: true });
  assert.deepEqual(audit({ source: source([entry(), external]) }).failures, []);
});

test("目录重复、非法分类、动态字段、遗漏页面和站点地图路径不一致被定位", () => {
  for (const [next, expected] of [
    [{ source: source([entry(), entry()]) }, /路径重复.*fixture/],
    [{ source: source([entry({ category: "不存在" })]) }, /分类未注册/],
    [{ source: source([entry({ title: "" })]) }, /必要的静态/],
    [{ source: source([], ["文档", "文档"]) }, /分类.*重复/],
    [{ source: source([]) }, /不能为空/],
    [{ source: source().replace('"name":"fixture"', '"name": sideEffect()') }, /必要的静态/],
    [{ source: source().replace('"name":"fixture"', '...sideEffect()') }, /展开或动态/],
    [{ source: source().replace('"name":"fixture"', '"name":"fixture","name":"other"') }, /重复字段/],
    [{ routes: ["/"] }, /页面不存在/],
    [{ routes: ["/", "/fixture", "/orphan"] }, /页面未注册.*orphan/],
    [{ sitemap: xml(["/"]) }, /遗漏.*fixture/],
    [{ sitemap: xml(["/", "/fixture", "/orphan"]) }, /未注册路径/],
    [{ source: source([entry({ href: "javascript:alert(1)", external: true })]) }, /外部工具地址/],
  ]) assert.match(audit(next).failures.join("\n"), expected);
});

test("站点地图拒绝异站、重复、非规范 URL、DTD、错误嵌套和 XML，不做实体读取", () => {
  for (const [sitemap, expected] of [
    [xml().replace("https://fixture.test/fixture", "https://other.test/fixture"), /非本站/],
    [xml(["/", "/fixture", "/fixture"]), /路径重复/],
    [xml(["/", "/fixture?query=1"]), /非规范/],
    [xml().replace("<urlset", '<!DOCTYPE urlset [<!ENTITY ext SYSTEM "file:///never-read">]><urlset'), /DTD/],
    [xml().replaceAll("<url>", "<other>").replaceAll("</url>", "</other>"), /loc 位置/],
    [xml().replace("<loc>", "<loc><b>").replace("</loc>", "</b></loc>"), /只能包含/],
    ["<urlset><loc></urlset>", /根节点|XML/],
  ]) assert.match(audit({ sitemap }).failures.join("\n"), expected);
  assert.throws(() => audit({ homepage: "http://fixture.test/" }), /HTTPS/);
});

test("真实仓库依赖、工具、页面与站点地图一致，构建自动先校验", async () => {
  const project = fileURLToPath(new URL("../", import.meta.url)), result = await auditProject(project);
  assert.deepEqual(result.dependencies.failures, []); assert.deepEqual(result.catalog.failures, []);
  const { readFile } = await import("node:fs/promises"), pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
  assert.equal(result.dependencies.checked, new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]).size);
  const catalog = readToolCatalog(await readFile(path.join(project, "app/components/tool-search-grid.tsx"), "utf8"));
  assert.equal(result.catalog.checked, catalog.tools.length); assert.equal(result.catalog.sitemapUrls, catalog.tools.filter((tool) => !tool.external).length + 1);
  assert.equal(pkg.scripts.prebuild, "npm run check:integrity");
});
