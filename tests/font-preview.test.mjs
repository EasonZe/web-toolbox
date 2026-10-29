import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const lib = loadLocalModule("app/lib/font-preview.ts");
const { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");
function bytes(format = "TTF", decoded = 64) {
  const array = new Uint8Array(format === "WOFF2" ? 48 : format === "WOFF" ? 64 : 64), view = new DataView(array.buffer);
  if (format === "TTF" || format === "OTF") { view.setUint32(0, format === "TTF" ? 0x00010000 : 0x4f54544f); view.setUint16(4, 1); }
  else { array.set(new TextEncoder().encode(format === "WOFF" ? "wOFF" : "wOF2")); view.setUint32(4, 0x00010000); view.setUint32(8, array.length); view.setUint16(12, 1); view.setUint32(16, decoded); }
  return array;
}
const font = (name = "font.ttf", format = "TTF", decoded) => new File([bytes(format, decoded)], name);
const signal = () => new AbortController().signal;
const tickUntil = async (check) => { for (let i = 0; i < 30 && !check(); i++) await Promise.resolve(); assert.ok(check()); };
function environment({ deferred = false, failAt = -1, addFailure = false } = {}) {
  const faces = [], added = [], removed = [], pending = [];
  const host = {
    createFace(family, buffer) {
      const index = faces.length, face = { family, buffer, async load() { if (index === failAt) throw new Error("font decode failed"); if (deferred) await new Promise((resolve) => pending.push(resolve)); return face; } };
      faces.push(face); return face;
    },
    add(face) { if (addFailure) throw new Error("font set failed"); added.push(face); }, remove(face) { removed.push(face); },
  };
  return { host, faces, added, removed, pending };
}

test("本地字体容器识别TTF/OTF/WOFF/WOFF2并核对真实项目OTF头，不凭扩展名", async () => {
  for (const format of ["TTF", "OTF", "WOFF", "WOFF2"]) {
    const array = bytes(format), result = lib.inspectFontHeader(array, { name: "chosen.font", size: array.length }); assert.equal(result.format, format); assert.equal(result.decodedBytes, 64);
  }
  const real = await readFile(new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url));
  const parsed = lib.inspectFontHeader(real.subarray(0, 48), { name: "regular.otf", size: real.length }); assert.equal(parsed.format, "OTF"); assert.equal(parsed.decodedBytes, real.length);
  const unknown = bytes(); unknown.set(new TextEncoder().encode("<svg")); assert.throws(() => lib.inspectFontHeader(unknown, { name: "fake.ttf", size: unknown.length }), /内容不是/);
  const collection = bytes(); collection.set(new TextEncoder().encode("ttcf")); assert.throws(() => lib.inspectFontHeader(collection, { name: "collection.ttf", size: collection.length }), /集合/);
});

test("字体头长度、表目录、WOFF声明原长、压缩集合与解压预算严格验证", () => {
  for (const mutate of [(view) => view.setUint32(8, 1), (view) => view.setUint16(14, 1), (view) => view.setUint16(12, 0), (view) => view.setUint32(16, 29), (view) => view.setUint32(4, 0x74746366)]) {
    const array = bytes("WOFF2"); mutate(new DataView(array.buffer)); assert.throws(() => lib.inspectFontHeader(array, { name: "bad.woff2", size: array.length }));
  }
  const bomb = bytes("WOFF2", toolLimits.fontPreview.decodedFileBytes + 4); assert.throws(() => lib.inspectFontHeader(bomb, { name: "bomb.woff2", size: bomb.length }), /解压数据/);
  const short = bytes(); new DataView(short.buffer).setUint16(4, 100); assert.throws(() => lib.inspectFontHeader(short, { name: "short.ttf", size: short.length }), /表目录/);
  assert.throws(() => lib.inspectFontHeader(new Uint8Array(4), { name: "short.otf", size: 4 }), /字体头/);
});

