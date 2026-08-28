import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const components = [
  "document-converter.tsx",
  "video-to-gif.tsx",
  "video-to-audio.tsx",
  "video-compressor.tsx",
  "audio-converter.tsx",
  "audio-compressor.tsx",
  "image-watermark.tsx",
  "image-converter.tsx",
];

for (const component of components) {
  test(`${component} keeps preview and controls visible before selecting a file`, async () => {
    const source = await readFile(
      new URL(`../app/components/${component}`, import.meta.url),
      "utf8",
    );

    assert.match(source, /file-tool-empty/);
  });
}

test("file tool empty states share a visible placeholder style", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.file-tool-empty\s*\{/);
  assert.match(css, /\.video-preview-empty\s*\{/);
  assert.match(css, /\.result-preview-empty\s*\{/);
  assert.match(css, /\.image-preview-empty/);
});
