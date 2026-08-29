import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const rss = await readFile(new URL("../public/rss.xml", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");

test("页脚显示版权、RSS 与 Sitemap 链接", () => {
  assert.match(page, /© 2026 Eason\. All Rights Reserved\./);
  assert.match(page, /href="\/rss\.xml">RSS<\/a>/);
  assert.match(page, /href="\/sitemap\.xml">Sitemap<\/a>/);
  assert.match(styles, /\.site-footer-meta\s*\{[^}]*display:\s*flex;/s);
});

test("RSS 与 Sitemap 都是可用的 XML 文件", () => {
  assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(rss, /<rss version="2\.0">/);
  assert.match(rss, /<link>https:\/\/tool\.easonzhan\.xyz\/<\/link>/);
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/tool\.easonzhan\.xyz\/ascii-art<\/loc>/);
});
