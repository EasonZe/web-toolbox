import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/video-to-gif.tsx", import.meta.url),
  "utf8",
);

test("video frame waiting always has a timeout fallback", () => {
  assert.match(source, /const videoFrameTimeout = 1500/);
  assert.match(source, /window\.setTimeout\(finish, videoFrameTimeout\)/);
  assert.match(source, /callbackVideo\.requestVideoFrameCallback\(finish\)/);
});

test("unchanged video timestamps do not wait for a decoded-frame callback", () => {
  assert.match(
    source,
    /Math\.abs\(video\.currentTime - time\) < 0\.008[\s\S]*?requestAnimationFrame/,
  );
});

test("conversion always releases the busy state", () => {
  assert.match(source, /finally \{\s*setConverting\(false\);\s*\}/);
});

test("short source durations do not make the conversion form invalid", () => {
  assert.match(source, /min="0\.1"[\s\S]*?step="any"/);
});
