import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const libSource = await readFile(new URL("../app/lib/image-cropping.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/image-cropper.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

const compiled = ts.transpileModule(libSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, { exports: helpers, Set, Math, Number });

test("固定比例会居中生成裁剪框", () => {
  const crop = helpers.createInitialCrop({ width: 1000, height: 500 }, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), { x: 275, y: 25, width: 450, height: 450 });
});

test("移动裁剪框不会超出图片边界", () => {
  const crop = helpers.moveCropRect(
    { x: 30, y: 30, width: 300, height: 200 },
    { x: 1000, y: -1000 },
    { width: 640, height: 480 },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), { x: 340, y: 0, width: 300, height: 200 });
});

test("从两个点创建裁剪框时保持所选比例", () => {
  const crop = helpers.createCropFromPoints(
    { x: 100, y: 100 },
    { x: 500, y: 300 },
    { width: 800, height: 600 },
    1,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), { x: 100, y: 100, width: 400, height: 400 });
});

test("图片裁剪组件支持拖入、触控裁剪、旋转翻转和本地导出", () => {
  assert.match(component, /<FileDropZone/);
  assert.match(component, /onPointerDown=\{handlePointerDown\}/);
  assert.match(component, /onPointerMove=\{handlePointerMove\}/);
  assert.match(component, /setPointerCapture/);
  assert.match(component, /context\.drawImage/);
  assert.match(component, /canvas\.toBlob/);
  assert.match(component, /transformSource\("horizontal"\)/);
  assert.match(component, /download=\{result\.name\}/);
  assert.match(styles, /\.image-crop-canvas-frame canvas\s*\{[^}]*touch-action:\s*none;/s);
  assert.doesNotMatch(component, /fetch\(|FormData|XMLHttpRequest/);
  assert.match(page, /href: "\/image-cropper"/);
});
