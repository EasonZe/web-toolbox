import { cp, mkdir } from "node:fs/promises";

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
