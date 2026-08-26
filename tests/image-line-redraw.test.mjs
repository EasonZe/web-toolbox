import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/image-line-redraw.tsx", import.meta.url),
  "utf8",
);

test("uses local Sobel edge detection and non-maximum suppression", () => {
  assert.match(source, /getImageData\(/);
  assert.match(source, /gradientX/);
  assert.match(source, /gradientY/);
  assert.match(source, /Math\.hypot\(gradientX, gradientY\)/);
  assert.match(source, /value < before \|\| value < after/);
  assert.match(source, /const threshold = 310 - sensitivity \* 3/);
});

test("expands a one-pixel contour with a circular equal-width brush", () => {
  assert.match(source, /const radius = Math\.floor\(lineWidth \/ 2\)/);
  assert.match(source, /offsetX \* offsetX \+ offsetY \* offsetY/);
  assert.match(source, /outputContext\.drawImage\(maskCanvas, offsetX, offsetY\)/);
});

test("keeps preview and settings visible before selecting an image", () => {
  assert.match(source, /<div className="image-line-workbench">/);
  assert.match(source, /id="image-line-preview-title">重绘预览/);
  assert.match(source, /id="image-line-settings-title">重绘设置/);
  assert.match(source, /尚未选择图片/);
});

test("supports drag-and-drop input and local PNG download", () => {
  assert.match(source, /<FileDropZone/);
  assert.match(source, /onFile=\{handleSourceFile\}/);
  assert.match(source, /canvas\.toBlob\(/);
  assert.match(source, /"image\/png"/);
});
