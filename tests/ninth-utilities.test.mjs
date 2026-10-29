import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { makeGif } from "./helpers/ninth-fixtures.mjs";
const { processXml } = loadLocalModule("app/lib/xml-formatter.ts");
const { inspectGifBytes, inspectGif, extractGif, compositeGifPatch } = loadLocalModule("app/lib/gif-extract.ts");
const { auditProject } = await import("../scripts/project-integrity.mjs");
const signal = () => new AbortController().signal;
const xml = (text, mode = "format", indent = 2, reflow = false) => processXml(text, { mode, indent, reflow });
function xmlContent(text) {
  const parser = new SaxesParser({ xmlns: true }), content = []; let depth = 0;
  parser.on("opentag", () => depth++); parser.on("closetag", () => depth--);
  parser.on("text", (value) => { if (depth) content.push(value); }); parser.on("cdata", (value) => content.push(value)); parser.write(text).close(); return content.join("");
}
test("XML 格式化与仅校验支持命名空间、实体、注释和属性", async () => {
  const source = '<?xml version="1.0" encoding="UTF-8"?><r xmlns="urn:test"><item id="001">中文 &amp; 😀</item><!--comment--><empty /></r>';
  const result = await xml(source, "format", 2, true); assert.equal(result.elements, 3); assert.equal(result.attributes, 2); assert.equal(result.depth, 2);
  assert.match(result.output, /\n  <item/); assert.match(result.output, /<!--comment-->/); assert.match(result.output, /中文 &amp; 😀/);
  assert.match((await xml(source, "format", 4, true)).output, /\n    <item/);
  assert.equal((await xml(source, "validate")).output, source); assert.equal((await xml(source, "validate")).changed, false);
  assert.equal(xmlContent((await xml(source)).output), xmlContent(source));
});
test("XML 默认严格保留混合文本、多行文本、CDATA、xml:space 与前后空格", async () => {
  for (const source of ["<p>  hello <b>world</b> !  </p>", "<p>hello\n<b>world</b> !</p>", "<p> \n  hello\n </p>", '<r xml:space="preserve"> \n <e/>  </r>', "<r><![CDATA[ <tag> \n & xxx ]]><e/> end</r>", "<r> before<!-- x -->after </r>"]) {
    assert.equal(xmlContent((await xml(source)).output), xmlContent(source), source);
  }
});
test("XML 错误行列、多个根、命名空间、重复属性、非法字符和未知实体", async () => {
  for (const source of ["<r>\n <a></b>\n</r>", "<r/><e/>", '<r a="1" a="2"/>', "<x:r/>", "<r>&unknown;</r>", "<r>\u0000</r>", "<r>\ud800</r>", "<r>&#0;</r>"]) await assert.rejects(xml(source), /XML 第 \d+ 行，第 \d+ 列/);
  await assert.rejects(xml("<r>\n <a></b>\n</r>"), /第 2 行/);
});
test("XML 拒绝 DTD / XXE / 实体扩展，只把脚本和样式处理指令作为文本", async () => {
  for (const source of ['<!DOCTYPE r SYSTEM "https://example.test/private"><r/>', '<!DOCTYPE r [<!ENTITY x "boom">]><r>&x;</r>']) await assert.rejects(xml(source), /DTD/);
  const source = '<?xml-stylesheet href="https://example.test/a.xsl"?><r><script>alert(1)</script></r>';
  assert.match((await xml(source)).output, /href="https:\/\/example.test\/a.xsl"/);
  assert.match((await xml('<r><!-- <!DOCTYPE r> --><![CDATA[<!DOCTYPE r>]]></r>')).output, /CDATA/);
});
test("XML 结构预算、字符、参数、编码与原型同名属性正确处理", async () => {
  await assert.rejects(xml("<r>".repeat(101) + "</r>".repeat(101)), /100 层/);
  await assert.rejects(xml(" ".repeat(5_000_001) + "<r/>"), /500 万/);
  await assert.rejects(xml("<r>" + "<a/>".repeat(250_000) + "</r>"), /25 万/);
  await assert.rejects(xml(""), /请输入/); await assert.rejects(xml("<r/>", "unknown"), /参数/); await assert.rejects(xml("<r/>", "format", 3), /参数/);
  await assert.rejects(xml('<?xml version="1.0" encoding="UTF-16"?><r/>'), /UTF-8/);
  const prototype = '<r __proto__="keep" constructor="safe"/>';
  assert.equal((await xml(prototype, "validate")).output, prototype); assert.match((await xml(prototype)).output, /__proto__="keep"/); assert.equal(Object.prototype.keep, undefined);
});

