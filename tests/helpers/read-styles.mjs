import { readFileSync } from "node:fs";

// Expand project CSS imports in cascade order for structural assertions.
// Package imports such as Tailwind remain for the production build to resolve.
export function readStyles(url = new URL("../../app/globals.css", import.meta.url), ancestors = new Set()) {
  if (ancestors.has(url.href)) throw new Error(`Circular CSS import: ${url.href}`);
  const next = new Set([...ancestors, url.href]);
  return readFileSync(url, "utf8").replace(/^@import ["'](\.[^"']+)["'];\r?\n/gm,
    (_, path) => readStyles(new URL(path, url), next));
}
