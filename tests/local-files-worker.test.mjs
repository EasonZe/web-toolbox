import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { pptxParts } from "./helpers/seventh-fixtures.mjs";
import { zipSync } from "fflate";

test("真实 ES 模块文件 Worker 按需加载并完成 JSON、差异、ZIP、PDF 合并拆分", { timeout: 30000 }, async (t) => {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url);
  const name = (await readdir(root)).find((name) => /^local-files\.worker-.*\.js$/.test(name));
  assert.ok(name, "请先运行生产构建");
  const entry = new URL(name, root);
  const code = await readFile(entry, "utf8");
  assert.doesNotMatch(code, /PDFDocument|PDFHeader/);
  assert.match(code, /import\(["'`].*text-inspection/);
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    globalThis.fetch = async (url) => {
      if (url !== "/fonts/noto-sans-sc/regular.otf") throw new Error("测试不允许外部字体请求");
      return new Response(require("node:fs").readFileSync(new URL(${JSON.stringify(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url).href)})));
    };
    globalThis.self = { postMessage(data, transfer) {
      parentPort.postMessage({ ...data, transferCount: transfer?.length ?? 0 }, transfer);
    } };
    import(${JSON.stringify(entry.href)}).then(() => {
      parentPort.on("message", (data) => {
        if (data.serializedFiles) { data.files = data.serializedFiles.map((file) => new File([file.bytes], file.name, { type: file.type })); delete data.serializedFiles; }
        if (data.serializedFile) { const file = data.serializedFile; data.file = new File([file.bytes], file.name, { type: file.type }); delete data.serializedFile; }
        self.onmessage({ data });
      });
      parentPort.postMessage({ ready: true });
    }).catch((error) => { throw error; });
  `, { eval: true });
  t.after(() => worker.terminate());
  assert.equal((await once(worker, "message"))[0].ready, true);
  async function run(data) {
    return await new Promise((resolve, reject) => {
      const receive = (message) => { if (message.progress !== undefined) return; cleanup(); resolve(message); };
      const cleanup = () => { worker.off("message", receive); worker.off("error", fail); };
      const fail = (error) => { cleanup(); reject(error); };
      worker.on("message", receive); worker.once("error", fail); worker.postMessage(data);
    });
  }
  const json = await run({ action: "json-format", text: '{"id":9007199254740993123}', compact: true });
  assert.equal(json.result.output, '{"id":9007199254740993123}');
  assert.equal((await run({ action: "text-diff", left: "old\n", right: "new\n" })).result[0].kind, "changed");
  assert.equal((await run({ action: "text-codec", text: "5Lit5paH8J+YgA==", mode: "base64", direction: "decode" })).result, "中文😀");
  assert.match((await run({ action: "text-codec", text: "%XX", mode: "url", direction: "decode" })).error, /URL/);
  assert.deepEqual(JSON.parse((await run({ action: "yaml-convert", text: "id: '001'\nname: 工具箱", direction: "yaml-to-json", indent: 2 })).result), { id: "001", name: "工具箱" });
  assert.match((await run({ action: "yaml-convert", text: "a: &a [*a]", direction: "yaml-to-json", indent: 2 })).error, /循环/);
  const cron = await run({ action: "cron-preview", options: { expression: "0 9 * * 1-5", timezone: "Asia/Shanghai", from: "2026-10-23T09:00:00+08:00", count: 2 } });
  assert.equal(cron.result.dates[0].iso, "2026-10-26T01:00:00.000Z");
  assert.match((await run({ action: "cron-preview", options: { expression: "@daily", timezone: "UTC", from: "", count: 2 } })).error, /五段/);
  const fileTypes = await run({ action: "file-identify", serializedFiles: [{ name: "pretend.exe", type: "application/x-msdownload", bytes: new TextEncoder().encode("%PDF-1.7\n") }, { name: "archive.docx", type: "", bytes: new Uint8Array([0x50, 0x4b, 3, 4]) }] });
  assert.equal(fileTypes.error, undefined);
  assert.equal(fileTypes.result[0].extension, "pdf"); assert.equal(fileTypes.result[0].status, "mismatch"); assert.equal(fileTypes.result[1].status, "container");
  assert.equal((await run({ action: "text-pinyin", text: "重庆", options: { tone: "symbol", separator: " ", uppercase: false, surname: false } })).result, "chóng qìng");
  const table = await run({ action: "table-convert", text: "id,name\n001,Eason", options: { input: "csv", output: "json", header: true, safeFormulae: true, bom: false } });
  assert.deepEqual(JSON.parse(table.result.text), [{ id: "001", name: "Eason" }]);
  assert.match((await run({ action: "images-pdf", files: [], options: { page: "a4", orientation: "auto", margin: 10, dpi: 96, format: "jpeg", quality: 0.92, edge: 0 } })).error, /1–200/);
  const packed = await run({ action: "zip-pack", entries: [{ name: "中文.txt", data: new TextEncoder().encode("测试😀") }] });
  assert.equal(packed.transferCount, 1);
  assert.equal((await run({ action: "zip-inspect", data: packed.result })).result[0].name, "中文.txt");
  const extracted = await run({ action: "zip-extract", data: packed.result });
  assert.equal(extracted.transferCount, 1);
  assert.equal(new TextDecoder().decode(extracted.result["中文.txt"]), "测试😀");
  const doc = await PDFDocument.create(); doc.addPage([321, 456]);
  const bytes = await doc.save();
  assert.equal((await run({ action: "pdf-inspect", data: bytes })).result[0].width, 321);
  const choices = [{ source: 0, page: 0, rotation: 90 }, { source: 0, page: 0, rotation: 0 }];
  const built = await run({ action: "pdf-build", sources: [bytes], choices });
  assert.equal(built.transferCount, 1);
  assert.equal((await PDFDocument.load(built.result)).getPageCount(), 2);
  const split = await run({ action: "pdf-split", sources: [bytes], choices });
  const entries = unzipSync(split.result);
  assert.equal((await PDFDocument.load(entries["page-001.pdf"])).getPage(0).getRotation().angle, 90);
  assert.equal((await PDFDocument.load(entries["page-002.pdf"])).getPage(0).getRotation().angle, 0);
  const serializedFile = { name: "page.pdf", bytes, type: "application/pdf" };
  assert.equal((await run({ action: "pdf-page-info", serializedFile })).result[0].displayWidth, 321);
  const numbered = await run({ action: "pdf-number", serializedFile, options: { range: "1", template: "{n}/{total}", start: 1, position: "bottom-center", size: 12, margin: 10, color: "#333333", opacity: 100 } });
  assert.equal(numbered.error, undefined); assert.equal(numbered.result.changedPages, 1); assert.equal((await PDFDocument.load(await numbered.result.blob.arrayBuffer())).getPageCount(), 1);
  const chineseNumbered = await run({ action: "pdf-number", serializedFile, options: { range: "1", template: "第 {n} 页", start: 1, position: "bottom-center", size: 12, margin: 10, color: "#333333", opacity: 100 } });
  assert.equal(chineseNumbered.error, undefined); assert.ok(chineseNumbered.result.blob.size > 1000); assert.ok(chineseNumbered.result.blob.size < 1_000_000);
  const cropped = await run({ action: "pdf-crop", serializedFile, options: { range: "", margins: { top: 5, right: 5, bottom: 5, left: 5 } } });
  assert.equal(cropped.error, undefined); assert.equal((await PDFDocument.load(await cropped.result.blob.arrayBuffer())).getPage(0).getCropBox().width, 288.9);
  const pptx = await run({ action: "pptx-extract", serializedFile: { name: "test.pptx", bytes: zipSync(pptxParts()) } });
  assert.equal(pptx.error, undefined); assert.equal(pptx.result.slides, 2); assert.equal(pptx.result.images.length, 2); assert.match(pptx.result.text, /中文 & first/);
  assert.match((await run({ action: "image-color-sample", serializedFile: { name: "a.png", bytes: new Uint8Array([1]) }, x: 0, y: 0 })).error, /后台画布/);
  assert.match((await run({ action: "pdf-build", sources: [bytes], choices: [] })).error, /2000/);
  assert.match((await run({ action: "unknown" })).error, /不支持/);
});
