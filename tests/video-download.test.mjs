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
  assert.match(componentSource, /<video[\s\S]*?src=\{result\}[\s\S]*?controls[\s\S]*?playsInline/);
  assert.match(componentSource, /当前浏览器未能直接载入预览/);
  assert.match(componentSource, /转换后的视频链接和预览会显示在这里/);
  assert.match(componentSource, /<button className="open-button" type="button" disabled>打开视频<\/button>/);
  assert.match(componentSource, /disabled=\{!result \|\| downloading\}/);
  assert.match(componentSource, /link\.download = config\.downloadName/);
  assert.match(componentSource, /下载视频/);
  assert.match(componentSource, /可尝试点击“打开视频”后保存/);
});

test("uses platform-specific MP4 download names", async () => {
  const pages = await Promise.all(
    ["douyin", "bilibili"].map((platform) =>
      readFile(
        new URL(`../app/${platform}/page.tsx`, import.meta.url),
        "utf8",
      ),
    ),
  );

  assert.match(pages[0], /downloadName: "douyin-video\.mp4"/);
  assert.match(pages[1], /downloadName: "bilibili-video\.mp4"/);
  assert.match(pages[1], /apiPrefix: "https:\/\/bilibili-api\.easonzhan\.xyz\/\?url="/);
});
