import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { extractJsonPointers, normalizePointer } = loadLocalModule("app/lib/json-pointer.ts");
const { digestText, compareTextDigest } = loadLocalModule("app/lib/text-digest.ts");
const { easingPresets, inspectEasing } = loadLocalModule("app/lib/easing-curve.ts");
const { auditProject } = await import("../scripts/project-integrity.mjs");
const options = { algorithm: "SHA-256", mode: "hash", encoding: "utf8", key: "", keyEncoding: "utf8" };
const signal = () => new AbortController().signal;
const query = (value, paths) => JSON.parse(extractJsonPointers(JSON.stringify(value), paths).output);

test("JSON Pointer 按 RFC6901 处理对象、数组、空键、斜杠和波浪号转义", () => {
  const data = { foo: ["bar", "baz"], "": 0, "a/b": 1, "m~n": 8, "~1": 9, "a b": true, "a\nb": "newline", "%": 10 };
  const rows = query(data, "/foo/0\n/\n/a~1b\n/m~0n\n/~01\n#/a%20b\n#/a%0Ab\n/%");
  assert.deepEqual(rows.map((row) => row.value), ["bar", 0, 1, 8, 9, true, "newline", 10]);
  assert.equal(normalizePointer("#%2Ffoo%2F0"), "/foo/0");
  assert.equal(normalizePointer("/a%20b"), "/a%20b", "plain pointers are not URL-decoded");
});

test("JSON 原文切片保留长整数、-0 与指数写法，不以浮点 stringify 重写值", () => {
  const result = extractJsonPointers('{"big":9007199254740993123,"negative":-0,"exp":1.00e2}', "/big\n/negative\n/exp");
  assert.match(result.output, /"value":9007199254740993123/);
  assert.match(result.output, /"value":-0/); assert.match(result.output, /"value":1\.00e2/);
  assert.equal(result.matched, 3);
});

test("JSON 区分缺失与 null/false/0，根文档支持标量和数组，保留路径空格与重复项", () => {
  assert.deepEqual(query({ nil: null, off: false, zero: 0 }, "/nil\n/off\n/zero\n/missing"), [
    { pointer: "/nil", found: true, value: null }, { pointer: "/off", found: true, value: false }, { pointer: "/zero", found: true, value: 0 }, { pointer: "/missing", found: false },
  ]);
  for (const value of [null, false, 0, "text", [1]]) assert.deepEqual(query(value, "#")[0].value, value);
  assert.deepEqual(query({ " a ": 2 }, "/ a \n\n/ a ").map((row) => row.value), [2, 2]);
  assert.equal(query({ a: "text" }, "/a/length")[0].found, false);
});

test("JSON 路径只读自有字段，不读取原型，合法同名字段仍可提取", () => {
  for (const pointer of ["/constructor", "/toString", "/__proto__", "/__proto__/polluted"]) assert.equal(query({}, pointer)[0].found, false);
  assert.equal(JSON.parse(extractJsonPointers('{"__proto__":{"safe":3},"constructor":4}', "/__proto__/safe\n/constructor").output)[0].value, 3);
  assert.equal(Object.prototype.polluted, undefined);
});

test("JSON 路径拒绝非法转义、脚本查询和非规范数组索引，超界索引标为缺失", () => {
  for (const path of ["foo", "$..foo", "/a~", "/a~2", "#/%GG", "#/%FF"]) assert.throws(() => extractJsonPointers("{}", path));
  for (const path of ["/01", "/-", "/-1", "/1.0", "/length", "/0x0"]) assert.throws(() => extractJsonPointers("[1]", path), /数组索引/);
  assert.equal(query([1], "/999999999999999999999999999")[0].found, false);
  assert.equal(query({ "01": 2 }, "/01")[0].value, 2);
});

