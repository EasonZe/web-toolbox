import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const processNotes = /本轮|用户要求|已保存的浏览器|未部署|不自动部署|functions\.exec|<tool_call>|C:[/\\]Users[/\\]/;

test("三语README保留项目入口、语言切换和许可，站内文档链接有效", async () => {
  for (const file of ["README.md", "README.zh-TW.md", "README.en.md"]) {
    const text = await read(file);
    for (const value of ["toolbox-logo.png", "README.md", "README.zh-TW.md", "README.en.md", "releases/latest", "npm ci", "npm run dev", "npm run check", "wrangler deploy --keep-vars", "MIT License", "https://github.com/EasonZe"]) assert.ok(text.includes(value), `${file}: ${value}`);
    assert.doesNotMatch(text, processNotes);
    for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) if (!/^(?:https?:|mailto:|#)/.test(href)) await access(new URL(href, root));
  }
});

test("版本说明与更新日志对应，包含当前版本且不混入执行过程记录", async () => {
  const manifest = JSON.parse(await read("package.json")), changes = await read("CHANGELOG.md");
  const files = (await readdir(new URL("docs/releases/", root))).filter((file) => /^v\d+\.\d+\.\d+\.md$/.test(file));
  assert.ok(files.includes(`v${manifest.version}.md`));
  for (const file of files) {
    const version = file.slice(1, -3), text = await read(`docs/releases/${file}`);
    assert.ok(text.startsWith(`# 多功能工具箱 v${version}\n`));
    assert.ok(changes.includes(`## [${version}]`));
    assert.doesNotMatch(text, processNotes);
    assert.match(text, /^- /m);
  }
});
