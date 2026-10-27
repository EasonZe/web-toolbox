import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { SaxesParser } from "saxes";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };

// Inspect actual installed metadata, including our local npm link. Do not rely
// on npm's cached installation inventory, and never install/repair from here.
export async function auditDependencies(root, io = { readJson, realpath }) {
  const manifest = await io.readJson(path.join(root, "package.json")), lock = await io.readJson(path.join(root, "package-lock.json"));
  const failures = [], declarations = new Map(), lockedRoot = lock.packages?.[""];
  if (!lockedRoot || lock.lockfileVersion < 3) return { checked: 0, failures: ["依赖锁缺少当前项目记录，须使用受支持的 package-lock.json。"] };
  if (manifest.name !== lockedRoot.name || manifest.version !== lockedRoot.version) failures.push("项目名称或版本与依赖锁不一致。");
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, specification] of Object.entries(manifest[group] ?? {})) {
      if (!/^(?:@[a-z\d_.-]+\/)?[a-z\d_.-]+$/i.test(name)) { failures.push("依赖声明包含无效包名。"); continue; }
      if (lockedRoot[group]?.[name] !== specification) failures.push(`${name}：依赖声明与锁定范围不一致。`);
      if (declarations.has(name) && declarations.get(name) !== specification) failures.push(`${name}：生产和开发依赖的声明冲突。`);
      declarations.set(name, specification);
    }
    for (const name of Object.keys(lockedRoot[group] ?? {})) if (!Object.hasOwn(manifest[group] ?? {}, name)) failures.push(`${name}：锁文件根记录仍含已移除的依赖。`);
  }
  for (const name of declarations.keys()) {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry) { failures.push(`${name}：缺少锁定条目。`); continue; }
    let expected = entry;
    if (entry.link) {
      if (typeof entry.resolved !== "string" || !inside(root, path.resolve(root, entry.resolved))) { failures.push(`${name}：本地链接越出项目目录。`); continue; }
      expected = lock.packages[entry.resolved.replaceAll("\\", "/")];
      if (!expected) { failures.push(`${name}：本地链接缺少目标锁定记录。`); continue; }
      try {
        const [actual, target] = await Promise.all([io.realpath(path.join(root, "node_modules", name)), io.realpath(path.resolve(root, entry.resolved))]);
        if (path.relative(actual, target) !== "") { failures.push(`${name}：实际本地链接目标与锁文件不一致。`); continue; }
      } catch { failures.push(`${name}：本地链接不可读取。`); continue; }
    }
    try {
      const installed = await io.readJson(path.join(root, "node_modules", name, "package.json"));
      if (installed.name !== (expected.name ?? name) || typeof expected.version !== "string" || installed.version !== expected.version) failures.push(`${name}：实际安装的包名称或版本与锁文件不一致。`);
    } catch { failures.push(`${name}：实际 package.json 缺失或无法解析。`); }
  }
  return { checked: declarations.size, failures };
}

function unwrap(node) { while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression; return node; }
const stringValue = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;

/** Read static declarations with the TS parser; never evaluate the UI module. */
export function readToolCatalog(source) {
  const file = ts.createSourceFile("tool-search-grid.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), declarations = new Map();
  if (file.parseDiagnostics.length) throw new Error("工具目录源文件存在语法错误。");
  for (const statement of file.statements) if (ts.isVariableStatement(statement)) for (const variable of statement.declarationList.declarations) if (ts.isIdentifier(variable.name)) declarations.set(variable.name.text, unwrap(variable.initializer));
  const tools = declarations.get("tools"), categories = declarations.get("categoryOrder");
  if (!tools || !ts.isArrayLiteralExpression(tools) || !categories || !ts.isArrayLiteralExpression(categories)) throw new Error("未找到静态工具与分类注册表；结构变化时须同步更新目录校验。");
  const categoryNames = categories.elements.map(stringValue);
  if (categoryNames.some((name) => !name) || new Set(categoryNames).size !== categoryNames.length) throw new Error("工具分类为空、重复或不是静态文本。");
  return { categories: categoryNames, tools: tools.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) throw new Error("工具注册条目须为静态对象。");
    const values = {};
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) throw new Error("工具条目不能包含展开或动态属性。");
      const name = ts.isIdentifier(property.name) ? property.name.text : stringValue(property.name);
      if (!name || Object.hasOwn(values, name)) throw new Error("工具条目包含无效或重复字段。");
      values[name] = property.initializer.kind === ts.SyntaxKind.TrueKeyword ? true : property.initializer.kind === ts.SyntaxKind.FalseKeyword ? false : stringValue(property.initializer);
      if (name === "icon" && ts.isIdentifier(property.initializer)) values.icon = property.initializer.text;
    }
    return values;
  }) };
}

