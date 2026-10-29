// Source coverage, not a browser layout test. No files or user data are changed.
import { readFile, access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
async function parse(path) {
  return ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
async function localModule(specifier, parent) {
  const base = resolve(dirname(parent), specifier);
  for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    try { await access(base + suffix); return base + suffix; } catch { /* Try the next source extension. */ }
  }
  throw new Error(`Missing local UI module: ${specifier} from ${relative(root, parent)}`);
}
export async function mobileLayoutInventory() {
  const catalog = await parse(resolve(root, "app/components/tool-search-grid.tsx"));
  const tools = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(catalog) === "tools" && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const item of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(item)) continue;
        const tool = {};
        for (const property of item.properties) if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) tool[property.name.getText(catalog)] = property.initializer.text;
        if (tool.href?.startsWith("/")) tools.push({ path: tool.href, title: tool.title, category: tool.category });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(catalog);
  const sources = new Map();
  async function inspect(path) {
    if (sources.has(path)) return sources.get(path);
    const source = await parse(path), info = { classes: new Set(), imports: [] };
    sources.set(path, info);
    function scan(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".") && /(?:components\/|^\.\/)/.test(node.moduleSpecifier.text)) info.imports.push(node.moduleSpecifier.text);
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "className" && node.initializer && ts.isStringLiteral(node.initializer)) for (const name of node.initializer.text.split(/\s+/)) info.classes.add(name);
      ts.forEachChild(node, scan);
    }
    scan(source);
    for (const specifier of info.imports) {
      const next = await localModule(specifier, path);
      if (next.includes(`${resolve(root, "app/components")}`)) {
        const child = await inspect(next);
        for (const name of child.classes) info.classes.add(name);
      }
    }
    return info;
  }
  for (const tool of tools) {
    const info = await inspect(resolve(root, `app${tool.path}/page.tsx`));
    tool.sharedWorkbench = info.classes.has("utility-controls") || info.classes.has("utility-panel");
    tool.classes = [...info.classes].sort();
  }
  return { tools, counts: Object.fromEntries([...new Set(tools.map((tool) => tool.category))].map((category) => [category, tools.filter((tool) => tool.category === category).length])), sourceFiles: sources.size, note: "Source/import coverage only. This does not measure rendered widths or verify touch behavior." };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await mobileLayoutInventory();
  console.log(JSON.stringify({ tools: result.tools.length, sourceFiles: result.sourceFiles, categories: result.counts, routes: result.tools.map(({ path, sharedWorkbench }) => ({ path, sharedWorkbench })), note: result.note }, null, 2));
}
