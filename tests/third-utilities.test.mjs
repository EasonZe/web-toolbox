import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PDFDocument, PDFName } from "pdf-lib";
import Papa from "papaparse";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { convertCodec } = loadLocalModule("app/lib/text-codec.ts");
const { convertPinyin } = loadLocalModule("app/lib/text-pinyin.ts");
const { convertTable } = loadLocalModule("app/lib/table-conversion.ts");
const { imagePdfLayout, buildImagesPdf, preparePdfImage } = loadLocalModule("app/lib/images-pdf.ts");
const { codecModes, defaultPinyinOptions, defaultImagePdfOptions } = loadLocalModule("app/lib/extra-tool-options.ts");
const { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");
const tableOptions = { input: "csv", output: "json", header: true, safeFormulae: true, bom: true };

test("新增库精确锁定，MIT / BSD 原始许可证随生产构建分发", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const [name, version] of [["pinyin-pro", "3.29.5"], ["entities", "8.1.0"]]) assert.equal(pkg.dependencies[name], version);
  for (const name of ["pinyin-pro", "entities", "papaparse"]) {
    const source = await readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), "utf8");
    const built = await readFile(new URL(`../dist/client/vendor-licenses/${name}.txt`, import.meta.url), "utf8");
    assert.equal(built, source);
  }
});

