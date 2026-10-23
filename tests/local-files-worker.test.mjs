import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";

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
    globalThis.self = { postMessage(data, transfer) {
      parentPort.postMessage({ ...data, transferCount: transfer?.length ?? 0 }, transfer);
    } };
    import(${JSON.stringify(entry.href)}).then(() => {
      parentPort.on("message", (data) => self.onmessage({ data }));
      parentPort.postMessage({ ready: true });
    }).catch((error) => { throw error; });
  `, { eval: true });
  t.after(() => worker.terminate());
  assert.equal((await once(worker, "message"))[0].ready, true);
  async function run(data) {
    const message = once(worker, "message"); worker.postMessage(data);
    return (await message)[0];
  }
  const json = await run({ action: "json-format", text: '{"id":9007199254740993123}', compact: true });
  assert.equal(json.result.output, '{"id":9007199254740993123}');
  assert.equal((await run({ action: "text-diff", left: "old\n", right: "new\n" })).result[0].kind, "changed");
  assert.equal((await run({ action: "text-codec", text: "5Lit5paH8J+YgA==", mode: "base64", direction: "decode" })).result, "中文😀");
  assert.match((await run({ action: "text-codec", text: "%XX", mode: "url", direction: "decode" })).error, /URL/);
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
  assert.match((await run({ action: "pdf-build", sources: [bytes], choices: [] })).error, /2000/);
  assert.match((await run({ action: "unknown" })).error, /不支持/);
});
