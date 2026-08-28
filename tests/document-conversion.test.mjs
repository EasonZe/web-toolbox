import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = {};
vm.runInNewContext(compile(await readFile(new URL("../app/lib/document-conversion.ts", import.meta.url), "utf8")), { exports: helpers });
const engine = {};
vm.runInNewContext(compile(await readFile(new URL("../app/lib/document-engine.ts", import.meta.url), "utf8")), { exports: engine, require: () => helpers, DataView });

test("文档格式、大小、默认设置和输出名", () => {
  assert.equal(helpers.defaultDocumentSettings.direction, "word-to-pdf");
  assert.equal(helpers.defaultDocumentSettings.mode, "text");
  assert.throws(() => helpers.validateDocumentFile(new File([], "a.docx"), "word-to-pdf"), /为空/);
  assert.throws(() => helpers.validateDocumentFile(new File(["x"], "a.doc"), "word-to-pdf"), /旧版/);
  assert.throws(() => helpers.validateDocumentFile({ size: 21 * 1048576, name: "a.pdf" }, "pdf-to-word"), /20 MB/);
  assert.throws(() => helpers.validateDocumentFile(new File(["x"], "a.pdf"), "word-to-pdf"), /docx/);
  helpers.validateDocumentFile(new File(["x"], "文件.DOCX"), "word-to-pdf");
  assert.equal(helpers.documentOutputName("文件.1.DOCX", "word-to-pdf"), "文件.1.pdf");
  assert.equal(helpers.documentOutputName("文件.pdf", "pdf-to-word"), "文件.docx");
});

test("PDF文字按页面坐标分行，中文片段不乱加空格", () => {
  const rows = helpers.groupPdfText([
    { text: "测试", x: 10, y: 60, width: 20, height: 10 },
    { text: "文", x: 20, y: 40, width: 10, height: 10 },
    { text: "中", x: 10, y: 40, width: 10, height: 10 },
    { text: "Word", x: 40, y: 40, width: 25, height: 10 },
    { text: "  ", x: 10, y: 20, width: 20, height: 10 },
  ]);
  assert.equal(rows[0].text, "中文 Word"); assert.equal(rows[1].text, "测试");
});

test("DOCX拒绝非ZIP、损坏目录及异常解压体积", () => {
  assert.throws(() => engine.checkDocxArchive(new ArrayBuffer(3)), /有效/);
  const bytes = new ArrayBuffer(100), view = new DataView(bytes);
  view.setUint32(0, 0x04034b50, true);
  assert.throws(() => engine.checkDocxArchive(bytes), /损坏/);
  view.setUint32(78, 0x06054b50, true); view.setUint16(88, 1, true); view.setUint32(94, 30, true);
  view.setUint32(30, 0x02014b50, true); view.setUint32(54, 81 * 1048576, true);
  assert.throws(() => engine.checkDocxArchive(bytes), /80 MB/);
  view.setUint32(54, 1024, true); engine.checkDocxArchive(bytes);
});
