const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 20_000;
const PHOTO_TOKEN_PATTERN = /^[0-9A-Za-z_-]{6,80}$/;
const NO_ICON_PATHS = new Set([
  "/favicon.ico",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/site.webmanifest",
  "/manifest.webmanifest",
  "/browserconfig.xml",
]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function normalizedHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/\.$/, "");
}

function isHostOrSubdomain(hostname, suffix) {
  const host = normalizedHost(hostname);
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isKuaishouHost(hostname) {
  return (
    isHostOrSubdomain(hostname, "kuaishou.com") ||
    isHostOrSubdomain(hostname, "gifshow.com") ||
    isHostOrSubdomain(hostname, "chenzhongtech.com")
  );
}

export function isAllowedMediaHost(hostname) {
  return (
    isHostOrSubdomain(hostname, "kwaicdn.com") ||
    isHostOrSubdomain(hostname, "kwimgs.com") ||
    isHostOrSubdomain(hostname, "yximgs.com") ||
    isHostOrSubdomain(hostname, "oskwai.com")
  );
}

function parseSafeUrl(value, validator, message) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(400, "INVALID_URL", "链接格式无效");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !validator(parsed.hostname)
  ) {
    throw new ApiError(400, "UNSUPPORTED_HOST", message);
  }
  return parsed;
}

function trimUrlPunctuation(value) {
  return value.replace(/[),.;!?，。；！）》】\]]+$/g, "");
}

export function extractKuaishouUrl(input) {
  const matches = String(input || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = trimUrlPunctuation(match);
    try {
      const parsed = new URL(candidate);
      if (isKuaishouHost(parsed.hostname)) return parsed.toString();
    } catch {
      // Continue looking for another URL in the copied share text.
    }
  }
  throw new ApiError(
    400,
    "UNSUPPORTED_URL",
    "没有找到有效的快手分享链接",
  );
}

export function extractPhotoToken(value) {
  const parsed = value instanceof URL ? value : new URL(value);
  const match = parsed.pathname.match(
    /\/(?:short-video|fw\/photo)\/([0-9A-Za-z_-]{6,80})/i,
  );
  const token =
    match?.[1] ||
    parsed.searchParams.get("shareObjectId") ||
    parsed.searchParams.get("photoId");
  return token && PHOTO_TOKEN_PATTERN.test(token) ? token : "";
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(504, "PLATFORM_TIMEOUT", "快手响应超时");
    }
    throw new ApiError(502, "PLATFORM_ERROR", "无法连接快手");
  } finally {
    clearTimeout(timer);
  }
}

async function discardBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The body has already closed.
  }
}

