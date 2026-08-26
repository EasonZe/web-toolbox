import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(
  new URL("../worker/youtube-api.ts", import.meta.url),
  "utf8",
);
const workerSource = await readFile(
  new URL("../worker/index.ts", import.meta.url),
  "utf8",
);

test("routes the public YouTube API through the Worker", () => {
  assert.match(workerSource, /youtube-api\.easonzhan\.xyz/);
  assert.match(workerSource, /url\.pathname === "\/"/);
  assert.match(workerSource, /pathname === "\/api\/youtube"/);
  assert.match(workerSource, /handleYoutubeApi\(request\)/);
});

test("resolves a progressive MP4 with resilient client fallbacks", () => {
  assert.match(apiSource, /youtubei\.js\/cf-worker/);
  assert.match(apiSource, /ClientType\.ANDROID/);
  assert.match(apiSource, /YOUTUBE_STREAM_PASSES = 2/);
  assert.match(apiSource, /"ANDROID_VR"/);
  assert.match(apiSource, /"IOS"/);
  assert.match(apiSource, /"TV_EMBEDDED"/);
  assert.match(apiSource, /"WEB_EMBEDDED"/);
  assert.match(apiSource, /"TV"/);
  assert.match(apiSource, /for \(const client of YOUTUBE_STREAM_CLIENTS\)/);
  assert.match(apiSource, /retrieve_player: false/);
  assert.match(apiSource, /type: "video\+audio"/);
  assert.match(apiSource, /format: "mp4"/);
  assert.doesNotMatch(apiSource, /\beval\s*\(|new Function/);
});

test("does not misclassify transient missing streaming data as a missing video", () => {
  assert.match(apiSource, /Streaming data not available/);
  assert.equal(apiSource.includes("throw error;"), false);
  assert.equal(
    apiSource.includes("/unavailable|not available|private|LOGIN_REQUIRED/i"),
    false,
  );
});

test("reports authenticated or restricted videos separately", () => {
  assert.match(apiSource, /YOUTUBE_AUTH_REQUIRED/);
  assert.match(apiSource, /status code 403/);
});

test("streams only Google video media and preserves byte ranges", () => {
  assert.match(apiSource, /endsWith\("\.googlevideo\.com"\)/);
  assert.match(apiSource, /upstreamHeaders\.set\("Range", range\)/);
  assert.match(apiSource, /request\.method === "HEAD" \? null : upstream\.body/);
  assert.match(apiSource, /"Access-Control-Allow-Origin": "\*"/);
  assert.match(apiSource, /"Accept-Ranges", "bytes"/);
});

test("rejects missing, oversized, invalid URL and malformed range input", () => {
  assert.match(apiSource, /MISSING_URL/);
  assert.match(apiSource, /URL_TOO_LONG/);
  assert.match(apiSource, /INVALID_YOUTUBE_URL/);
  assert.match(apiSource, /INVALID_RANGE/);
});