test("JSON 严格语法、重复键与100层保护，不把不完整输入当成功", () => {
  for (const value of ["", "{", "[1,]", '{"a":1,}', "/* hi */{}", "undefined"]) assert.throws(() => extractJsonPointers(value, "#"));
  for (const value of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}']) assert.throws(() => extractJsonPointers(value, "#"), /重复字段/);
  assert.throws(() => extractJsonPointers("[".repeat(101) + "0" + "]".repeat(101), "#"), /100/);
  assert.equal(extractJsonPointers("[".repeat(100) + "0" + "]".repeat(100), "#").matched, 1);
});

test("JSON 批量路径、字符、节点与输出预算保护，不截断结果", () => {
  assert.equal(extractJsonPointers("{}", Array(200).fill("#").join("\n")).total, 200);
  assert.throws(() => extractJsonPointers("{}", Array(201).fill("#").join("\n")), /200/);
  assert.throws(() => extractJsonPointers("{}", "x".repeat(32769)), /32768/);
  assert.throws(() => extractJsonPointers(" ".repeat(5_000_001), "#"));
  assert.throws(() => extractJsonPointers(JSON.stringify(Array(250001).fill(0)), "#"), /25 万/);
  assert.throws(() => extractJsonPointers(JSON.stringify("a".repeat(800000)), Array(41).fill("#").join("\n")), /3200 万/);
});

test("SHA2 文本摘要与 Node crypto 一致，空内容、中文、UTF-8与Hex均参与实际计算", async () => {
  for (const algorithm of ["SHA-256", "SHA-384", "SHA-512"]) for (const text of ["", "abc", "中文😀\r\n "]) {
    const result = await digestText(text, { ...options, algorithm }, signal());
    const expected = createHash(algorithm.replace("-", "").toLowerCase()).update(text).digest();
    assert.equal(result.hex, expected.toString("hex")); assert.equal(result.base64, expected.toString("base64")); assert.equal(result.bytes, Buffer.byteLength(text));
  }
  assert.equal((await digestText("61 62\n63", { ...options, encoding: "hex" }, signal())).hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("HMAC 使用 RFC4231 SHA256 向量，Hex/UTF-8密钥及其他SHA2与独立API对照", async () => {
  const result = await digestText("Hi There", { ...options, mode: "hmac", key: "0b".repeat(20), keyEncoding: "hex" }, signal());
  assert.equal(result.hex, "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  for (const algorithm of ["SHA-256", "SHA-384", "SHA-512"]) {
    const digest = await digestText("中文😀", { ...options, algorithm, mode: "hmac", key: "密钥" }, signal());
    assert.equal(digest.hex, createHmac(algorithm.replace("-", "").toLowerCase(), "密钥").update("中文😀").digest("hex"));
  }
});

test("摘要保留空格换行和Unicode组合形式，非法编码/密钥/算法给出错误", async () => {
  const hashes = await Promise.all(["a", "a ", "a\n", "a\r\n", "é", "e\u0301"].map((text) => digestText(text, options, signal())));
  assert.equal(new Set(hashes.map((item) => item.hex)).size, 6);
  for (const text of ["0", "0x61", "GG", "61-62"]) await assert.rejects(digestText(text, { ...options, encoding: "hex" }, signal()), /Hex/);
  for (const text of ["\ud800", "\udc00", "\ud800x"]) await assert.rejects(digestText(text, options, signal()), /Unicode/);
  await assert.rejects(digestText("a", { ...options, algorithm: "SHA-1" }, signal()), /算法/);
  await assert.rejects(digestText("a", { ...options, mode: "hmac" }, signal()), /不能为空/);
  await assert.rejects(digestText("a", { ...options, mode: "hmac", key: "a".repeat(65537) }, signal()), /64 KiB/);
  await assert.rejects(digestText("a".repeat(2_000_001), options, signal()), /200 万/);
});

test("摘要核对允许Hex大小写和首尾空白，拒绝不完整摘要", () => {
  assert.equal(compareTextDigest("", "abcd"), ""); assert.equal(compareTextDigest(" ABCD ", "abcd"), "摘要一致。");
  assert.match(compareTextDigest("abce", "abcd"), /不一致/); assert.match(compareTextDigest("abc", "abcd"), /完整 Hex/); assert.match(compareTextDigest("abcd==", "abcd"), /完整 Hex/);
});

test("Web Crypto不可用、预取消及原生任务迟到完成不产生结果，字节缓冲收尾清零", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"); let resolve, captured;
  const controller = new AbortController();
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
    await assert.rejects(digestText("abc", options, signal()), /Web Crypto/);
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { subtle: { digest: (_algorithm, data) => { captured = data; return new Promise((done) => { resolve = done; }); } } } });
    const result = digestText("abc", options, controller.signal); controller.abort(); resolve(new ArrayBuffer(32));
    await assert.rejects(result, { name: "AbortError" }); assert.ok(captured.every((value) => value === 0));
    await assert.rejects(digestText("abc", options, controller.signal), { name: "AbortError" });
  } finally { if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor); else delete globalThis.crypto; }
});

