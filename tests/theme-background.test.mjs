import { readStyles } from "./helpers/read-styles.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const styles = await readStyles();

test("uses a clean page background without a top radial glow", () => {
  const bodyRule =
    styles.match(/\r?\n\r?\nbody\s*\{([\s\S]*?)\r?\n\}/)?.[1] ?? "";

  assert.match(bodyRule, /background:\s*var\(--page\);/);
  assert.doesNotMatch(bodyRule, /radial-gradient/);
});

test("uses a clean settings background without a top radial glow", () => {
  const settingsRule =
    styles.match(/\.settings-view\s*\{([\s\S]*?)\r?\n\}/)?.[1] ?? "";

  assert.match(settingsRule, /background:\s*var\(--page\);/);
  assert.doesNotMatch(settingsRule, /radial-gradient/);
});
