import { cp, mkdir, readdir } from "node:fs/promises";

// PDF.js needs these version-matched resources for CJK, built-in fonts and image codecs.
const root = new URL("../public/pdfjs/", import.meta.url);
await mkdir(root, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url), new URL(`${directory}/`, root), { recursive: true });
}
await cp(new URL("../node_modules/pdfjs-dist/LICENSE", import.meta.url), new URL("LICENSE", root));

// SoundTouch runs pitch/tempo processing on an AudioWorklet and needs its processor as a public asset.
const soundTouchRoot = new URL("../public/soundtouch/", import.meta.url);
await mkdir(soundTouchRoot, { recursive: true });
await cp(new URL("../node_modules/@soundtouchjs/audio-worklet/.dist/soundtouch-processor.js", import.meta.url), new URL("soundtouch-processor.js", soundTouchRoot));
await cp(new URL("../node_modules/@soundtouchjs/audio-worklet/LICENSE", import.meta.url), new URL("LICENSE", soundTouchRoot));

// Versioned, same-origin MathLive fonts avoid CDN requests and stale immutable assets.
const mathLiveRoot = new URL("../public/mathlive/", import.meta.url);
await mkdir(new URL("0.111.0/", mathLiveRoot), { recursive: true });
await cp(new URL("../node_modules/mathlive/fonts/", import.meta.url), new URL("0.111.0/fonts/", mathLiveRoot), { recursive: true });
await cp(new URL("../node_modules/mathlive/LICENSE.txt", import.meta.url), new URL("MathLive-LICENSE.txt", mathLiveRoot));
await cp(new URL("../node_modules/@cortex-js/compute-engine/LICENSE", import.meta.url), new URL("Compute-Engine-LICENSE", mathLiveRoot));
await cp(new URL("../licenses/KaTeX-fonts-LICENSE.txt", import.meta.url), new URL("KaTeX-fonts-LICENSE.txt", mathLiveRoot));

// Self-host OCR runtime and version-matched Chinese/English language models.
const ocrRoot = new URL("../public/ocr/7.0.0/", import.meta.url);
await mkdir(new URL("core/", ocrRoot), { recursive: true });
await mkdir(new URL("data/", ocrRoot), { recursive: true });
await cp(new URL("../node_modules/tesseract.js/dist/worker.min.js", import.meta.url), new URL("worker.min.js", ocrRoot));
await cp(new URL("../node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt", import.meta.url), new URL("worker.min.js.LICENSE.txt", ocrRoot));
const coreRoot = new URL("../node_modules/tesseract.js-core/", import.meta.url);
for (const name of await readdir(coreRoot)) if (/\.wasm(?:\.js)?$/.test(name)) await cp(new URL(name, coreRoot), new URL(`core/${name}`, ocrRoot));
await cp(new URL("../node_modules/tesseract.js/LICENSE.md", import.meta.url), new URL("Tesseract-LICENSE.md", ocrRoot));
await cp(new URL("LICENSE", coreRoot), new URL("Core-LICENSE", ocrRoot));
// .gz is reserved for precompressed HTTP sidecars by the production preview
// server. Serve the gzip payload under .traineddata; Tesseract detects its
// magic bytes and decompresses it without relying on the URL extension.
for (const language of ["eng", "chi_sim"]) await cp(new URL(`../node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, import.meta.url), new URL(`data/${language}.traineddata`, ocrRoot));
await cp(new URL("../licenses/OCR-models-NOTICE.md", import.meta.url), new URL("Models-NOTICE.md", ocrRoot));

// License texts accompany the browser distribution, not just npm sources.
const vendorLicenseRoot = new URL("../public/vendor-licenses/", import.meta.url);
await mkdir(vendorLicenseRoot, { recursive: true });
for (const [name, license] of [["pdf-lib", "LICENSE.md"], ["diff", "LICENSE"], ["fflate", "LICENSE"], ["marked", "LICENSE"], ["exifr", "LICENSE"], ["jsonc-parser", "LICENSE.md"], ["date-fns-tz", "LICENSE.md"], ["@plussub/srt-vtt-parser", "LICENSE"], ["tesseract.js", "LICENSE.md"], ["tesseract.js-core", "LICENSE"], ["modern-tar", "LICENSE"], ["jsbarcode", "MIT-LICENSE.txt"], ["jwt-decode", "LICENSE"], ["pinyin-pro", "LICENSE"], ["entities", "LICENSE"], ["papaparse", "LICENSE"]]) {
  await cp(new URL(`../node_modules/${name}/${license}`, import.meta.url), new URL(`${name.replaceAll("/", "-")}.txt`, vendorLicenseRoot));
}
