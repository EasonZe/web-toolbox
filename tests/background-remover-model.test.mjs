import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../app/components/background-remover.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/background-remover/page.tsx", import.meta.url),
  "utf8",
);

test("uses Transformers.js-compatible background removal models", () => {
  assert.match(componentSource, /onnx-community\/ISNet-ONNX/);
  assert.match(componentSource, /dtype: "fp16"/);
  assert.match(componentSource, /dtype: "q8"/);
  assert.match(componentSource, /label: "IS-Net FP16"/);
  assert.match(componentSource, /label: "IS-Net QInt8"/);
  assert.match(componentSource, /onnx-community\/BEN2-ONNX/);
  assert.match(componentSource, /label: "BEN2 FP16"/);
  assert.match(componentSource, /model: "高清度"/);
  assert.match(componentSource, /model: "性能优"/);
  assert.match(componentSource, /model: "精细边缘"/);
  assert.match(componentSource, /首次下载约 80 MB/);
  assert.match(componentSource, /首次下载约 40 MB/);
  assert.match(componentSource, /首次下载约 219 MB/);
  assert.match(componentSource, /性能占用较高/);
  assert.match(componentSource, /性能占用较低/);
  assert.match(
    componentSource,
    /useState<RemovalMode>\("fp16"\)/,
  );
  assert.match(componentSource, /<legend>AI 模型<\/legend>/);
  assert.doesNotMatch(componentSource, /Xenova\/modnet/);
  assert.doesNotMatch(componentSource, /轻量模型|图片类型/);
  assert.doesNotMatch(componentSource, /动漫插画|人像照片|二次元|真人/);
  assert.doesNotMatch(pageSource, /动漫插画|人像照片|二次元|真人/);
  assert.doesNotMatch(componentSource, /BritishWerewolf\/IS-Net-Anime/);
  assert.doesNotMatch(componentSource, /U2NetImageProcessor/);
});

test("shows preview and settings before an image is selected", () => {
  assert.match(componentSource, /<h2 id="background-remover-preview-title">抠图预览<\/h2>/);
  assert.match(componentSource, /<h2 id="background-remover-settings-title">抠图设置<\/h2>/);
  assert.match(componentSource, /尚未选择图片/);
  assert.match(componentSource, /选择图片后在这里预览/);
  assert.match(componentSource, /disabled=\{!sourceFile \|\| processing\}/);
  assert.doesNotMatch(
    componentSource,
    /\{sourceFile && sourceImage \? \(\s*<div className="background-remover-workbench">/,
  );
});