async function readBoundedText(response) {
  if (!response.ok) {
    const status = response.status;
    await discardBody(response);
    throw new ApiError(
      502,
      "PLATFORM_HTTP_ERROR",
      `快手分享页返回 HTTP ${status}`,
    );
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_HTML_BYTES) {
    await discardBody(response);
    throw new ApiError(502, "PLATFORM_RESPONSE_TOO_LARGE", "快手分享页响应异常");
  }
  if (!response.body) {
    throw new ApiError(502, "EMPTY_PLATFORM_RESPONSE", "快手返回了空响应");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        throw new ApiError(
          502,
          "PLATFORM_RESPONSE_TOO_LARGE",
          "快手分享页响应异常",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function resolvePhotoToken(input, fetchImpl = fetch) {
  const sourceUrl = extractKuaishouUrl(input);
  let current = parseSafeUrl(sourceUrl, isKuaishouHost, "仅支持快手链接");

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const existingToken = extractPhotoToken(current);
    if (existingToken) return existingToken;

    const response = await fetchWithTimeout(
      fetchImpl,
      current.toString(),
      {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": MOBILE_USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
      },
      PAGE_TIMEOUT_MS,
    );
    const location = response.headers.get("location");
    await discardBody(response);

    if (response.status >= 300 && response.status < 400 && location) {
      if (redirect === MAX_REDIRECTS) {
        throw new ApiError(400, "TOO_MANY_REDIRECTS", "快手短链接跳转次数过多");
      }
      current = parseSafeUrl(
        new URL(location, current).toString(),
        isKuaishouHost,
        "快手短链接跳转到了不受支持的网站",
      );
      continue;
    }
    break;
  }

  throw new ApiError(400, "PHOTO_ID_NOT_FOUND", "无法识别快手作品 ID");
}

function findPhoto(state) {
  if (!state || typeof state !== "object") return null;
  for (const entry of Object.values(state)) {
    if (
      entry &&
      typeof entry === "object" &&
      entry.photo &&
      typeof entry.photo === "object" &&
      (entry.photo.manifest || entry.photo.mainMvUrls)
    ) {
      return entry.photo;
    }
  }
  return null;
}

function approvedMediaUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !isAllowedMediaHost(parsed.hostname)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function choosePlayback(photo) {
  const sets = Array.isArray(photo?.manifest?.adaptationSet)
    ? photo.manifest.adaptationSet
    : [];
  const representations = sets.flatMap((set) =>
    Array.isArray(set?.representation) ? set.representation : [],
  );
  const avc = representations
    .filter(
      (item) =>
        String(item?.videoCodec || "").toLowerCase() === "avc" &&
        approvedMediaUrl(item?.url),
    )
    .sort(
      (a, b) =>
        Number(b.height || 0) - Number(a.height || 0) ||
        Number(b.width || 0) - Number(a.width || 0) ||
        Number(b.avgBitrate || 0) - Number(a.avgBitrate || 0),
    )[0];

  if (avc) {
    return {
      mediaUrl: approvedMediaUrl(avc.url),
      width: Number(avc.width || photo.width || 0),
      height: Number(avc.height || photo.height || 0),
      quality: String(avc.qualityType || avc.qualityLabel || ""),
      codec: "avc",
      size: Number(avc.fileSize || 0),
    };
  }

  const mainUrl = (Array.isArray(photo?.mainMvUrls) ? photo.mainMvUrls : [])
    .map((item) => approvedMediaUrl(item?.url))
    .find(Boolean);
  if (mainUrl) {
    return {
      mediaUrl: mainUrl,
      width: Number(photo.width || 0),
      height: Number(photo.height || 0),
      quality: "",
      codec: "avc",
      size: 0,
    };
  }

  throw new ApiError(404, "PLAY_URL_NOT_FOUND", "未找到可播放的快手视频流");
}

export function parseInitialState(html, workId = "") {
  const marker = "window.INIT_STATE = ";
  const start = html.indexOf(marker);
  const end = start >= 0 ? html.indexOf("</script>", start) : -1;
  if (start < 0 || end < 0) {
    throw new ApiError(404, "VIDEO_NOT_AVAILABLE", "快手作品不可见或已失效");
  }

  let state;
  try {
    const json = html
      .slice(start + marker.length, end)
      .trim()
      .replace(/;$/, "");
    state = JSON.parse(json);
  } catch {
    throw new ApiError(502, "INVALID_PLATFORM_RESPONSE", "快手分享页格式异常");
  }

  const photo = findPhoto(state);
  if (!photo) {
    throw new ApiError(404, "VIDEO_NOT_AVAILABLE", "快手作品不可见或已失效");
  }
  const playback = choosePlayback(photo);
  const cover = (Array.isArray(photo.coverUrls) ? photo.coverUrls : [])
    .map((item) => approvedMediaUrl(item?.url))
    .find(Boolean);

  return {
    video: {
      workId,
      photoId: String(photo.photoId || ""),
      title: String(photo.caption || ""),
      owner: String(photo.userName || ""),
      duration: Number(photo.duration || 0),
      width: playback.width,
      height: playback.height,
      cover: cover || "",
    },
    playback,
  };
}

export async function resolveVideo(input, fetchImpl = fetch) {
  const workId = await resolvePhotoToken(input, fetchImpl);
  const pageUrl = new URL(
    `/fw/photo/${encodeURIComponent(workId)}`,
    "https://v.m.chenzhongtech.com",
  );
  const response = await fetchWithTimeout(
    fetchImpl,
    pageUrl,
    {
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    },
    PAGE_TIMEOUT_MS,
  );
  return parseInitialState(await readBoundedText(response), workId);
}

function validRangeHeader(value) {
  return typeof value === "string" && /^bytes=(?:\d+-\d*|-\d+)$/.test(value);
}

async function fetchMediaStream(mediaUrl, request, fetchImpl = fetch) {
  let current = parseSafeUrl(
    mediaUrl,
    isAllowedMediaHost,
    "媒体地址不受支持",
  );

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const headers = new Headers({
      "User-Agent": MOBILE_USER_AGENT,
      Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
      "Accept-Encoding": "identity",
      Referer: "https://v.m.chenzhongtech.com/",
    });
    const range = request.headers.get("range");
    if (validRangeHeader(range)) headers.set("Range", range);

    const response = await fetchWithTimeout(
      fetchImpl,
      current,
      {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        redirect: "manual",
        headers,
      },
      MEDIA_TIMEOUT_MS,
    );
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await discardBody(response);
      if (redirect === MAX_REDIRECTS) {
        throw new ApiError(502, "MEDIA_REDIRECT_LOOP", "视频流跳转次数过多");
      }
      current = parseSafeUrl(
        new URL(location, current).toString(),
        isAllowedMediaHost,
        "视频流跳转到了不受支持的网站",
      );
      continue;
    }
    return response;
  }

  throw new ApiError(502, "MEDIA_NOT_AVAILABLE", "无法获取视频流");
}

