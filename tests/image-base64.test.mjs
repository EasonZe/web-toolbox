import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(await readFile(new URL("../app/lib/image-base64.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load() {
  const exports = {}, images = [], revoked = [], timers = new Map();
  let next = 0;
  class MockImage {
    naturalWidth = 32; naturalHeight = 24;
    constructor() { images.push(this); }
    set src(value) { this.url = value; }
  }
  vm.runInNewContext(source, {
    exports, atob, btoa, Blob, Uint8Array, DataView, DOMException, Image: MockImage,
    URL: { createObjectURL() { return `blob:test-${++next}`; }, revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(callback) { const id = ++next; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...exports, images, revoked, timers };
}
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 254, 1]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("图片Base64按字节往返，兼容Data URL、纯编码、空白、URL安全字符和省略填充", () => {
  const lib = load(), encoded = lib.encodeImageBytes(png);
  for (const input of [encoded, lib.formatImageBase64(encoded, "image/png", "data-url"), encoded.replace(/.{4}/g, "$&\n "), encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), `DATA:IMAGE/PNG;charset=utf-8;BASE64,${encoded}`]) {
    const output = lib.decodeImageBase64(input);
    assert.equal(output.mime, "image/png");
    assert.deepEqual(output.bytes, png);
  }
  assert.equal(lib.formatImageBase64(encoded, "image/png", "raw"), encoded);
});

test("图片格式识别使用文件签名而不是文件扩展名", () => {
  const lib = load();
  const samples = [
    [png, "image/png"], [Uint8Array.from([255, 216, 255, 1]), "image/jpeg"],
    [Buffer.from("GIF89a123"), "image/gif"], [Buffer.from("RIFF1234WEBP"), "image/webp"],
    [Buffer.concat([Buffer.from("BM"), Buffer.alloc(24)]), "image/bmp"],
    [Uint8Array.from([0, 0, 1, 0, 1, 0, ...Array(16).fill(0)]), "image/x-icon"],
    [Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypavif"), 0, 0, 0, 0, ...Buffer.from("avifmif1")]), "image/avif"],
  ];
  for (const [bytes, mime] of samples) {
    assert.equal(lib.detectImageMime(bytes), mime);
    const decoded = lib.decodeImageBase64(lib.encodeImageBytes(bytes));
    assert.equal(decoded.mime, mime);
    assert.deepEqual(Buffer.from(decoded.bytes), Buffer.from(bytes));
    assert.match(lib.imageDownloadName(mime), /^还原图片\./);
  }
  assert.equal(lib.decodeImageBase64(`data:image/jpg;base64,${btoa("\xff\xd8\xff")}`).mime, "image/jpeg");
});

test("拒绝空内容、损坏编码、伪装格式、网址、HTML、SVG和超限图片", () => {
  const lib = load();
  for (const input of ["", "  ", "A", "A===", "AA=A", "AB==", "AA=", "@@@@", "https://example.com/a.png", "<img>", "data:image/png,abc", "data:text/html;base64,PGI+", btoa("<svg></svg>"), `data:image/jpeg;base64,${btoa(String.fromCharCode(...png))}`]) assert.throws(() => lib.decodeImageBase64(input), undefined, input);
  assert.throws(() => lib.validateImageSize(0), /为空/);
  assert.throws(() => lib.validateImageSize(lib.maxBase64ImageBytes + 1), /10 MB/);
  assert.throws(() => lib.decodeImageBase64("A".repeat(Math.ceil((lib.maxBase64ImageBytes + 3) / 3) * 4)), /10 MB/);
  assert.throws(() => lib.decodeImageBase64("A".repeat(lib.maxBase64InputChars + 1)), /编码过长/);
});

test("完成图片解码检查后才提供结果，保留图片原始字节", async () => {
  const lib = load();
  const file = new File([png], "not-really-jpeg.jpg", { type: "image/jpeg" });
  const encoded = lib.imageFileToBase64(file, new AbortController().signal);
  await tick(); lib.images[0].onload();
  const output = await encoded;
  assert.equal(output.mime, "image/png"); assert.equal(output.width, 32); assert.equal(output.height, 24);
  assert.deepEqual(Buffer.from(await output.blob.arrayBuffer()), Buffer.from(png));
  const decoded = lib.base64ToImage(output.base64, new AbortController().signal);
  lib.images[1].onload();
  assert.deepEqual(Buffer.from(await (await decoded).blob.arrayBuffer()), Buffer.from(png));
  assert.equal(lib.revoked.length, 2); assert.equal(lib.timers.size, 0);
});

test("图片损坏、像素超限、取消与超时均清理预览和计时器", async () => {
  const lib = load(), blob = new Blob([png]);
  const broken = lib.inspectImageBlob(blob, new AbortController().signal);
  lib.images.at(-1).onerror(); await assert.rejects(broken, /损坏/);
  const huge = lib.inspectImageBlob(blob, new AbortController().signal);
  lib.images.at(-1).naturalWidth = 100000; lib.images.at(-1).naturalHeight = 100000;
  lib.images.at(-1).onload(); await assert.rejects(huge, /4000万/);
  const controller = new AbortController();
  const cancelled = lib.inspectImageBlob(blob, controller.signal); controller.abort(); await assert.rejects(cancelled, { name: "AbortError" });
  const timeout = lib.inspectImageBlob(blob, new AbortController().signal);
  [...lib.timers.values()][0](); await assert.rejects(timeout, /超时/);
  assert.equal(lib.revoked.length, 4); assert.equal(lib.timers.size, 0);
  for (const image of lib.images) { assert.equal(image.onload, null); assert.equal(image.onerror, null); assert.equal(image.url, ""); }
  assert.throws(() => lib.inspectImageBlob(blob, controller.signal), { name: "AbortError" });
});
