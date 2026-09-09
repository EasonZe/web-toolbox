import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

async function load(path) {
  const exports = {};
  const source = await read(path);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`)(exports, createRequire(import.meta.url));
  return exports;
}

test("字数统计覆盖中英文、空白、段落、行数和 UTF-8 字节", async () => {
  const { countText } = await load("../app/lib/word-count.ts");
  const stats = countText("你好，world!\n\n第二段 123。");
  assert.equal(stats.characters, 19);
  assert.equal(stats.charactersNoWhitespace, 16);
  assert.equal(stats.chineseCharacters, 5);
  assert.equal(stats.westernWords, 2);
  assert.equal(stats.words, 7);
  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.lines, 3);
  assert.equal(stats.sentences, 2);
  assert.equal(stats.whitespace, 3);
  assert.equal(stats.bytes, new TextEncoder().encode("你好，world!\n\n第二段 123。").byteLength);
  assert.equal(countText("").readingMinutes, 0);
});

test("首页加入三个新工具及其搜索关键词", async () => {
  const source = await read("../app/components/tool-search-grid.tsx");
  for (const value of ["/image-text", "图片加文字与对话框", "字体", "字幕", "/word-counter", "字数统计", "阅读时长", "/microphone-recorder", "麦克风测试与录音", "波形"]) assert.ok(source.includes(value), value);
});

test("图片文字工具提供多种字体、对话框、拖动预览和导出", async () => {
  const source = await read("../app/components/image-text-editor.tsx");
  for (const value of ["楷体", "仿宋", "圆体", "Arial", "Georgia", "圆角框", "左尾气泡", "右尾气泡", "思考气泡", "字幕框", "onPointerMove", "image/png", "image/jpeg", "下载图片", "最大 25 MB"]) assert.ok(source.includes(value), value);
  assert.doesNotMatch(source, /描边|strokeText/);
  assert.match(source, /URL\.revokeObjectURL/);
});

test("麦克风工具提供设备选择、实时波形、录音、回放和资源清理", async () => {
  const source = await read("../app/components/microphone-recorder.tsx");
  for (const value of ["enumerateDevices", "getUserMedia", "createAnalyser", "MediaRecorder", "开始测试", "开始录音", "录音试听", "下载录音", "回声消除", "噪声抑制"]) assert.ok(source.includes(value), value);
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /URL\.revokeObjectURL/);
});
