import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolComponents = [
  "ascii-art-generator.tsx",
  "audio-converter.tsx",
  "background-remover.tsx",
  "color-converter.tsx",
  "image-compressor.tsx",
  "image-converter.tsx",
  "image-line-redraw.tsx",
  "image-watermark.tsx",
  "ip-lookup.tsx",
  "qr-generator.tsx",
  "qr-reader.tsx",
  "sensitive-redactor.tsx",
  "video-to-audio.tsx",
  "video-compressor.tsx",
  "video-to-gif.tsx",
  "video-tool.tsx",
];

test("tool page headings begin with text instead of decorative icons", async () => {
  for (const component of toolComponents) {
    const source = await readFile(
      new URL(`../app/components/${component}`, import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /<header className="tool-header[^"]*">\s*<h1>/,
      `${component} should place its title first`,
    );
    assert.doesNotMatch(
      source,
      /(?:heading|header)-icon/,
      `${component} should not define a title icon`,
    );
  }
});
