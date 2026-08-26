import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiUrl,
  extractSource,
  extractYoutubeVideoId,
} from "../app/lib/video-links.ts";

test("extracts a Douyin link from complete share text", () => {
  assert.equal(
    extractSource(
      "抖音分享文字 https://v.douyin.com/KQbON-3ImaE/ 复制此链接！",
      { domains: ["douyin.com", "iesdouyin.com"] },
    ),
    "https://v.douyin.com/KQbON-3ImaE/",
  );
});

test("rejects lookalike video hosts", () => {
  assert.equal(
    extractSource("https://douyin.com.example.com/video/123", {
      domains: ["douyin.com"],
    }),
    "",
  );
});

test("canonicalizes Bilibili links and preserves multipart page numbers", () => {
  assert.equal(
    extractSource(
      "https://www.bilibili.com/video/BV1aJMV6jEdg/?share_source=copy_web&p=3",
      {
        domains: ["bilibili.com", "b23.tv"],
        canonicalizeBilibili: true,
      },
    ),
    "https://www.bilibili.com/video/BV1aJMV6jEdg/?p=3",
  );
});

test("accepts a bare Bilibili BV number", () => {
  assert.equal(
    extractSource("BV1aJMV6jEdg", {
      domains: ["bilibili.com"],
      canonicalizeBilibili: true,
    }),
    "https://www.bilibili.com/video/BV1aJMV6jEdg/",
  );
});

test("canonicalizes regular, short, and Shorts YouTube links", () => {
  const config = {
    domains: ["youtube.com", "youtube-nocookie.com", "youtu.be"],
    canonicalizeYoutube: true,
  };

  assert.equal(
    extractSource("分享 https://youtu.be/dQw4w9WgXcQ?t=8", config),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(
    extractSource("https://www.youtube.com/shorts/dQw4w9WgXcQ", config),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(
    extractSource(
      "https://youtu.be/BZ7Sn5-pShc?si=DGs_ZV8Bp3fuXyHq",
      config,
    ),
    "https://www.youtube.com/watch?v=BZ7Sn5-pShc",
  );
  assert.equal(
    extractSource("dQw4w9WgXcQ", config),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
});

test("rejects lookalike YouTube hosts and invalid video IDs", () => {
  const config = {
    domains: ["youtube.com", "youtube-nocookie.com", "youtu.be"],
    canonicalizeYoutube: true,
  };

  assert.equal(
    extractSource(
      "https://youtube.com.example.com/watch?v=dQw4w9WgXcQ",
      config,
    ),
    "",
  );
  assert.equal(
    extractYoutubeVideoId("https://www.youtube.com/watch?v=too-short"),
    "",
  );
});

test("encodes source URLs that contain their own query string", () => {
  assert.equal(
    buildApiUrl(
      "https://bilibili-api.easonzhan.xyz/?url=",
      "https://www.bilibili.com/video/BV1aJMV6jEdg/?p=3",
    ),
    "https://bilibili-api.easonzhan.xyz/?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1aJMV6jEdg%2F%3Fp%3D3",
  );
});