test("六类文本编码支持中文、Emoji、换行、BOM 和 HTML 原样往返", () => {
  const text = '\uFEFF中文😀\n&<script>"x"</script> + % \\';
  for (const { id } of codecModes) {
    const encoded = convertCodec(text, id, "encode");
    assert.equal(convertCodec(encoded, id, "decode"), text, id);
  }
  assert.equal(convertCodec("", "base64", "decode"), "");
  assert.equal(convertCodec("&copy;&#x1F600;&nbsp;", "html", "decode"), "©😀\u00a0");
  assert.equal(convertCodec("\\uD83D\\uDE00", "unicode", "decode"), "😀");
});
test("URL 和表单编码明确区分空格、加号及保留字符", () => {
  assert.equal(convertCodec("a b+c&=", "url", "encode"), "a%20b%2Bc%26%3D");
  assert.equal(convertCodec("a b+c&=", "form", "encode"), "a+b%2Bc%26%3D");
  assert.equal(convertCodec("a+b", "url", "decode"), "a+b");
  assert.equal(convertCodec("a+b", "form", "decode"), "a b");
  assert.equal(convertCodec("77+/", "base64", "decode"), "\uffff");
  assert.equal(convertCodec("77-_", "base64url", "decode"), "\uffff");
});
test("编码拒绝非规范填充、非 UTF8、畸形 Unicode 和 URL，不执行脚本", () => {
  for (const text of ["A", "AB==", "ab=", "a=bc", "!!!!", "/w==", "AA==="]) assert.throws(() => convertCodec(text, "base64", "decode"));
  assert.throws(() => convertCodec("77+/", "base64url", "decode"));
  for (const text of ["%", "%XY", "%C0%AF"]) assert.throws(() => convertCodec(text, "url", "decode"), /URL/);
  for (const text of ["\\u{110000}", "\\uZZZZ", "\\uD800", "\\n", "\\"]) assert.throws(() => convertCodec(text, "unicode", "decode"));
  assert.throws(() => convertCodec("\ud800", "base64", "encode"), /代理/);
  assert.throws(() => convertCodec("a".repeat(toolLimits.text.codecChars + 1), "html", "encode"), /200 万/);
  assert.equal(convertCodec("&lt;img src=x onerror=alert(1)&gt;", "html", "decode"), "<img src=x onerror=alert(1)>");
});
test("拼音处理多音词、繁体、声调和首字母，保留 CRLF 与空行", () => {
  assert.equal(convertPinyin("重庆音乐银行", defaultPinyinOptions), "chóng qìng yīn yuè yín háng");
  assert.equal(convertPinyin("漢語拼音", defaultPinyinOptions), "hàn yǔ pīn yīn");
  assert.equal(convertPinyin("汉语", { ...defaultPinyinOptions, tone: "num" }), "han4 yu3");
  assert.equal(convertPinyin("中国\r\n\r\n上海\n", { ...defaultPinyinOptions, tone: "none", separator: "-" }), "zhong-guo\r\n\r\nshang-hai\n");
  assert.equal(convertPinyin("中国", { ...defaultPinyinOptions, tone: "initial", separator: "", uppercase: true }), "ZG");
  assert.match(convertPinyin("曾乐乐", { ...defaultPinyinOptions, surname: true }), /^zēng/);
  assert.match(convertPinyin("你好Eason2026😀", defaultPinyinOptions), /Eason2026😀/);
  assert.throws(() => convertPinyin("字".repeat(toolLimits.text.pinyinChars + 1), defaultPinyinOptions), /20 万/);
});
test("CSV 保留中文、长编号、前导零、引号、嵌入换行和 UTF8 BOM", () => {
  const result = convertTable('\uFEFF姓名,编号,说明\r\n张三,001,"第一行\n第二行"\r\n李四,9007199254740993123,"逗号,双引号"""', tableOptions);
  assert.deepEqual(JSON.parse(result.text), [{ 姓名: "张三", 编号: "001", 说明: "第一行\n第二行" }, { 姓名: "李四", 编号: "9007199254740993123", 说明: '逗号,双引号"' }]);
  assert.equal(result.rows, 2); assert.equal(result.columns, 3);
  const tsv = convertTable(result.text, { ...tableOptions, input: "json", output: "tsv" });
  assert.ok(tsv.text.startsWith("\uFEFF"));
  assert.deepEqual(JSON.parse(convertTable(tsv.text, { ...tableOptions, input: "tsv" }).text), JSON.parse(result.text));
});
test("无表头二维数组和异构 JSON 字段不丢列，原型字段作为普通数据保留", () => {
  assert.deepEqual(JSON.parse(convertTable("a,b\n1,2", { ...tableOptions, header: false }).text), [["a", "b"], ["1", "2"]]);
  const json = '[{"__proto__":"safe","a":1},{"constructor":"value","b":true}]';
  const result = convertTable(json, { ...tableOptions, input: "json", output: "csv", bom: false });
  assert.equal(result.columns, 4);
  const parsed = JSON.parse(convertTable(result.text, tableOptions).text);
  assert.equal(Object.getPrototypeOf(parsed[0]), Object.prototype);
  assert.equal(Object.hasOwn(parsed[0], "__proto__"), true); assert.equal(parsed[0].__proto__, "safe");
  assert.equal(parsed[1].constructor, "value");
  assert.equal(convertTable('[{"a":false,"b":null,"c":-1.5}]', { ...tableOptions, input: "json", output: "csv", bom: false }).text, "a,b,c\r\nfalse,,-1.5");
});
test("CSV 导出保护公式文本和表头，数值负数保持为数值；可显式关闭", () => {
  const result = convertTable('[["=1+1"," +cmd","@SUM(1)","\\tfoo",-5,"-text"]]', { ...tableOptions, input: "json", output: "csv", bom: false });
  const row = Papa.parse(result.text).data[0];
  assert.deepEqual(row, ["'=1+1", "' +cmd", "'@SUM(1)", "'\tfoo", "-5", "'-text"]);
  assert.equal(result.protectedCells, 5);
  const unsafe = convertTable('[["=1+1"]]', { ...tableOptions, input: "json", output: "csv", safeFormulae: false, bom: false });
  assert.equal(unsafe.text, "=1+1");
  assert.match(convertTable('[{"=header":"value"}]', { ...tableOptions, input: "json", output: "csv", bom: false }).text, /^'=/);
});
test("表格拒绝重复空表头、不等宽、嵌套、畸形数据和不安全整数", () => {
  for (const text of ["a,a\n1,2", ",b\n1,2", "a,b\n1", 'a,b\n"unterminated,2']) assert.throws(() => convertTable(text, tableOptions));
  for (const text of ['{}', '[]', '[null]', '[[1],[1,2]]', '[{"x":{}}]', '[{"id":9007199254740993123}]', '[{"n":1e999}]']) assert.throws(() => convertTable(text, { ...tableOptions, input: "json" }));
  assert.throws(() => convertTable("x".repeat(toolLimits.text.jsonChars + 1), tableOptions), /500 万/);
  assert.throws(() => convertTable(Array(toolLimits.table.rows + 2).fill("a").join("\n"), tableOptions), /10 万/);
  assert.throws(() => convertTable(Array(toolLimits.table.columns + 1).fill("a").join(","), tableOptions), /1000 列/);
});
test("表格只截短预览，不截断转换和下载内容", () => {
  const text = Array.from({ length: 120 }, (_, i) => `${i},${"字".repeat(400)}`).join("\n");
  const result = convertTable(text, { ...tableOptions, header: false });
  assert.equal(result.rows, 120); assert.equal(result.preview.length, 101);
  assert.equal(result.preview[0][1].length, 300);
  assert.equal(JSON.parse(result.text)[119][1].length, 400);
});
test("图片 PDF 纸张方向、边距、比例和 DPI 正确，异常页面拒绝导出", () => {
  const portrait = imagePdfLayout(100, 200, defaultImagePdfOptions);
  const landscape = imagePdfLayout(200, 100, defaultImagePdfOptions);
  assert.ok(portrait.pageHeight > portrait.pageWidth); assert.ok(landscape.pageWidth > landscape.pageHeight);
  assert.ok(Math.abs(portrait.width / portrait.height - 0.5) < 1e-12);
  assert.ok(portrait.x >= 10 * 72 / 25.4 - 1e-8); assert.ok(portrait.y >= 10 * 72 / 25.4 - 1e-8);
  const exact = imagePdfLayout(300, 600, { ...defaultImagePdfOptions, page: "image", dpi: 300, margin: 0 });
  assert.deepEqual([exact.pageWidth, exact.pageHeight], [72, 144]);
  assert.throws(() => imagePdfLayout(0, 1, defaultImagePdfOptions));
  assert.throws(() => imagePdfLayout(10000, 10000, { ...defaultImagePdfOptions, page: "image", dpi: 36, margin: 50 }), /过大/);
  assert.throws(() => imagePdfLayout(1, 1, { ...defaultImagePdfOptions, margin: NaN }));
});
async function fixture(width, height, color, format = "png") {
  return sharp({ create: { width, height, channels: 4, background: color } })[format]().toBuffer();
}
test("真实 PDF 合成保留页序、图片尺寸与透明遮罩，进度正常", async () => {
  const png = await fixture(20, 40, { r: 255, g: 0, b: 0, alpha: 0.5 });
  const jpg = await fixture(60, 30, "blue", "jpeg");
  const files = [new File([png], "one.png"), new File([jpg], "two.jpg")], progress = [];
  const prepare = async (file) => ({ data: new Uint8Array(await file.arrayBuffer()), width: file.name === "one.png" ? 20 : 60, height: file.name === "one.png" ? 40 : 30, format: file.name === "one.png" ? "png" : "jpeg" });
  const bytes = await buildImagesPdf(files, { ...defaultImagePdfOptions, page: "image", dpi: 72, margin: 0 }, new AbortController().signal, (value) => progress.push(value), prepare);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(doc.getPages().map((p) => [p.getWidth(), p.getHeight()]), [[20, 40], [60, 30]]);
  const image = doc.getPage(0).node.Resources().lookup(PDFName.of("XObject"));
  const stream = image.lookup(image.keys()[0]);
  assert.ok(stream.dict.has(PDFName.of("SMask")), "透明 PNG 应保留透明遮罩");
  assert.equal(progress.at(-1), 95);
});
test("PDF 合成取消、畸形编码、尺寸不符及批量/内存预算不返回部分输出", async () => {
  const file = new File(["x"], "test.png");
  const cancelled = new AbortController(); cancelled.abort(new Error("用户取消"));
  await assert.rejects(buildImagesPdf([file], defaultImagePdfOptions, cancelled.signal), /用户取消/);
  await assert.rejects(buildImagesPdf([], defaultImagePdfOptions, new AbortController().signal), /1–200/);
  await assert.rejects(buildImagesPdf(Array(201).fill(file), defaultImagePdfOptions, new AbortController().signal), /1–200/);
  const png = await fixture(2, 2, "red");
  await assert.rejects(buildImagesPdf([file], defaultImagePdfOptions, new AbortController().signal, undefined, async () => ({ data: png, width: 4, height: 4, format: "png" })), /不一致/);
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone" } });
    await assert.rejects(buildImagesPdf([file], defaultImagePdfOptions, new AbortController().signal, undefined, async () => ({ data: png, width: 8192, height: 8192, format: "png" })), /内存预算/);
  } finally { if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else delete globalThis.navigator; }
  const stop = new AbortController();
  await assert.rejects(buildImagesPdf([file], defaultImagePdfOptions, stop.signal, undefined, async () => { stop.abort(new Error("中断")); return { data: png, width: 2, height: 2, format: "png" }; }), /中断/);
  if (typeof OffscreenCanvas === "undefined") await assert.rejects(preparePdfImage(file, defaultImagePdfOptions, new AbortController().signal), /新版浏览器/);
});
