import { cp, mkdir } from "node:fs/promises";

// PDF.js needs these version-matched resources for CJK, built-in fonts and image codecs.
const root = new URL("../public/pdfjs/", import.meta.url);
await mkdir(root, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url), new URL(`${directory}/`, root), { recursive: true });
}
await cp(new URL("../node_modules/pdfjs-dist/LICENSE", import.meta.url), new URL("LICENSE", root));
