import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const libSource = await readFile(new URL("../app/lib/image-stitching.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/image-stitcher.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/components/tool-search-grid.tsx", import.meta.url), "utf8");

const compiled = ts.transpileModule(libSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, { exports: helpers, Set, Math, Number });

test("横向统一高度会保持比例并正确计算间距和边距", () => {
  const layout = helpers.calculateStitchLayout(
    [{ width: 100, height: 50 }, { width: 50, height: 100 }],
    { direction: "horizontal", sizeMode: "uniform", crossSize: 100, gap: 10, padding: 5, alignment: "center" },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(layout)), {
    width: 270,
    height: 110,
    rects: [
      { x: 5, y: 5, width: 200, height: 100 },
      { x: 215, y: 5, width: 50, height: 100 },
    ],
  });
});

test("纵向原尺寸支持右侧对齐", () => {
  const layout = helpers.calculateStitchLayout(
    [{ width: 100, height: 50 }, { width: 50, height: 100 }],
    { direction: "vertical", sizeMode: "original", crossSize: 800, gap: 8, padding: 4, alignment: "end" },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(layout)), {
    width: 108,
    height: 166,
    rects: [
      { x: 4, y: 4, width: 100, height: 50 },
      { x: 54, y: 62, width: 50, height: 100 },
    ],
  });
});

test("过大的输出画布会被阻止", () => {
  assert.match(helpers.validateStitchLayout({ width: 20_000, height: 100, rects: [] }), /16384/);
  assert.match(helpers.validateStitchLayout({ width: 10_000, height: 10_000, rects: [] }), /像素过大/);
});

test("图片拼接组件支持拖入、排序、画布导出和本地下载", () => {
  assert.match(component, /<FileDropZone/);
  assert.match(component, /multiple/);
  assert.match(component, /moveItem\(index/);
  assert.match(component, /calculateStitchLayout/);
  assert.match(component, /context\.drawImage/);
  assert.match(component, /canvas\.toBlob/);
  assert.match(component, /download=\{result\.name\}/);
  assert.doesNotMatch(component, /fetch\(|FormData|XMLHttpRequest/);
  assert.match(page, /href: "\/image-stitcher"/);
});