test("字体数量、文件字节、总原始字节和设备解压预算均明确拒绝，不偷截选择", () => {
  lib.validateFontFiles([font()]);
  for (const files of [[], Array(9).fill(font()), [new File(["bad"], "bad.svg")], [new File([], "empty.ttf")], [{ name: "large.ttf", size: toolLimits.fontPreview.fileBytes + 1 }], Array(3).fill({ name: "font.ttf", size: toolLimits.fontPreview.fileBytes })]) assert.throws(() => lib.validateFontFiles(files));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { deviceMemory: 2 } }); assert.equal(lib.fontDecodedBudget(), toolLimits.fontPreview.decodedBytes / 2);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { deviceMemory: 16, userAgent: "desktop", platform: "Win32" } }); assert.equal(lib.fontDecodedBudget(), toolLimits.fontPreview.decodedBytes);
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator; }
});

test("字体加载使用独立family和ArrayBuffer，批次顺序加载，释放只移除其拥有字体且幂等", async () => {
  const app = environment(), owner = lib.createFontPreviewSession(app.host), progress = [];
  const result = await owner.load([font("first.ttf"), font("second.otf", "OTF")], signal(), (value) => progress.push(value));
  assert.equal(app.faces.length, 2); assert.equal(app.added.length, 2); assert.equal(app.faces.every((face) => face.buffer instanceof ArrayBuffer), true);
  assert.notEqual(result[0].family, result[1].family); assert.match(result[0].family, /^toolbox-local-font-\d+$/); assert.equal(result[0].name, "first.ttf"); assert.deepEqual(progress, [50, 100]);
  owner.dispose(); owner.dispose(); assert.deepEqual(app.removed, app.added); await assert.rejects(owner.load([font()], signal()), /会话已结束/);
});

test("加载失败、注册失败或解压总预算超限会回滚，不遗留部分成功字体", async () => {
  for (const config of [{ failAt: 1 }, { addFailure: true }]) {
    const app = environment(config), owner = lib.createFontPreviewSession(app.host); await assert.rejects(owner.load([font(), font("second.ttf")], signal()), /failed/);
    assert.equal(app.removed.length, 1); owner.dispose(); assert.equal(app.removed.length, 1);
  }
  const app = environment(), owner = lib.createFontPreviewSession(app.host);
  await assert.rejects(owner.load([font("a.woff2", "WOFF2", 100 * 1024 * 1024), font("b.woff2", "WOFF2", 100 * 1024 * 1024), font("c.woff2", "WOFF2", 100 * 1024 * 1024)], signal()), /设备预算/);
  assert.equal(app.faces.length, 0); assert.equal(app.added.length, 0);
});

test("加载中取消或页面释放及时拒绝并阻止原生字体迟到注册，预取消不读取文件", async () => {
  for (const mode of ["abort", "dispose"]) {
    const app = environment({ deferred: true }), owner = lib.createFontPreviewSession(app.host), controller = new AbortController();
    const pending = owner.load([font()], controller.signal); await tickUntil(() => app.pending.length === 1);
    if (mode === "abort") controller.abort(); else owner.dispose();
    await assert.rejects(pending, { name: "AbortError" }); app.pending[0](); await Promise.resolve(); await Promise.resolve(); assert.equal(app.added.length, 0); assert.equal(app.removed.length, 0);
  }
  const app = environment(), owner = lib.createFontPreviewSession(app.host), controller = new AbortController(); controller.abort(); await assert.rejects(owner.load([font()], controller.signal), { name: "AbortError" }); assert.equal(app.faces.length, 0);
});

test("字号、字重不接受空值、NaN或越界，允许小数字号与可变字体连续字重", () => {
  assert.deepEqual(lib.fontPreviewSettings("32.5", "450"), { pixels: 32.5, weight: 450 });
  for (const [size, weight] of [["", "400"], ["7", "400"], ["161", "400"], ["NaN", "400"], ["32", ""], ["32", "99"], ["32", "901"], ["32", "400.5"]]) assert.throws(() => lib.fontPreviewSettings(size, weight));
});

export { bytes as fontFixtureBytes };
