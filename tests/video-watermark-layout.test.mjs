import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const librarySource = await readFile(new URL("../app/lib/video-watermark.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../app/components/video-watermark.tsx", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(librarySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Math });

test("视频水印支持单点、平铺与网格布局", () => {
  const base = { ...exports.defaultWatermark, spacing: 12 };
  const single = exports.watermarkPositions(800, 450, 120, 40, { ...base, layout: "single" });
  const tiled = exports.watermarkPositions(800, 450, 120, 40, { ...base, layout: "tile" });
  const grid = exports.watermarkPositions(800, 450, 120, 40, { ...base, layout: "grid" });
  assert.equal(single.length, 1);
  assert.ok(tiled.length > 4);
  assert.ok(grid.length > 4);
  const tiledSecondRow = tiled.find((position) => position.y > tiled[0].y);
  const gridSecondRow = grid.find((position) => position.y > grid[0].y);
  assert.notEqual(tiledSecondRow.x, gridSecondRow.x);
  for (const text of ["单点水印", "平铺水印", "网格水印", "水印间距"]) assert.ok(componentSource.includes(text), text);
});

test("文字水印透明度覆盖0到100并立即用于绘制", () => {
  const draws = [];
  const context = {
    globalAlpha: 1,
    font: "",
    fillStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    textBaseline: "",
    save() {},
    restore() {},
    measureText(text) { return { width: String(text).length * 10 }; },
    fillText(text, x, y) { draws.push({ text, x, y, alpha: this.globalAlpha }); },
    drawImage() {},
  };
  exports.drawWatermark(context, 800, 450, { ...exports.defaultWatermark, opacity: 23 }, null);
  assert.equal(draws.length, 1);
  assert.equal(draws[0].alpha, 0.23);
  draws.length = 0;
  exports.drawWatermark(context, 800, 450, { ...exports.defaultWatermark, opacity: 0 }, null);
  assert.equal(draws.length, 0);
  assert.match(componentSource, /aria-label="水印透明度"[\s\S]*?min=\{0\}[\s\S]*?max=\{100\}/);
});