test("GIF 块预检读取原始零延迟、局部尺寸与注释/应用扩展间的控制块", async () => {
  const bytes = makeGif([{ pixels: [1, 1, 1], delay: 0 }, { pixels: [2], left: 1, delay: 30, dispose: 3, comment: true, application: true }]);
  const result = inspectGifBytes(bytes); assert.equal(result.width, 3); assert.equal(result.frames.length, 2); assert.equal(result.duration, 30); assert.equal(result.frames[1].disposal, 3); assert.equal(result.frames[1].left, 1);
  assert.deepEqual(await inspectGif(new File([bytes], "pretend.txt"), signal()), { width: 3, height: 1, frames: 2, duration: 30 });
  const prefixed = new Uint8Array(bytes.length + 7); prefixed.set(bytes, 7); assert.equal(inspectGifBytes(prefixed.subarray(7)).frames.length, 2);
});
test("GIF 拒绝截断、额外数据、无效尺寸、越界、未知/纯文本扩展和无色表", () => {
  const valid = makeGif([{ pixels: [1, 1, 1] }]);
  for (let size = 0; size < valid.length; size++) assert.throws(() => inspectGifBytes(valid.slice(0, size)));
  assert.throws(() => inspectGifBytes(new Uint8Array([...valid, 0])), /额外/);
  for (const dimensions of [{ width: 0 }, { width: 8193 }]) assert.throws(() => inspectGifBytes(makeGif([{ pixels: [1, 1, 1] }], dimensions)), /画布/);
  assert.throws(() => inspectGifBytes(makeGif([{ pixels: [1, 1], left: 2 }])), /超出/);
  const info = inspectGifBytes(valid), control = info.frames[0].start - 8;
  const extension = valid.slice(); extension[control + 1] = 0x01; assert.throws(() => inspectGifBytes(extension), /扩展/);
  const mode = valid.slice(); mode[control + 3] = 16; assert.throws(() => inspectGifBytes(mode), /控制/);
  const input = valid.slice(); input[control + 3] |= 2; assert.throws(() => inspectGifBytes(input), /用户输入/);
  const lzw = valid.slice(); const colorBytes = 3 * 2 ** ((lzw[info.frames[0].start + 9] & 7) + 1); lzw[info.frames[0].start + 10 + colorBytes] = 12; assert.throws(() => inspectGifBytes(lzw), /LZW/);
});
test("GIF 合成透明像素不覆盖已有画面，输入 patch 不变，非法边界被拒绝", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), patch = new Uint8ClampedArray([0, 0, 255, 0]);
  compositeGifPatch(pixels, 2, { left: 1, top: 0, width: 1, height: 1 }, patch); assert.deepEqual([...pixels], [255, 0, 0, 255, 0, 255, 0, 255]); assert.deepEqual([...patch], [0, 0, 255, 0]);
  assert.throws(() => compositeGifPatch(pixels, 2, { left: 2, top: 0, width: 1, height: 1 }, patch), /边界/);
});