function sitemapLocations(xml) {
  const parser = new SaxesParser({ xmlns: true }), locations = [], parents = []; let current = null;
  const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  parser.on("error", () => { throw new Error("站点地图 XML 无法解析。"); });
  parser.on("doctype", () => { throw new Error("站点地图不接受 DTD。"); });
  parser.on("opentag", (tag) => {
    const parent = parents.at(-1); parents.push(tag); const depth = parents.length;
    if (depth === 1 && (tag.uri !== namespace || tag.local !== "urlset")) throw new Error("站点地图根节点或命名空间无效。");
    if (current !== null) throw new Error("站点地图 loc 只能包含 URL 文本。");
    if (tag.local === "loc") { if (depth !== 3 || tag.uri !== namespace || parent?.local !== "url" || parent.uri !== namespace) throw new Error("站点地图 loc 位置无效。"); current = ""; }
  });
  const append = (text) => { if (current !== null) current += text; };
  parser.on("text", append); parser.on("cdata", append);
  parser.on("closetag", (tag) => { if (tag.local === "loc") { locations.push(current.trim()); current = null; } parents.pop(); });
  parser.write(xml).close(); return locations;
}

export function auditCatalog({ source, sitemap, routes, homepage }) {
  const failures = []; let catalog, locations;
  try { catalog = readToolCatalog(source); locations = sitemapLocations(sitemap); } catch (error) { return { checked: 0, sitemapUrls: 0, failures: [error.message] }; }
  const base = new URL(homepage), hrefs = new Set(), titles = new Set(), names = new Set();
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("项目 homepage 须为不含路径的 HTTPS 站点地址。");
  for (const tool of catalog.tools) {
    if (["name", "title", "href", "keywords", "category", "icon"].some((field) => typeof tool[field] !== "string" || !tool[field].trim())) { failures.push("工具条目缺少必要的静态文本或图标。"); continue; }
    for (const [value, seen, field] of [[tool.href, hrefs, "路径"], [tool.title, titles, "标题"], [tool.name, names, "名称"]]) { if (seen.has(value)) failures.push(`工具${field}重复：${value}`); seen.add(value); }
    if (!catalog.categories.includes(tool.category)) failures.push(`工具分类未注册：${tool.href}`);
    if (tool.external) { try { if (new URL(tool.href).protocol !== "https:") throw new Error(); } catch { failures.push(`外部工具地址无效：${tool.title}`); } }
    else if (!/^\/[a-z\d-]+(?:\/[a-z\d-]+)*$/.test(tool.href) || !routes.includes(tool.href)) failures.push(`工具页面不存在或路径无效：${tool.href}`);
  }
  const expected = new Set(["/", ...catalog.tools.filter((tool) => !tool.external).map((tool) => tool.href)]), published = new Set();
  for (const location of locations) {
    try {
      const url = new URL(location);
      if (url.origin !== base.origin || url.search || url.hash || url.href !== new URL(url.pathname, base).href) throw new Error();
      if (published.has(url.pathname)) failures.push(`站点地图路径重复：${url.pathname}`);
      published.add(url.pathname);
    } catch { failures.push("站点地图包含非本站或非规范 URL。"); }
  }
  for (const route of expected) if (!published.has(route)) failures.push(`站点地图遗漏：${route}`);
  for (const route of published) if (!expected.has(route)) failures.push(`站点地图存在未注册路径：${route}`);
  // Preserve the old calculator redirect without exposing it as another tool.
  for (const route of routes) if (route !== "/calculator" && !expected.has(route)) failures.push(`页面未注册为工具：${route}`);
  if (!catalog.tools.length) failures.push("工具注册表不能为空。");
  return { checked: catalog.tools.length, sitemapUrls: locations.length, failures };
}

export async function auditProject(root) {
  const dependencies = await auditDependencies(root);
  const [source, sitemap, manifest, files] = await Promise.all([readFile(path.join(root, "app/components/tool-search-grid.tsx"), "utf8"), readFile(path.join(root, "public/sitemap.xml"), "utf8"), readJson(path.join(root, "package.json")), readdir(path.join(root, "app"), { recursive: true })]);
  const routes = files.map((file) => file.replaceAll("\\", "/")).filter((file) => /(?:^|\/)page\.tsx$/.test(file)).map((file) => `/${file.replace(/(?:^|\/)page\.tsx$/, "")}`);
  return { dependencies, catalog: auditCatalog({ source, sitemap, routes, homepage: manifest.homepage }) };
}
