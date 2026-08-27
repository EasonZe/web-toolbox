import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function loadTs(file, imports = {}) {
  const source = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => imports[name] ?? require(name), Uint8Array, Date, DOMException });
  return exports;
}
const helpers = await loadTs("lib/file-hash.ts");
const { calculateFileHashes, hashChunkSize } = await loadTs("lib/file-hash-engine.ts", { "./file-hash": helpers });
const { hashAlgorithms, compareFileHash } = helpers;
const expected = (algorithm, data) => createHash(algorithm.toLowerCase().replace("-", "")).update(data).digest("hex");

for (const [name, data] of [["空文件", Buffer.alloc(0)], ["标准abc向量", Buffer.from("abc")], ["中文与二进制", Buffer.concat([Buffer.from("文件哈希测试\n"), Buffer.from([0, 255, 128, 13, 10])])]]) {
  test(`四种算法正确计算${name}`, async () => {
    const results = await calculateFileHashes(new Blob([data]), hashAlgorithms);
    for (const algorithm of hashAlgorithms) assert.equal(results[algorithm], expected(algorithm, data));
  });
}

test("大文件仅分块读取一次，跨块结果正确并报告进度", async () => {
  const data = Buffer.alloc(hashChunkSize * 2 + 17);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 17) % 256;
  const file = new Blob([data]);
  const reads = [];
  const chunksOnly = { size: file.size, slice(start, end) { reads.push([start, end]); return file.slice(start, end); }, arrayBuffer() { throw new Error("禁止整文件读入"); } };
  const progress = [];
  const results = await calculateFileHashes(chunksOnly, hashAlgorithms, (loaded, total) => progress.push([loaded, total]));
  assert.equal(reads.length, 3);
  assert.ok(reads.every(([start, end]) => end - start <= hashChunkSize));
  assert.deepEqual(progress[0], [0, data.length]);
  assert.deepEqual(progress.at(-1), [data.length, data.length]);
  assert.ok(progress.every(([loaded], i) => !i || loaded >= progress[i - 1][0]));
  for (const algorithm of hashAlgorithms) assert.equal(results[algorithm], expected(algorithm, data));
});

test("只计算所选算法，去重且拒绝空选或非法算法", async () => {
  const file = new Blob(["abc"]);
  const results = await calculateFileHashes(file, ["SHA-256", "SHA-256"]);
  assert.deepEqual(Object.keys(results), ["SHA-256"]);
  await assert.rejects(calculateFileHashes(file, []), /至少选择/);
  await assert.rejects(calculateFileHashes(file, ["SHA-999"]), /至少选择/);
});

test("取消计算和文件读取错误不会返回不完整的哈希值", async () => {
  const controller = new AbortController();
  const file = new Blob([Buffer.alloc(hashChunkSize + 1)]);
  await assert.rejects(calculateFileHashes(file, ["MD5"], (loaded) => { if (loaded) controller.abort(); }, controller.signal), { name: "AbortError" });
  await assert.rejects(calculateFileHashes(file, ["MD5"], undefined, controller.signal), { name: "AbortError" });
  const unreadable = { size: 1, slice() { return { arrayBuffer() { throw new Error("read failed"); } }; } };
  await assert.rejects(calculateFileHashes(unreadable, ["MD5"]), /read failed/);
});

test("比对自动识别算法、忽略首尾空白及大小写，不把未计算误判为不一致", () => {
  for (const algorithm of hashAlgorithms) {
    const value = expected(algorithm, "abc");
    assert.equal(compareFileHash(`\n${value.toUpperCase()} `, { [algorithm]: value }).state, "match");
    assert.equal(compareFileHash("0".repeat(value.length), { [algorithm]: value }).state, "mismatch");
    assert.equal(compareFileHash(value, {}).state, "pending");
  }
  assert.equal(compareFileHash("", {}).state, "empty");
  for (const invalid of ["abc", "x".repeat(32), " ".repeat(32), "a".repeat(63)]) {
    assert.notEqual(compareFileHash(invalid, {}).state, "match");
  }
});
