import puppeteer from "@cloudflare/puppeteer";
import { createVideoCache, createParserTiming, mediaCacheSeconds, withAbortTimeout, ParserBusyError } from "../../shared/video-cache.js";
var MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
var DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
var REQUEST_TIMEOUT_MS = 1e4;
var MEDIA_HEADER_TIMEOUT_MS = 15e3;
var MAX_REDIRECTS = 5;
var MAX_VIDEO_PAGE_BYTES = 2 * 1024 * 1024;
var METADATA_CACHE_ORIGIN = "https://douyin-api.easonzhan.xyz";
const parserCache = createVideoCache(METADATA_CACHE_ORIGIN, { maxPending: 16 });
let activeBrowsers = 0;
let browserCooldownUntil = 0;
var NO_ICON_PATHS = /* @__PURE__ */ new Set([
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/site.webmanifest",
    "/manifest.webmanifest",
    "/browserconfig.xml"
]);
var ALLOWED_MEDIA_SUFFIXES = [
    "snssdk.com",
    "douyinvod.com",
    "idouyinvod.com",
    "bytecdn.cn",
    "bytecdn.com",
    "amemv.com",
    "pstatp.com",
    "ixiguavideo.com",
    "douyincdn.com",
    "sjxydc.com",
    "sjxysec.com",
    "saxydc.com",
    "saxysec.com",
    "saxyit.com",
    "jomoxc.com",
    "jomoxd.com",
    "ppio.cloud",
    "weilayun.com",
    "volccdn.com",
    "zjcdn.com"
];
var ApiError = class extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
};
function normalizedHost(hostname) {
    return hostname.toLowerCase().replace(/\.$/, "");
}
function isDouyinHost(hostname) {
    const host = normalizedHost(hostname);
    return host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com");
}
function isAllowedMediaHost(hostname) {
    const host = normalizedHost(hostname);
    return ALLOWED_MEDIA_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
function assertDouyinUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new ApiError(400, "INVALID_URL", "\u6CA1\u6709\u627E\u5230\u6709\u6548\u7684\u6296\u97F3\u94FE\u63A5");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new ApiError(400, "INVALID_PROTOCOL", "\u94FE\u63A5\u5FC5\u987B\u4F7F\u7528 http \u6216 https");
    }
    if (parsed.username || parsed.password || parsed.port || !isDouyinHost(parsed.hostname)) {
        throw new ApiError(400, "UNSUPPORTED_HOST", "\u76EE\u524D\u53EA\u652F\u6301 douyin.com \u7684\u6296\u97F3\u94FE\u63A5");
    }
    return parsed;
}
function assertMediaUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new ApiError(502, "INVALID_MEDIA_URL", "\u6296\u97F3\u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u89C6\u9891\u5730\u5740");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !isAllowedMediaHost(parsed.hostname)) {
        throw new ApiError(502, "UNSUPPORTED_MEDIA_HOST", "\u6296\u97F3\u89C6\u9891\u5730\u5740\u4E0D\u53D7\u652F\u6301");
    }
    return parsed;
}
function extractItemId(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        return null;
    }
    const pathnameMatch = parsed.pathname.match(/\/(?:share\/)?video\/(\d{15,22})(?:\/|$)/i);
    if (pathnameMatch) {
        return pathnameMatch[1];
    }
    for (const key of ["aweme_id", "item_id", "modal_id", "vid"]) {
        const candidate = parsed.searchParams.get(key);
        if (candidate && /^\d{15,22}$/.test(candidate)) {
            return candidate;
        }
    }
    return null;
}
function extractCandidate(input) {
    if (typeof input !== "string" || !input.trim()) {
        throw new ApiError(400, "MISSING_URL", "\u8BF7\u5728 url= \u540E\u653E\u5165\u6296\u97F3\u5206\u4EAB\u94FE\u63A5");
    }
    const trimmed = input.trim();
    if (trimmed.length > 4096)
        throw new ApiError(400, "URL_TOO_LONG", "分享链接过长");
    if (/^\d{15,22}$/.test(trimmed)) {
        return { itemId: trimmed, sourceUrl: null };
    }
    const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
    if (!match) {
        throw new ApiError(400, "INVALID_URL", "\u6CA1\u6709\u627E\u5230\u6709\u6548\u7684\u6296\u97F3\u94FE\u63A5");
    }
    const sourceUrl = match[0].replace(/[),.;!?，。；！）》】]+$/g, "");
    assertDouyinUrl(sourceUrl);
    return {
        itemId: extractItemId(sourceUrl),
        sourceUrl
    };
}
function canonicalVideoUrl(itemId) {
    return `https://www.douyin.com/video/${itemId}`;
}
function officialPlayerUrl(itemId, autoplay = false) {
    const player = new URL("https://open.douyin.com/player/video");
    player.searchParams.set("vid", itemId);
    player.searchParams.set("autoplay", autoplay ? "1" : "0");
    return player.toString();
}
async function fetchWithTimeout(url, options, timeoutMs) {
    try {
        return await withAbortTimeout((signal) => fetch(url, { ...options, signal }), timeoutMs, options.signal);
    }
    catch (error) {
        if (error?.name === "AbortError" || error?.name === "TimeoutError") {
            throw new ApiError(504, "PLATFORM_TIMEOUT", "\u8BBF\u95EE\u6296\u97F3\u670D\u52A1\u8D85\u65F6");
        }
        throw new ApiError(502, "PLATFORM_UNAVAILABLE", "\u6682\u65F6\u65E0\u6CD5\u8BBF\u95EE\u6296\u97F3\u670D\u52A1");
    }
}
async function resolveVideoLink(input, context, timing) {
    const candidate = extractCandidate(input);
    if (candidate.itemId) {
        return {
            itemId: candidate.itemId,
            sourceUrl: candidate.sourceUrl,
            resolvedUrl: canonicalVideoUrl(candidate.itemId)
        };
    }
    const source = new URL(candidate.sourceUrl);
    source.hash = "";
    const result = await parserCache.resolve(`reference:${source}`, () => withAbortTimeout((signal) => resolveShortVideoLink(candidate, signal), REQUEST_TIMEOUT_MS), 3600, context, { validate: (value) => /^\d{15,22}$/.test(String(value?.itemId)) });
    timing?.cache("reference", result.state);
    return result.value;
}
async function resolveShortVideoLink(candidate, signal) {
    let currentUrl = candidate.sourceUrl;
    for (let index = 0; index < MAX_REDIRECTS; index += 1) {
        assertDouyinUrl(currentUrl);
        const directId = extractItemId(currentUrl);
        if (directId) {
            return {
                itemId: directId,
                sourceUrl: candidate.sourceUrl,
                resolvedUrl: canonicalVideoUrl(directId)
            };
        }
        const response = await fetchWithTimeout(currentUrl, {
            method: "GET",
            redirect: "manual",
            signal,
            headers: {
                "user-agent": MOBILE_USER_AGENT,
                accept: "text/html,application/xhtml+xml",
                "accept-language": "zh-CN,zh;q=0.9"
            }
        }, REQUEST_TIMEOUT_MS);
        const location = response.headers.get("location");
        if (response.body) {
            await response.body.cancel();
        }
        if (!location) {
            break;
        }
        currentUrl = new URL(location, currentUrl).toString();
    }
    throw new ApiError(422, "VIDEO_ID_NOT_FOUND", "\u6CA1\u6709\u4ECE\u8BE5\u94FE\u63A5\u89E3\u6790\u5230\u89C6\u9891\u4F5C\u54C1 ID\uFF0C\u8BF7\u6362\u4E00\u4E2A\u4ECD\u7136\u6709\u6548\u7684\u516C\u5F00\u5206\u4EAB\u94FE\u63A5");
}
async function readTextLimited(response, maxBytes) {
    if (!response.body) {
        return "";
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                throw new ApiError(502, "VIDEO_PAGE_TOO_LARGE", "\u6296\u97F3\u89C6\u9891\u9875\u9762\u6570\u636E\u5F02\u5E38");
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}
function createNoWatermarkUrl(value) {
    const parsed = assertMediaUrl(value);
    parsed.pathname = parsed.pathname.replace(/\/playwm\/?$/i, "/play/");
    return parsed.toString();
}
function normalizeMediaUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new ApiError(502, "VIDEO_STREAM_NOT_FOUND", "\u6CA1\u6709\u627E\u5230\u89C6\u9891\u64AD\u653E\u6D41");
    }
    return new URL(value.trim(), "https://open.douyin.com/").toString();
}
function parseBrowserVideoMetadata(payload, expectedItemId = "") {
    const groups = Array.isArray(payload?.result) ? payload.result : Array.isArray(payload) ? payload : [];
    const mediaElements = groups.filter((group) => ["video", "video source"].includes(group?.selector?.toLowerCase())).flatMap((group) => Array.isArray(group?.results) ? group.results : []);
    const videoElement = mediaElements.find((result) => result?.attributes?.some((attribute) => attribute?.name?.toLowerCase() === "src" && attribute?.value));
    const source2 = videoElement?.attributes?.find((attribute) => attribute?.name?.toLowerCase() === "src")?.value;
    if (!source2) {
        throw new ApiError(502, "VIDEO_STREAM_NOT_FOUND", "\u6682\u65F6\u6CA1\u6709\u83B7\u53D6\u5230\u8BE5\u89C6\u9891\u64AD\u653E\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    }
    return {
        itemId: String(expectedItemId),
        title: "",
        author: "",
        duration: 0,
        width: Number(videoElement.width) || 0,
        height: Number(videoElement.height) || 0,
        poster: "",
        playUrl: createNoWatermarkUrl(normalizeMediaUrl(source2))
    };
}
function metadataFromRenderedVideo(video, expectedItemId) {
    const source2 = video?.currentSrc || video?.src;
    if (!source2) {
        return null;
    }
    return {
        itemId: String(expectedItemId),
        title: video.title || "",
        author: "",
        duration: Number(video.duration) || 0,
        width: Number(video.width) || 0,
        height: Number(video.height) || 0,
        poster: video.poster || "",
        playUrl: createNoWatermarkUrl(normalizeMediaUrl(source2))
    };
}
function isBrowserRateLimitError(error) {
    const message = String(error?.message || error || "");
    return Number(error?.status) === 429 || /\b429\b|browser time limit exceeded|rate[\s_-]*limit|too many requests/i.test(message);
}
function browserRateLimitError() {
    return new ApiError(429, "BROWSER_RENDER_RATE_LIMITED", "\u5F53\u524D\u89E3\u6790\u989D\u5EA6\u5DF2\u7528\u5B8C\u6216\u8BF7\u6C42\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
}
async function getPuppeteerVideoMetadata(itemId, browserBinding, signal) {
    if (browserCooldownUntil > Date.now())
        throw browserRateLimitError();
    if (activeBrowsers >= 2)
        throw new ParserBusyError();
    activeBrowsers += 1;
    let browser, closing;
    const cancel = () => {
        if (browser && !closing) closing = browser.close().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
        signal.throwIfAborted();
        browser = await puppeteer.launch(browserBinding);
        signal.throwIfAborted();
        const page = await browser.newPage();
        await page.setUserAgent(DESKTOP_USER_AGENT);
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);
        page.on("request", async (request) => {
            try {
                if (["image", "font", "stylesheet"].includes(request.resourceType()))
                    await request.abort();
                else
                    await request.continue();
            }
            catch { /* A cancelled page may already have closed the request. */ }
        });
        const mediaResponses = [];
        let mediaAvailable;
        page.on("response", (response) => {
            try {
                const mediaUrl = response.url();
                const contentType = response.headers()["content-type"] || "";
                const parsed = new URL(mediaUrl);
                if (isAllowedMediaHost(parsed.hostname) && (/^video\//i.test(contentType) || /\.mp4(?:$|\?)/i.test(mediaUrl))) {
                    mediaResponses.push(mediaUrl);
                    mediaAvailable?.();
                }
            }
            catch {
            }
        });
        const targets = [
            officialPlayerUrl(itemId),
            `https://www.douyin.com/light/${itemId}`
        ];
        for (const target of targets) {
            signal.throwIfAborted();
            mediaResponses.length = 0;
            const arrived = new Promise((resolve) => { mediaAvailable = resolve; });
            try {
                const navigationResponse = await page.goto(target, {
                    waitUntil: "domcontentloaded",
                    timeout: 9000
                });
                if (navigationResponse?.status() === 429) {
                    throw browserRateLimitError();
                }
                try {
                    if (!mediaResponses.length)
                        await Promise.race([arrived, page.waitForFunction(() => {
                                const element = document.querySelector("video");
                                const source2 = document.querySelector("video source");
                                return Boolean(element?.currentSrc || element?.src || source2?.src);
                            }, { timeout: 5000 })]);
                }
                catch {
                }
                signal.throwIfAborted();
                for (const frame of page.frames()) {
                    try {
                        const serialized = await frame.evaluate(() => {
                            const element = document.querySelector("video");
                            const source2 = document.querySelector("video source");
                            const currentSrc = element?.currentSrc || element?.src || source2?.src || "";
                            return JSON.stringify({
                                currentSrc,
                                src: element?.src || source2?.src || "",
                                title: document.title || "",
                                duration: Number.isFinite(element?.duration) ? element.duration * 1e3 : 0,
                                width: element?.videoWidth || element?.clientWidth || 0,
                                height: element?.videoHeight || element?.clientHeight || 0,
                                poster: element?.poster || ""
                            });
                        });
                        const metadata = metadataFromRenderedVideo(JSON.parse(serialized), itemId);
                        if (metadata) {
                            return metadata;
                        }
                    }
                    catch {
                    }
                }
                for (const mediaUrl of mediaResponses) {
                    try {
                        const metadata = metadataFromRenderedVideo({ currentSrc: mediaUrl }, itemId);
                        if (metadata) {
                            return metadata;
                        }
                    }
                    catch {
                    }
                }
            }
            catch (error) {
                signal.throwIfAborted();
                if (error instanceof ApiError || isBrowserRateLimitError(error)) {
                    throw error instanceof ApiError ? error : browserRateLimitError();
                }
                console.log(JSON.stringify({
                    event: "browser_target_failed",
                    item_id: itemId,
                    target,
                    reason: error?.name || "UNKNOWN_ERROR"
                }));
            }
        }
    }
    catch (error) {
        signal.throwIfAborted();
        if (error instanceof ApiError) {
            if (error.status === 429)
                browserCooldownUntil = Date.now() + 30000;
            throw error;
        }
        if (error instanceof ParserBusyError)
            throw error;
        if (isBrowserRateLimitError(error)) {
            browserCooldownUntil = Date.now() + 30000;
            throw browserRateLimitError();
        }
        console.log(JSON.stringify({
            event: "puppeteer_fallback_failed",
            item_id: itemId,
            reason: error?.name || "UNKNOWN_ERROR"
        }));
    }
    finally {
        signal.removeEventListener("abort", cancel);
        cancel();
        await closing;
        activeBrowsers -= 1;
    }
    throw new ApiError(502, "VIDEO_STREAM_NOT_FOUND", "\u6682\u65F6\u6CA1\u6709\u83B7\u53D6\u5230\u8BE5\u89C6\u9891\u64AD\u653E\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
}
async function getBrowserVideoMetadata(itemId, browser, parent, context) {
    if (!browser) {
        throw new ApiError(503, "BROWSER_RENDER_UNAVAILABLE", "\u6296\u97F3\u65B0\u7248\u89E3\u6790\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528");
    }
    return withAbortTimeout((signal) => {
        const task = getPuppeteerVideoMetadata(itemId, browser, signal);
        // Keep cleanup alive if the timeout response is sent before browser.close settles.
        context?.waitUntil(task.catch(() => undefined));
        return task;
    }, 26000, parent);
}
function parseVideoMetadata(html, expectedItemId = "") {
    const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!match) {
        throw new ApiError(502, "VIDEO_DATA_NOT_FOUND", "\u6CA1\u6709\u627E\u5230\u6296\u97F3\u89C6\u9891\u6570\u636E");
    }
    let routerData;
    try {
        routerData = JSON.parse(match[1]);
    }
    catch {
        throw new ApiError(502, "INVALID_VIDEO_DATA", "\u6296\u97F3\u89C6\u9891\u6570\u636E\u683C\u5F0F\u65E0\u6548");
    }
    const loaderData = routerData?.loaderData || {};
    const pageData = loaderData["video_(id)/page"] || Object.values(loaderData).find((value) => value?.videoInfoRes);
    const item = pageData?.videoInfoRes?.item_list?.[0];
    if (!item || expectedItemId && String(item.aweme_id) !== String(expectedItemId)) {
        throw new ApiError(404, "VIDEO_NOT_FOUND", "\u8BE5\u516C\u5F00\u89C6\u9891\u4E0D\u5B58\u5728\u6216\u5DF2\u7ECF\u4E0D\u53EF\u89C1");
    }
    const playUrl = item.video?.play_addr?.url_list?.find((value) => typeof value === "string" && value.startsWith("https://"));
    if (!playUrl) {
        throw new ApiError(502, "VIDEO_STREAM_NOT_FOUND", "\u6CA1\u6709\u627E\u5230\u89C6\u9891\u64AD\u653E\u6D41");
    }
    return {
        itemId: String(item.aweme_id),
        title: item.desc || "",
        author: item.author?.nickname || "",
        duration: item.video?.duration || 0,
        width: item.video?.width || 0,
        height: item.video?.height || 0,
        poster: item.video?.cover?.url_list?.[0] || "",
        playUrl: createNoWatermarkUrl(playUrl)
    };
}
async function getVideoMetadata(itemId, env = {}, context, timing, force = false) {
    const result = await parserCache.resolve(`video:${itemId}`, () => withAbortTimeout((signal) => loadVideoMetadata(itemId, env, signal, context), 32000), (value) => mediaCacheSeconds(value.playUrl), context, {
        force, validate(value) {
            try {
                return String(value.itemId) === String(itemId) && Boolean(assertMediaUrl(value.playUrl));
            }
            catch {
                return false;
            }
        },
    });
    timing?.cache("video", result.state);
    return result.value;
}
async function loadVideoMetadata(itemId, env, signal, context) {
    try {
        return await withAbortTimeout(async (pageSignal) => {
            const response = await fetchWithTimeout(`https://www.iesdouyin.com/share/video/${itemId}/`, {
                redirect: "manual",
                signal: pageSignal,
                headers: {
                    "user-agent": MOBILE_USER_AGENT,
                    accept: "text/html,application/xhtml+xml",
                    "accept-language": "zh-CN,zh;q=0.9",
                    referer: "https://www.douyin.com/"
                }
            }, 6000);
            if (!response.ok) {
                if (response.body) {
                    await response.body.cancel();
                }
                if (response.status === 429) throw new ApiError(429, "PLATFORM_BUSY", "抖音请求繁忙，请稍后重试");
                throw new ApiError(502, "VIDEO_PAGE_UNAVAILABLE", "\u65E0\u6CD5\u8BFB\u53D6\u6296\u97F3\u89C6\u9891\u9875\u9762");
            }
            const contentLength = Number(response.headers.get("content-length") || 0);
            if (contentLength > MAX_VIDEO_PAGE_BYTES) {
                if (response.body) {
                    await response.body.cancel();
                }
                throw new ApiError(502, "VIDEO_PAGE_TOO_LARGE", "\u6296\u97F3\u89C6\u9891\u9875\u9762\u6570\u636E\u5F02\u5E38");
            }
            const metadata = parseVideoMetadata(await readTextLimited(response, MAX_VIDEO_PAGE_BYTES), itemId);
            return metadata;
        }, 6000, signal);
    }
    catch (error) {
        signal.throwIfAborted();
        if (error instanceof ApiError && error.status === 429) throw error;
        if (!env.BROWSER) {
            throw error;
        }
        console.log(JSON.stringify({
            event: "browser_parser_fallback",
            item_id: itemId,
            reason: error instanceof ApiError ? error.code : "UNKNOWN_ERROR"
        }));
        const metadata = await getBrowserVideoMetadata(itemId, env.BROWSER, signal, context);
        return metadata;
    }
}
async function fetchMediaStream(mediaUrl, request) {
    return withAbortTimeout(async (signal) => {
        let currentUrl = mediaUrl;
        for (let index = 0; index < MAX_REDIRECTS; index += 1) {
            assertMediaUrl(currentUrl);
            const headers = new Headers({
                "user-agent": MOBILE_USER_AGENT,
                accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
                "accept-encoding": "identity",
                referer: "https://www.iesdouyin.com/"
            });
            const range = request.headers.get("range");
            if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
                headers.set("range", range);
            }
            const ifRange = request.headers.get("if-range");
            if (ifRange && ifRange.length <= 200)
                headers.set("if-range", ifRange);
            const response = await fetchWithTimeout(currentUrl, {
                method: request.method === "HEAD" ? "HEAD" : "GET",
                redirect: "manual",
                signal,
                headers
            }, MEDIA_HEADER_TIMEOUT_MS);
            const location = response.headers.get("location");
            if (response.status >= 300 && response.status < 400 && location) {
                if (response.body) {
                    await response.body.cancel();
                }
                currentUrl = new URL(location, currentUrl).toString();
                continue;
            }
            return response;
        }
        throw new ApiError(502, "TOO_MANY_MEDIA_REDIRECTS", "\u89C6\u9891\u6D41\u8DF3\u8F6C\u6B21\u6570\u8FC7\u591A");
    }, MEDIA_HEADER_TIMEOUT_MS, request.signal);
}
function getInputParam(url) {
    return url.searchParams.get("url") ?? url.searchParams.get("link") ?? url.searchParams.get("video") ?? url.searchParams.get("") ?? "";
}
function addSecurityHeaders(headers) {
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return headers;
}
function jsonResponse(status, body) {
    const headers = addSecurityHeaders(new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Server-Timing, X-Parser-Cache, X-Worker-Revision",
        "Cache-Control": "no-store"
    }));
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers
    });
}
function noIconResponse() {
    return new Response(null, {
        status: 404,
        headers: addSecurityHeaders(new Headers({
            "Cache-Control": "no-store, max-age=0",
            Pragma: "no-cache",
            Expires: "0"
        }))
    });
}
function redirectResponse(location, maxAge = 0) {
    return new Response(null, {
        status: 302,
        headers: addSecurityHeaders(new Headers({
            Location: location,
            "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store"
        }))
    });
}
async function handleApi(request, url, context, timing) {
    const result = await timing.measure("reference", () => resolveVideoLink(getInputParam(url), context, timing));
    const autoplay = url.searchParams.get("autoplay") === "1";
    const input = result.itemId;
    return jsonResponse(200, {
        success: true,
        data: {
            item_id: result.itemId,
            source_url: result.sourceUrl,
            resolved_url: result.resolvedUrl,
            video_url: `${url.origin}/video?url=${encodeURIComponent(input)}`,
            player_url: `${url.origin}/?url=${encodeURIComponent(input)}`,
            official_player_url: officialPlayerUrl(result.itemId, autoplay)
        }
    });
}
async function handleVideo(request, url, env, context, timing) {
    if (request.headers.has("range") && !/^bytes=(?:\d+-\d*|-\d+)$/.test(request.headers.get("range")))
        throw new ApiError(416, "INVALID_RANGE", "Range 请求格式无效");
    const result = await timing.measure("reference", () => resolveVideoLink(getInputParam(url), context, timing));
    let metadata = await timing.measure("resolve", () => getVideoMetadata(result.itemId, env, context, timing));
    let mediaResponse = await timing.measure("media", () => fetchMediaStream(metadata.playUrl, request));
    if (timing.wasCached("video") && ([401, 403, 404, 410].includes(mediaResponse.status) || ([200, 206].includes(mediaResponse.status) && !/^(video\/|application\/octet-stream)/i.test(mediaResponse.headers.get("content-type") || "video/mp4")))) {
        await mediaResponse.body?.cancel();
        metadata = await timing.measure("refresh", () => getVideoMetadata(result.itemId, env, context, timing, true));
        mediaResponse = await timing.measure("media", () => fetchMediaStream(metadata.playUrl, request));
    }
    if (mediaResponse.status !== 200 && mediaResponse.status !== 206) {
        if (mediaResponse.body) {
            await mediaResponse.body.cancel();
        }
        if ([401, 403, 404, 410].includes(mediaResponse.status))
            await parserCache.remove(`video:${result.itemId}`);
        throw new ApiError(502, "VIDEO_STREAM_UNAVAILABLE", "\u6296\u97F3\u89C6\u9891\u6D41\u6682\u4E0D\u53EF\u7528");
    }
    if (!/^(video\/|application\/octet-stream)/i.test(mediaResponse.headers.get("content-type") || "video/mp4")) {
        await mediaResponse.body?.cancel();
        await parserCache.remove(`video:${result.itemId}`);
        throw new ApiError(502, "INVALID_MEDIA_TYPE", "视频 CDN 未返回可播放的视频");
    }
    const headers = addSecurityHeaders(new Headers({
        "Content-Type": mediaResponse.headers.get("content-type") || "video/mp4",
        "Content-Disposition": "inline",
        "Accept-Ranges": mediaResponse.headers.get("accept-ranges") || "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Server-Timing, X-Parser-Cache, X-Worker-Revision",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "private, max-age=60"
    }));
    for (const name of [
        "content-length",
        "content-range",
        "etag",
        "last-modified"
    ]) {
        const value = mediaResponse.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }
    return new Response(request.method === "HEAD" ? null : mediaResponse.body, {
        status: mediaResponse.status,
        headers
    });
}
async function handleRequest(request, env, context, timing) {
    const url = new URL(request.url);
    if (NO_ICON_PATHS.has(url.pathname) && (request.method === "GET" || request.method === "HEAD")) {
        return noIconResponse();
    }
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: addSecurityHeaders(new Headers({
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Range, If-Range",
                "Access-Control-Max-Age": "86400"
            }))
        });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "\u8BE5\u63A5\u53E3\u53EA\u652F\u6301 GET \u8BF7\u6C42");
    }
    if (url.pathname === "/health") {
        return jsonResponse(200, {
            success: true,
            status: "ok",
            runtime: "cloudflare-workers",
            time: ( /* @__PURE__ */new Date()).toISOString()
        });
    }
    if (url.pathname === "/api/video") {
        return handleApi(request, url, context, timing);
    }
    const input = getInputParam(url);
    if (input && (url.pathname === "/" || url.pathname === "/play" || url.pathname === "/video")) {
        return handleVideo(request, url, env, context, timing);
    }
    if (url.pathname === "/redirect") {
        const result = await resolveVideoLink(input, context, timing);
        return redirectResponse(officialPlayerUrl(result.itemId, url.searchParams.get("autoplay") === "1"));
    }
    if (url.pathname === "/embed") {
        const itemId = url.searchParams.get("id") || "";
        if (!/^\d{15,22}$/.test(itemId)) {
            throw new ApiError(400, "INVALID_ITEM_ID", "\u7F3A\u5C11\u6709\u6548\u7684\u89C6\u9891\u4F5C\u54C1 ID");
        }
        return redirectResponse(officialPlayerUrl(itemId, url.searchParams.get("autoplay") === "1"), 300);
    }
    if (url.pathname === "/" && !input) {
        throw new ApiError(400, "MISSING_URL", "\u8BF7\u63D0\u4F9B url \u53C2\u6570");
    }
    throw new ApiError(404, "NOT_FOUND", "\u63A5\u53E3\u4E0D\u5B58\u5728");
}
var worker_default = {
    async fetch(request, env = {}, context) {
        const timing = createParserTiming();
        try {
            const response = await handleRequest(request, env, context, timing);
            const headers = new Headers(response.headers);
            for (const [name, value] of Object.entries(timing.headers()))
                headers.set(name, value);
            return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
        }
        catch (error) {
            const known = error instanceof ApiError || error instanceof ParserBusyError || error?.name === "TimeoutError";
            const status = known ? error.status : 500;
            const code = known ? error.code : "INTERNAL_SERVER_ERROR";
            const message = known ? error.message : "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF";
            console.error(JSON.stringify({
                event: "request_error",
                code,
                status,
                path: new URL(request.url).pathname
            }));
            const response = jsonResponse(status, {
                success: false,
                error: { code, message }
            });
            for (const [name, value] of Object.entries(timing.headers()))
                response.headers.set(name, value);
            if (status === 429 || status === 503)
                response.headers.set("Retry-After", code === "BROWSER_RENDER_RATE_LIMITED" ? "30" : "3");
            return response;
        }
    }
};
export { ApiError, worker_default as default, extractCandidate, extractItemId, getVideoMetadata, isBrowserRateLimitError, parseBrowserVideoMetadata, parseVideoMetadata, resolveVideoLink };
