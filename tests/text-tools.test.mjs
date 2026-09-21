import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeTextWhitespace, toFullwidth, transformText } from "../app/lib/text-format.ts";

const converter = await readFile(new URL("../app/components/text-format-converter.tsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../app/components/plain-text-editor.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../app/components/tool-search-grid.tsx", import.meta.url), "utf8");

test("文本格式转换覆盖命名格式、简繁体、全半角与行处理", () => {
  assert.equal(transformText("hello world", "camel"), "helloWorld");
  assert.equal(transformText("hello world", "constant"), "HELLO_WORLD");
  assert.equal(transformText("汉字", "traditional"), "漢字");
  assert.equal(transformText("漢字", "simplified"), "汉字");
  assert.equal(toFullwidth("ABC 123!"), "ＡＢＣ　１２３！");
  assert.equal(transformText("ＡＢＣ　１２３！", "halfwidth"), "ABC 123!");
  assert.equal(normalizeTextWhitespace("  A   B  \n\n\n  C "), "A B\n\nC");
  assert.equal(transformText("b\na\nb", "dedupe-lines"), "b\na");
});

test("文本格式工具提供导入、复制、继续转换和下载", () => {
  assert.match(converter, /textTransformGroups/);
  assert.match(converter, /accept="\.txt,\.md,\.csv,\.log,\.json,text\/plain"/);
  assert.match(converter, /继续转换/);
  assert.match(converter, /navigator\.clipboard\.writeText\(output\)/);
  assert.match(converter, /downloadText\(output, "converted-text\.txt"\)/);
});

test("纯文本编辑器使用CodeMirror并支持完整本地编辑流程", () => {
  assert.match(editor, /@codemirror\/state/);
  assert.match(editor, /@codemirror\/view/);
  assert.match(editor, /@codemirror\/search/);
  assert.match(editor, /historyKeymap/);
  assert.match(editor, /openSearchPanel/);
  assert.match(editor, /自动保存草稿/);
  assert.match(editor, /downloadText\(text, fileName\)/);
  assert.match(editor, /maxFileSize = 5 \* 1024 \* 1024/);
});

test("两个文本工具已加入首页文字与文档分类", () => {
  for (const value of ["/text-format", "文本格式转换", "/plain-text-editor", "纯文本编辑器"]) {
    assert.ok(home.includes(value), value);
  }
});
