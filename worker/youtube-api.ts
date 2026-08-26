import { ClientType, Innertube } from "youtubei.js/cf-worker";
import {
  extractSource,
  extractYoutubeVideoId,
} from "../app/lib/video-links";

const YOUTUBE_DOMAINS = ["youtube.com", "youtube-nocookie.com", "youtu.be"];
const YOUTUBE_STREAM_CLIENTS = [
  "ANDROID",
  "ANDROID_VR",
  "IOS",
  "TV_EMBEDDED",
  "WEB_EMBEDDED",
  "TV",
] as const;
const YOUTUBE_STREAM_PASSES = 2;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-Range",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { success: false, error: { code, message } },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
      },
    },
  );
}

function isGoogleVideoUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      parsed.protocol === "https:" &&
      (host === "googlevideo.com" || host.endsWith(".googlevideo.com"))
    );
  } catch {
    return false;
  }
}

function copyHeader(source: Headers, target: Headers, name: string) {
  const value = source.get(name);
  if (value) target.set(name, value);
}

async function resolveVideoUrl(videoId: string) {
  const youtube = await Innertube.create({
    client_type: ClientType.ANDROID,
    enable_session_cache: false,
    fail_fast: true,
    generate_session_locally: true,
    lang: "zh-CN",
    location: "US",
    retrieve_innertube_config: false,
    retrieve_player: false,
  });

  const failures: string[] = [];

  for (let pass = 0; pass < YOUTUBE_STREAM_PASSES; pass += 1) {
    for (const client of YOUTUBE_STREAM_CLIENTS) {
      try {
        const format = await youtube.getStreamingData(videoId, {
          client,
          format: "mp4",
          quality: "best",
          type: "video+audio",
        });

        if (format.has_audio && format.has_video && format.url) {
          return format.url;
        }

        failures.push(`${client}:NO_PROGRESSIVE_FORMAT`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "UNKNOWN";
        failures.push(`${client}:${detail.slice(0, 120)}`);
      }
    }
  }

  throw new Error(`STREAMING_LOOKUP_FAILED:${failures.join("|")}`);
}

export async function handleYoutubeApi(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "只支持 GET、HEAD 请求。");
  }

  const requestUrl = new URL(request.url);
  const input = requestUrl.searchParams.get("url")?.trim() || "";

  if (!input) {
    return jsonError(400, "MISSING_URL", "请在 url 参数中提供 YouTube 视频链接。");
  }

  if (input.length > 2048) {
    return jsonError(400, "URL_TOO_LONG", "YouTube 链接过长。");
  }

  const canonicalUrl = extractSource(input, {
    domains: YOUTUBE_DOMAINS,
    canonicalizeYoutube: true,
  });
  const videoId = extractYoutubeVideoId(canonicalUrl);

  if (!videoId) {
    return jsonError(
      400,
      "INVALID_YOUTUBE_URL",
      "没有找到有效的 YouTube 视频链接或视频 ID。",
    );
  }

  const range = request.headers.get("range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return jsonError(416, "INVALID_RANGE", "Range 请求格式无效。");
  }

  const startedAt = Date.now();

  try {
    const mediaUrl = await resolveVideoUrl(videoId);
    if (!isGoogleVideoUrl(mediaUrl)) {
      throw new Error("UNEXPECTED_MEDIA_HOST");
    }

    const upstreamHeaders = new Headers({ Accept: "video/mp4,*/*;q=0.8" });
    if (range) upstreamHeaders.set("Range", range);

    const ifRange = request.headers.get("if-range");
    if (ifRange && ifRange.length <= 200) {
      upstreamHeaders.set("If-Range", ifRange);
    }

    const upstream = await fetch(mediaUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (upstream.url && !isGoogleVideoUrl(upstream.url)) {
      await upstream.body?.cancel();
      throw new Error("UNEXPECTED_MEDIA_HOST");
    }

    if (!upstream.ok) {
      const status = upstream.status;
      await upstream.body?.cancel();
      console.warn(
        JSON.stringify({
          event: "youtube_media_error",
          videoId,
          upstreamStatus: status,
          durationMs: Date.now() - startedAt,
        }),
      );
      return jsonError(
        status === 416 ? 416 : 502,
        status === 416 ? "RANGE_NOT_SATISFIABLE" : "MEDIA_FETCH_FAILED",
        status === 416
          ? "请求的视频字节范围不可用。"
          : "暂时无法读取 YouTube 视频，请稍后重试。",
      );
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    if (
      !contentType.toLowerCase().startsWith("video/") &&
      !contentType.toLowerCase().includes("octet-stream")
    ) {
      await upstream.body?.cancel();
      throw new Error("INVALID_MEDIA_RESPONSE");
    }

    const responseHeaders = new Headers(CORS_HEADERS);
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set(
      "Content-Disposition",
      `inline; filename="youtube-${videoId}.mp4"`,
    );
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("Accept-Ranges", "bytes");

    for (const header of [
      "content-length",
      "content-range",
      "etag",
      "last-modified",
    ]) {
      copyHeader(upstream.headers, responseHeaders, header);
    }

    console.log(
      JSON.stringify({
        event: "youtube_media_stream",
        videoId,
        status: upstream.status,
        ranged: Boolean(range),
        durationMs: Date.now() - startedAt,
      }),
    );

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    console.error(
      JSON.stringify({
        event: "youtube_api_error",
        videoId,
        code: detail || "UNKNOWN",
        durationMs: Date.now() - startedAt,
      }),
    );

    if (/LOGIN_REQUIRED|status code 403/i.test(detail)) {
      return jsonError(
        403,
        "YOUTUBE_AUTH_REQUIRED",
        "YouTube 拒绝未登录服务器访问该视频；视频可能需要登录、年龄验证，或禁止第三方解析。",
      );
    }

    if (/private video|this video is unavailable/i.test(detail)) {
      return jsonError(404, "VIDEO_UNAVAILABLE", "该 YouTube 视频不可用或需要登录。");
    }

    if (
      /NO_PROGRESSIVE_FORMAT|No matching formats/i.test(detail) &&
      !/Streaming data not available/i.test(detail)
    ) {
      return jsonError(
        422,
        "NO_PLAYABLE_MP4",
        "该视频没有可直接播放且同时包含声音的 MP4 格式。",
      );
    }

    return jsonError(
      502,
      "YOUTUBE_UPSTREAM_ERROR",
      "YouTube 解析暂时失败，请稍后重试。",
    );
  }
}