async function withCanvas(run, mode = {}) {
  const saved = ["OffscreenCanvas", "ImageData", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]), canvases = [];
  class Canvas {
    constructor(w, h) { this.inner = createCanvas(w, h); this.w = w; this.h = h; canvases.push(this); }
    get width() { return this.w; } set width(v) { this.w = v; }
    get height() { return this.h; } set height(v) { this.h = v; }
    getContext() { return mode.contextFailure ? null : this.inner.getContext("2d"); }
    async convertToBlob() { if (mode.encodeFailure) throw new Error("encode failed"); mode.onEncode?.(); return mode.overBudget ? { size: 256 * 1024 * 1024 + 1 } : new Blob([this.inner.toBuffer("image/png")], { type: "image/png" }); }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: Canvas }); Object.defineProperty(globalThis, "ImageData", { configurable: true, value: ImageData });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: mode.mobile ? "iPhone" : "Node", platform: "", maxTouchPoints: 0 } });
  try { await run(canvases); } finally { for (const [key, value] of saved) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
}
const raw = async (blob) => [...await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer()];
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0];
test("真实 PNG 验证 GIF 保留/恢复背景/恢复前帧、局部矩形、色表与 ZIP 延迟清单", async () => withCanvas(async (canvases) => {
  const bytes = makeGif([{ pixels: [1, 1, 1], delay: 0 }, { pixels: [2], left: 1, dispose: 3, delay: 20, comment: true, application: true }, { pixels: [3], left: 2, dispose: 2, delay: 30 }, { pixels: [2], left: 0 }]);
  const result = await extractGif(new File([bytes], "test.gif"), { start: 1, end: 4, step: 1, background: "transparent" }, signal());
  assert.deepEqual(await raw(result.images[0].blob), [...red, ...red, ...red]);
  assert.deepEqual(await raw(result.images[1].blob), [...red, ...green, ...red]);
  assert.deepEqual(await raw(result.images[2].blob), [...red, ...red, 255, 255, 0, 255]);
  assert.deepEqual(await raw(result.images[3].blob), [...green, ...red, ...clear]);
  const zip = unzipSync(new Uint8Array(await result.zip.arrayBuffer())); assert.equal(Object.keys(zip).length, 5);
  const manifest = JSON.parse(new TextDecoder().decode(zip["frames.json"])); assert.deepEqual(manifest.images.map((x) => x.delayMs), [0, 20, 30, 0]);
  assert.deepEqual(zip["frame-0002.png"], new Uint8Array(await result.images[1].blob.arrayBuffer()));
  assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
}));
test("GIF 从第一帧还原再跳帧导出、透明像素、文件背景和局部色表", async () => withCanvas(async () => {
  const file = new File([makeGif([{ pixels: [1], dispose: 2 }, { pixels: [2], left: 1, transparent: 2 }, { pixels: [1], left: 2, palette: [[0, 0, 255], [0, 255, 0]] }])], "test.gif");
  const transparent = await extractGif(file, { start: 2, end: 3, step: 1, background: "transparent" }, signal());
  assert.deepEqual(await raw(transparent.images[0].blob), [...clear, ...clear, ...clear]); assert.deepEqual(await raw(transparent.images[1].blob), [...clear, ...clear, ...green]);
  const colored = await extractGif(file, { start: 2, end: 3, step: 2, background: "file" }, signal());
  assert.equal(colored.images.length, 1); assert.equal(colored.images[0].frame, 2); assert.deepEqual(await raw(colored.images[0].blob), [...blue, ...blue, ...blue]);
}));
test("GIF 交错帧与 GIF87a 无控制块按完整画布还原，标称延迟仍为0", async () => withCanvas(async () => {
  const interlaced = new File([makeGif([{ pixels: [1, 3, 2, 0], width: 1, height: 4, interlaced: true }], { width: 1, height: 4 })], "interlaced.gif");
  const options = { start: 1, end: 1, step: 1, background: "transparent" };
  assert.deepEqual(await raw((await extractGif(interlaced, options, signal())).images[0].blob), [...red, ...green, 255, 255, 0, 255, ...blue]);
  const bytes = makeGif([{ pixels: [1, 1, 1] }]), info = inspectGifBytes(bytes), control = info.frames[0].start - 8;
  const old = new Uint8Array([...bytes.subarray(0, control), ...bytes.subarray(control + 8)]); old.set(new TextEncoder().encode("GIF87a"));
  const result = await extractGif(new File([old], "old.gif"), options, signal()); assert.equal(result.images[0].delay, 0); assert.deepEqual(await raw(result.images[0].blob), [...red, ...red, ...red]);
}));
test("GIF 超量帧、导出数量、字节上限在解码前拒绝，输出预算在打包前停止", async () => {
  const frames = (count) => Array.from({ length: count }, () => ({ pixels: [1] }));
  const bytes = makeGif(frames(201)), options = { start: 1, end: 201, step: 1, background: "transparent" };
  await assert.rejects(extractGif(new File([bytes], "many.gif"), options, signal()), /200 帧/);
  assert.throws(() => inspectGifBytes(makeGif(frames(2001))), /2000 帧/);
  await assert.rejects(inspectGif({ name: "huge.gif", size: 100 * 1024 * 1024 + 1, arrayBuffer() { throw new Error("不应读取"); } }, signal()), /100 MB/);
  await withCanvas(async (canvases) => { await assert.rejects(extractGif(new File([makeGif(frames(1))], "single.gif"), { ...options, end: 1 }, signal()), /输出预算/); assert.equal(canvases[0].width, 0); }, { overBudget: true });
});
test("GIF 预检/编码失败/取消均释放画布，不回传半成品；参数与设备预算有保护", async () => {
  const file = new File([makeGif([{ pixels: [1, 1, 1] }])], "test.gif"), options = { start: 1, end: 1, step: 1, background: "transparent" };
  for (const next of [{ start: 0 }, { end: 2 }, { step: 0 }, { start: NaN }, { background: "other" }]) await assert.rejects(extractGif(file, { ...options, ...next }, signal()), /参数|设置/);
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(inspectGif(file, cancelled.signal));
  for (const mode of [{ encodeFailure: true }, { contextFailure: true }]) await withCanvas(async (canvases) => { await assert.rejects(extractGif(file, options, signal())); assert.ok(canvases.every((item) => item.width === 0 && item.height === 0)); }, mode);
  const cancel = new AbortController(); await withCanvas(async (canvases) => { await assert.rejects(extractGif(file, options, cancel.signal)); assert.equal(canvases[0].width, 0); }, { onEncode: () => cancel.abort() });
  const huge = new File([makeGif([{ pixels: [1] }, { pixels: [1] }], { width: 8000, height: 8000 })], "large.gif");
  await withCanvas(async () => { await assert.rejects(extractGif(huge, { ...options, end: 2 }, signal()), /工作空间|组合过大/); }, { mobile: true });
});
test("两个新工具路由分类与站点地图一致，原始许可证随分发保留", async () => {
  const result = await auditProject(fileURLToPath(new URL("../", import.meta.url))); assert.deepEqual([...result.dependencies.failures, ...result.catalog.failures], []);
  const catalog = await readFile(new URL("../app/components/tool-search-grid.tsx", import.meta.url), "utf8"); for (const route of ["gif-extract", "xml-formatter"]) assert.ok(catalog.includes(`href: "/${route}"`));
  for (const [name, license] of [["gifuct-js", "LICENSE"], ["js-binary-schema-parser", "LICENSE"], ["prettier", "LICENSE"], ["@prettier/plugin-xml", "LICENSE"], ["@xml-tools/parser", "LICENSE"], ["chevrotain", "LICENSE.txt"], ["regexp-to-ast", "LICENSE"], ["hash-wasm", "LICENSE"]]) assert.equal(await readFile(new URL(`../public/vendor-licenses/${name.replaceAll("/", "-")}.txt`, import.meta.url), "utf8"), await readFile(new URL(`../node_modules/${name}/${license}`, import.meta.url), "utf8"));
  assert.equal(await readFile(new URL("../public/vendor-licenses/prettier-THIRD-PARTY-NOTICES.md", import.meta.url), "utf8"), await readFile(new URL("../node_modules/prettier/THIRD-PARTY-NOTICES.md", import.meta.url), "utf8"));
});
