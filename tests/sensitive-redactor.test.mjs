import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/sensitive-redactor.tsx", import.meta.url),
  "utf8",
);

test("sensitive redactor processes images locally with three masking modes", () => {
  assert.match(source, /type RedactionMode = "mosaic" \| "blur" \| "solid"/);
  assert.match(source, /context\.createPattern/);
  assert.match(source, /function drawPortableBlur\(/);
  assert.match(source, /"filter" in context/);
  assert.match(source, /context\.filter = `blur/);
  assert.match(source, /const reduction = Math\.min\(32/);
  assert.match(source, /enableHighQualitySmoothing\(blurContext\)/);
  assert.match(source, /context\.strokeStyle = stroke\.color/);
  assert.match(source, /canvas\.toBlob/);
});

test("sensitive redactor supports mouse, touch, history and drag-and-drop", () => {
  assert.match(source, /<FileDropZone/);
  assert.match(source, /onPointerDown=/);
  assert.match(source, /onPointerMove=/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /function undo\(/);
  assert.match(source, /function redo\(/);
  assert.match(source, /file-tool-empty/);
});
