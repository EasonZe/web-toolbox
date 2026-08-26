import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/image-compressor.tsx", import.meta.url),
  "utf8",
);

test("batch image compressor supports the requested formats and controls", () => {
  assert.match(source, /image\/jpeg/);
  assert.match(source, /image\/png/);
  assert.match(source, /image\/webp/);
  assert.match(source, /multiple/);
  assert.match(source, /onFiles=/);
  assert.match(source, /压缩质量/);
  assert.match(source, /type="range"/);
  assert.match(source, /开始压缩/);
});

test("batch image compressor handles local compression and downloads", () => {
  assert.match(source, /createImageBitmap/);
  assert.match(source, /canvas\.toBlob/);
  assert.match(source, /optimizePngPixels/);
  assert.match(source, /createZip/);
  assert.match(source, /compressed-images\.zip/);
  assert.match(source, /支持批量压缩JPG、PNG和WebP/);
  assert.doesNotMatch(source, /浏览器本地处理|不会上传/);
});