function responseHeaders(extra = {}) {
  return new Headers({
    ...SECURITY_HEADERS,
    ...CORS_HEADERS,
    ...extra,
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: responseHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

function noIconResponse() {
  return new Response(null, {
    status: 404,
    headers: responseHeaders({
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    }),
  });
}

function publicVideoUrl(requestUrl, input) {
  const url = new URL(requestUrl);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("url", input);
  return url.toString();
}

async function handleMetadata(request, input) {
  const { video, playback } = await resolveVideo(input);
  return jsonResponse({
    success: true,
    data: {
      ...video,
      quality: playback.quality,
      codec: playback.codec,
      size: playback.size,
      video_url: publicVideoUrl(request.url, input),
    },
  });
}

async function handleVideo(request, input) {
  const { video, playback } = await resolveVideo(input);
  if (playback.delivery === "redirect") {
    return new Response(null, {
      status: 307,
      headers: responseHeaders({
        Location: playback.mediaUrl,
        "Cache-Control": "private, max-age=30",
        "X-Kuaishou-Work-Id": video.workId,
      }),
    });
  }

  const mediaResponse = await fetchMediaStream(playback.mediaUrl, request);
  if (![200, 206].includes(mediaResponse.status)) {
    await discardBody(mediaResponse);
    throw new ApiError(502, "MEDIA_PLATFORM_ERROR", "快手视频流暂时不可用");
  }

  const headers = responseHeaders({
    "Content-Type": mediaResponse.headers.get("content-type") || "video/mp4",
    "Content-Disposition": "inline",
    "Accept-Ranges": mediaResponse.headers.get("accept-ranges") || "bytes",
    "Cache-Control": "private, max-age=60",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Kuaishou-Work-Id": video.workId,
  });
  for (const name of [
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const value = mediaResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(request.method === "HEAD" ? null : mediaResponse.body, {
    status: mediaResponse.status,
    headers,
  });
}

function errorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  }
  console.error("Unhandled Worker error", error);
  return jsonResponse(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后再试" },
    },
    500,
  );
}

const worker = {
  async fetch(request) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: responseHeaders() });
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        return jsonResponse(
          {
            success: false,
            error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 GET 请求" },
          },
          405,
        );
      }

      const url = new URL(request.url);
      if (NO_ICON_PATHS.has(url.pathname)) {
        return noIconResponse();
      }
      if (url.pathname === "/health") {
        return jsonResponse({
          success: true,
          service: "eason-kuaishou-api",
        });
      }

      const input = url.searchParams.get("url")?.trim() || "";
      if (!input) {
        throw new ApiError(400, "MISSING_URL", "请提供 url 参数");
      }
      if (url.pathname === "/api/video") {
        return await handleMetadata(request, input);
      }
      if (["/", "/video", "/play"].includes(url.pathname)) {
        return await handleVideo(request, input);
      }
      return jsonResponse(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "接口不存在" },
        },
        404,
      );
    } catch (error) {
      return errorResponse(error);
    }
  },
};

export default worker;