function reference(points, x) {
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lower = 0, upper = 1;
  for (let i = 0; i < 60; i++) { const t = (lower + upper) / 2; if (cubic(t, points[0], points[2]) < x) lower = t; else upper = t; }
  return cubic((lower + upper) / 2, points[1], points[3]);
}
test("贝塞尔预设和极端切线取样与独立二分解一致，保留端点与回弹", () => {
  for (const points of [...easingPresets.map((v) => v.points), [0, 1, 0, 0], [1, 0, 1, 1], [0.9, -2, 0.1, 3]]) {
    const result = inspectEasing(points, 1000);
    assert.equal(result.samples[0].progress, 0); assert.equal(result.samples.at(-1).progress, 1);
    for (const sample of result.samples) assert.ok(Math.abs(sample.progress - reference(points, sample.time)) < 0.00002);
    assert.match(result.css, /transition: transform 1000ms cubic-bezier/);
    assert.match(result.path, /^M /);
  }
  assert.ok(inspectEasing([0.1, 3, 0.2, 3], 500).samples.some((v) => v.progress > 1));
  for (const sample of inspectEasing([0, 0, 1, 1], 1000).samples) assert.ok(Math.abs(sample.progress - sample.time) < 1e-10);
});

test("贝塞尔校验有限范围和时长，曲线/导出使用相同四位精度而非注入CSS", () => {
  for (const points of [[-0.01, 0, 1, 1], [0, 0, 1.01, 1], [0, -2.01, 1, 1], [0, 0, 1, 3.01], [0, NaN, 1, 1], [0, Infinity, 1, 1], [0, 0, 1]]) assert.throws(() => inspectEasing(points, 1000));
  for (const duration of [0, 99, 10001, 100.5, NaN, Infinity]) assert.throws(() => inspectEasing([0, 0, 1, 1], duration));
  const result = inspectEasing([0.123456, -0, 0.9, 1], 100);
  assert.equal(result.easing, "cubic-bezier(0.1235, 0, 0.9, 1)");
  assert.ok(result.first.every(Number.isFinite)); assert.ok(result.second.every(Number.isFinite));
});

test("三个入口的分类/路径/站点地图一致，成熟依赖原始许可随构建分发", async () => {
  const audit = await auditProject(fileURLToPath(new URL("../", import.meta.url))); assert.deepEqual([...audit.dependencies.failures, ...audit.catalog.failures], []);
  const source = await readFile(new URL("../app/components/tool-search-grid.tsx", import.meta.url), "utf8");
  for (const name of ["json-pointer", "text-digest", "easing-curve"]) assert.ok(source.includes(`href: "/${name}"`));
  for (const [name, license] of [["jsonpointer", "LICENSE.md"], ["bezier-easing", "LICENSE"]]) {
    const original = await readFile(new URL(`../node_modules/${name}/${license}`, import.meta.url), "utf8");
    const published = await readFile(new URL(`../public/vendor-licenses/${name}.txt`, import.meta.url), "utf8"); assert.equal(published, original);
  }
});
