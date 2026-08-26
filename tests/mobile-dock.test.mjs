import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [componentSource, styles] = await Promise.all([
  readFile(
    new URL("../app/components/floating-dock.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("hides the floating dock on mobile tool pages", () => {
  assert.match(componentSource, /usePathname/);
  assert.match(componentSource, /const isToolPage = pathname !== "\/"/);
  assert.match(
    componentSource,
    /floating-dock\$\{isToolPage \? " is-tool-page" : ""\}/,
  );
  assert.match(
    styles,
    /@media \(max-width: 680px\)[\s\S]*?\.floating-dock\.is-tool-page\s*\{[^}]*display:\s*none;/,
  );
});
