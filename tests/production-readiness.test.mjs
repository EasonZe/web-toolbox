import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const removedDescription = /提供视频、音频、图片、文档[\s\S]*?无需安装，打开即用。/;

test("透明站点标志、robots与联系方式已用于生产页面", async () => {
  const [layout, home, robots, rss, logo] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/rss.xml", import.meta.url), "utf8"),
    readFile(new URL("../public/images/toolbox-logo.png", import.meta.url)),
  ]);
  assert.doesNotMatch(`${layout}\n${home}\n${rss}`, removedDescription);
  assert.doesNotMatch(home, /有问题意见反馈|2459366392/);
  assert.doesNotMatch(home, /All Rights Reserved/i);
  assert.match(home, /MIT License/);
  assert.match(layout, /\/images\/toolbox-logo\.png/);
  assert.match(home, /mailto:qwas_qweasd@163\.com/);
  assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(logo[25], 6, "项目标志应为带 Alpha 通道的 RGBA PNG");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/tool\.easonzhan\.xyz\/sitemap\.xml/);
});

test("页面不再使用next font本地绝对路径", async () => {
  const [layout, styles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /next\/font\/google|Geist_Mono|Geist\(/);
  assert.doesNotMatch(`${layout}\n${styles}`, /C:[/\\\\]Users[/\\\\]/i);
  assert.match(styles, /--font-sans:[\s\S]*?"PingFang SC"/);
  assert.match(styles, /--font-geist-mono:[\s\S]*?"Cascadia Mono"/);
});
