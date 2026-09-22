import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("keeps toolbox cards left-aligned in fixed desktop and mobile columns", () => {
  assert.match(
    styles,
    /\.tool-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 680px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.doesNotMatch(
    styles,
    /\.tool-grid\s*\{[^}]*justify-content:\s*center;/s,
  );
  assert.match(
    styles,
    /\.home-shell\s*\{[^}]*width:\s*min\(1120px,\s*calc\(100% - 36px\)\);/s,
  );
  assert.match(
    styles,
    /@media \(min-width: 901px\)[\s\S]*?\.tool-card\s*\{[^}]*min-height:\s*200px;[^}]*padding:\s*20px;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 680px\)[\s\S]*?\.tool-card\s*\{[^}]*-webkit-touch-callout:\s*none;[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;[^}]*touch-action:\s*pan-y pinch-zoom;/,
  );
  assert.match(
    styles,
    /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.tool-card-shell:hover > \.tool-card,\s*\.tool-card:active\s*\{[^}]*transform:\s*none;[^}]*border-color:\s*var\(--line\);[\s\S]*?\.tool-card-shell:hover > \.tool-card \.tool-action::before,\s*\.tool-card:active \.tool-action::before\s*\{[^}]*transform:\s*scaleX\(0\);[\s\S]*?\.tool-card-shell:hover > \.tool-card \.tool-arrow,\s*\.tool-card:active \.tool-arrow\s*\{[^}]*width:\s*22px;[^}]*color:\s*var\(--ui-accent\);/,
  );
  assert.match(
    styles,
    /\.tool-card\.is-touch-entering\s*\{[^}]*transform:\s*translateY\(-5px\);[^}]*border-color:\s*var\(--blue-hover\);[\s\S]*?\.tool-card\.is-touch-entering \.tool-icon\s*\{[^}]*transform:\s*translateY\(-2px\);[\s\S]*?\.tool-card\.is-touch-entering \.tool-action::before\s*\{[^}]*transform:\s*scaleX\(1\);[\s\S]*?\.tool-card\.is-touch-entering \.tool-arrow\s*\{[^}]*width:\s*calc\(100% - 24px\);[^}]*color:\s*#ffffff;/,
  );
});
