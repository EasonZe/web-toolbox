import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../app/components/video-tool.tsx", import.meta.url),
  "utf8",
);

test("downloads converted videos with progress and a safe fallback", () => {
  assert.match(componentSource, /async function downloadVideo/);
  assert.match(componentSource, /await fetch\(result\)/);
  assert.match(componentSource, /response\.body\?\.getReader\(\)/);
  assert.match(componentSource, /link\.download = config\.downloadName/);
  assert.match(componentSource, /下载视频/);
  assert.match(componentSource, /可尝试点击“打开视频”后保存/);
});

test("uses platform-specific MP4 download names", async () => {
  const pages = await Promise.all(
    ["douyin", "bilibili", "kuaishou"].map((platform) =>
      readFile(
        new URL(`../app/${platform}/page.tsx`, import.meta.url),
        "utf8",
      ),
    ),
  );

  assert.match(pages[0], /downloadName: "douyin-video\.mp4"/);
  assert.match(pages[1], /downloadName: "bilibili-video\.mp4"/);
  assert.match(pages[2], /downloadName: "kuaishou-video\.mp4"/);
});
