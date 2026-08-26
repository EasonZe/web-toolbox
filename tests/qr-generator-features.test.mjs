import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../app/components/qr-generator.tsx", import.meta.url),
  "utf8",
);

test("supports a local center logo and QR background image", () => {
  assert.match(componentSource, /中心 Logo/);
  assert.match(componentSource, /背景图片/);
  assert.match(
    componentSource,
    /errorCorrectionLevel: logoImage \? "H" : errorLevel/,
  );
  assert.match(componentSource, /drawImageContain\(context, logoImage/);
  assert.match(componentSource, /drawImageCover\(context, backgroundImage/);
  assert.match(componentSource, /backgroundImageOpacity \/ 100/);
  assert.match(componentSource, /URL\.revokeObjectURL/);
});

test("supports transparent output, editable colors, and unframed logos", () => {
  assert.match(componentSource, /transparentBackground/);
  assert.match(componentSource, /透明背景/);
  assert.match(componentSource, /背景图片透明度/);
  assert.match(componentSource, /min="0"/);
  assert.match(componentSource, /max="100"/);
  assert.match(componentSource, /qr-color-value/);
  assert.match(componentSource, /输入二维码HEX颜色/);
  assert.match(componentSource, /context\.clearRect\(0, 0, size, size\)/);
  assert.doesNotMatch(componentSource, /roundedRect/);
  assert.doesNotMatch(componentSource, /platePadding/);
});
