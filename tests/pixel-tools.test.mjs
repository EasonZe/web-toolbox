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

test("像素工具颜色转换、可读文字色和用量统计正确", async () => {
  const { readableTextColor, rgbToHex, rgbToHsl, summarizePixels } = await load("../app/lib/pixel-tools.ts");
  assert.equal(rgbToHex({ r: 12, g: 160, b: 255 }), "#0CA0FF");
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.equal(readableTextColor({ r: 10, g: 20, b: 30 }), "#FFFFFF");
  const summary = summarizePixels({ data: new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
  ]) }, "C");
  assert.equal(summary.length, 2);
  assert.deepEqual([summary[0].code, summary[0].hex, summary[0].count], ["C01", "#FF0000", 2]);
  assert.equal(Math.round(summary[0].percentage), 67);
});

test("三个新图片工具使用成熟量化与配色库并提供本地导出", async () => {
  const shared = await read("../app/lib/pixel-tools.ts");
  const pixel = await read("../app/components/pixel-art-converter.tsx");
  const bead = await read("../app/components/bead-pattern-generator.tsx");
  const palette = await read("../app/components/image-palette-extractor.tsx");
  for (const value of ["buildPalette", "applyPalette", "ciede2000", "wuquant"]) assert.ok(shared.includes(value), value);
  for (const value of ["Floyd–Steinberg", "Atkinson", "下载像素画 PNG", "pixel-palette-strip"]) assert.ok(pixel.includes(value), value);
  for (const value of ["横向豆数", "最多颜色", "显示格线", "显示编号", "颜色与用量", "下载 PNG 图纸"]) assert.ok(bead.includes(value), value);
  for (const value of ["getPalette", "oklch", "点击图片精确取色", "drawPickMarker", "已标记原图坐标", "已选位置", "复制 CSS", "下载 CSS"]) assert.ok(palette.includes(value), value);
  for (const source of [pixel, bead, palette]) assert.match(source, /URL\.revokeObjectURL/);
});

test("首页加入拼豆、像素画和图片配色工具", async () => {
  const source = await read("../app/components/tool-search-grid.tsx");
  for (const value of ["/bead-pattern", "拼豆图纸生成", "/pixel-art", "图片转像素画", "/image-palette", "图片取色与配色提取"]) assert.ok(source.includes(value), value);
});

test("麦克风波形和音量使用缓动而不是直接显示原始值", async () => {
  const source = await read("../app/components/microphone-recorder.tsx");
  for (const value of ["visualPointCount = 160", "smoothedLevelRef", "levelFactor", "previous * 0.82", "smoothingTimeConstant = 0.88"]) assert.ok(source.includes(value), value);
  assert.doesNotMatch(source, /Math\.round\(rms \* 300\)/);
});
