import { connect } from "cloudflare:sockets";
import { createVideoCache, createParserTiming, mediaCacheSeconds, withAbortTimeout, ParserBusyError } from "../../shared/video-cache.js";
import type { CacheContext } from "../../shared/video-cache.js";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const BILIBILI_HOSTS = ["bilibili.com", "b23.tv", "bili2233.cn"];
const MEDIA_HOSTS = [
    "bilivideo.com",
    "bilivideo.cn",
    "akamaized.net",
    "bytecdn.cn",
    "ksyuncdn.com",
];
const API_TIMEOUT_MS = 12000;
const MEDIA_TIMEOUT_MS = 20000;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const parserCache = createVideoCache("https://bilibili-api.easonzhan.xyz");
type ParserTiming = ReturnType<typeof createParserTiming>;
let socketPreferredUntil = 0;
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, Content-Disposition, Server-Timing, X-Parser-Cache, X-Worker-Revision",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
};
type BilibiliReference = {
    bvid: string;
    page: number;
    source: string;
};
type PageListPayload = {
    code?: number;
    message?: string;
    data?: Array<{
        cid?: number;
        page?: number;
        part?: string;
        duration?: number;
    }>;
};
type PlayUrlPayload = {
    code?: number;
    message?: string;
    data?: {
        quality?: number;
        format?: string;
        timelength?: number;
        durl?: Array<{
            url?: string;
            backup_url?: string[];
            size?: number;
            length?: number;
        }>;
    };
};
export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
        this.name = "ApiError";
    }
}
function isHostOrSubdomain(hostname: string, suffix: string) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return host === suffix || host.endsWith(`.${suffix}`);
}
function isAllowedHost(hostname: string, suffixes: string[]) {
    return suffixes.some((suffix) => isHostOrSubdomain(hostname, suffix));
}
function isAllowedMediaUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port && isAllowedHost(url.hostname, MEDIA_HOSTS);
    }
    catch {
        return false;
    }
}
function parsePage(value: string | null) {
    if (!value)
        return 1;
    if (!/^\d+$/.test(value)) {
        throw new ApiError(400, "INVALID_PAGE", "分P编号无效");
    }
    const page = Number(value);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
        throw new ApiError(400, "INVALID_PAGE", "分P编号无效");
    }
    return page;
}
function trimUrlPunctuation(value: string) {
    return value.replace(/[),.;!?，。；！）》】\]]+$/g, "");
}
export function extractVideoReference(input: string) {
    const text = String(input || "").trim();
    if (!text)
        throw new ApiError(400, "MISSING_URL", "请提供 Bilibili 分享链接");
    if (text.length > 4096)
        throw new ApiError(400, "URL_TOO_LONG", "分享链接过长");
    const directBvid = text.match(/^BV[0-9A-Za-z]{10,20}$/i)?.[0];
    if (directBvid) {
        return {
            bvid: directBvid,
            page: 1,
            source: `https://www.bilibili.com/video/${directBvid}/`,
        };
    }
    const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
    for (const match of matches) {
        const candidate = trimUrlPunctuation(match);
        let url: URL;
        try {
            url = new URL(candidate);
        }
        catch {
            continue;
        }
        if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !isAllowedHost(url.hostname, BILIBILI_HOSTS))
            continue;
        url.hash = "";
        const bvid = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10,20})/i)?.[1] || "";
        return { bvid, page: parsePage(url.searchParams.get("p")), source: url.toString() };
    }
    throw new ApiError(400, "UNSUPPORTED_URL", "没有找到有效的 Bilibili 视频链接或 BV 号");
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(code)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function resolveReference(input: string, context?: CacheContext, timing?: ParserTiming): Promise<BilibiliReference> {
    const reference = extractVideoReference(input);
    if (reference.bvid)
        return reference;
    const cached = await parserCache.resolve(`reference:${reference.source}`, () => withAbortTimeout((signal) => resolveShortReference(reference, signal), API_TIMEOUT_MS), 3600, context, { validate: (value) => Boolean(value && typeof value === "object" && "bvid" in value && /^BV[0-9A-Za-z]{10,20}$/.test(String(value.bvid))) });
    timing?.cache("reference", cached.state);
    return cached.value;
}
async function resolveShortReference(reference: BilibiliReference, signal: AbortSignal): Promise<BilibiliReference> {
    let current = new URL(reference.source);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        if (current.protocol !== "https:" || current.username || current.password || (current.port && current.port !== "443") || !isAllowedHost(current.hostname, BILIBILI_HOSTS)) {
            throw new ApiError(400, "UNSUPPORTED_REDIRECT", "短链接跳转到了不受支持的网站");
        }
        const response = await fetch(current, {
            method: "GET",
            redirect: "manual",
            signal,
            headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" },
        });
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (response.status >= 300 && response.status < 400 && location) {
            if (redirect === MAX_REDIRECTS) {
                throw new ApiError(400, "TOO_MANY_REDIRECTS", "短链接跳转次数过多");
            }
            current = new URL(location, current);
            if (current.protocol !== "https:" || current.username || current.password || current.port || !isAllowedHost(current.hostname, BILIBILI_HOSTS))
                throw new ApiError(400, "UNSUPPORTED_REDIRECT", "短链接跳转到了不受支持的网站");
            const bvid = current.pathname.match(/\/video\/(BV[0-9A-Za-z]{10,20})/i)?.[1];
            if (bvid) {
                return { bvid, page: parsePage(current.searchParams.get("p")), source: current.toString() };
            }
            continue;
        }
        break;
    }
    throw new ApiError(400, "VIDEO_ID_NOT_FOUND", "无法从链接中识别 BV 号");
}
function findSequence(value: Uint8Array, sequence: number[], from = 0) {
    outer: for (let index = from; index <= value.length - sequence.length; index += 1) {
        for (let part = 0; part < sequence.length; part += 1) {
            if (value[index + part] !== sequence[part])
                continue outer;
        }
        return index;
    }
    return -1;
}
function joinChunks(chunks: Uint8Array[], totalLength: number) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
function decodeChunkedBody(body: Uint8Array) {
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    let offset = 0;
    while (offset < body.length) {
        const lineEnd = findSequence(body, [13, 10], offset);
        if (lineEnd < 0)
            throw new Error("INVALID_CHUNKED_RESPONSE");
        const size = Number.parseInt(decoder.decode(body.subarray(offset, lineEnd)).split(";", 1)[0], 16);
        if (!Number.isFinite(size) || size < 0)
            throw new Error("INVALID_CHUNK_SIZE");
        if (size === 0)
            return joinChunks(chunks, totalLength);
        const chunkStart = lineEnd + 2;
        const chunkEnd = chunkStart + size;
        if (chunkEnd + 2 > body.length || body[chunkEnd] !== 13 || body[chunkEnd + 1] !== 10) {
            throw new Error("TRUNCATED_CHUNKED_RESPONSE");
        }
        chunks.push(body.slice(chunkStart, chunkEnd));
        totalLength += size;
        if (totalLength > MAX_JSON_BYTES)
            throw new Error("API_RESPONSE_TOO_LARGE");
        offset = chunkEnd + 2;
    }
    throw new Error("TRUNCATED_CHUNKED_RESPONSE");
}
function socketResponseComplete(bytes: Uint8Array) {
    const headerEnd = findSequence(bytes, [13, 10, 13, 10]);
    if (headerEnd < 0)
        return false;
    const headers = new TextDecoder().decode(bytes.subarray(0, headerEnd));
    const body = bytes.subarray(headerEnd + 4);
    const length = headers.match(/\r\ncontent-length:\s*(\d+)/i)?.[1];
    if (length)
        return body.length >= Number(length);
    if (/\r\ntransfer-encoding:\s*chunked/i.test(headers)) {
        let offset = 0;
        while (offset < body.length) {
            const end = findSequence(body, [13, 10], offset);
            if (end < 0)
                return false;
            const size = Number.parseInt(new TextDecoder().decode(body.subarray(offset, end)).split(";", 1)[0], 16);
            if (!Number.isFinite(size) || size < 0)
                throw new Error("INVALID_CHUNK_SIZE");
            if (size === 0)
                return body.length >= end + 4;
            offset = end + 2 + size + 2;
            if (offset > body.length)
                return false;
        }
    }
    return false;
}
async function fetchJsonViaSocket<T>(url: URL, referer: string, stage: string, parent?: AbortSignal): Promise<T> {
    return withAbortTimeout(async (signal) => {
        const socket = connect({ hostname: url.hostname, port: 443 }, { secureTransport: "on", allowHalfOpen: true });
        const cancel = () => { void socket.close().catch(() => undefined); };
        signal.addEventListener("abort", cancel, { once: true });
        try {
            signal.throwIfAborted();
            await withTimeout(socket.opened, API_TIMEOUT_MS, `${stage}_SOCKET_OPEN_TIMEOUT`);
            const writer = socket.writable.getWriter();
            const request = [
                `GET ${url.pathname}${url.search} HTTP/1.1`,
                `Host: ${url.hostname}`,
                "Accept: application/json, text/plain, */*",
                "Accept-Encoding: identity",
                "Accept-Language: zh-CN,zh;q=0.9",
                `Referer: ${referer}`,
                `User-Agent: ${USER_AGENT}`,
                "Connection: close",
                "",
                "",
            ].join("\r\n");
            await withTimeout(writer.write(new TextEncoder().encode(request)), API_TIMEOUT_MS, `${stage}_SOCKET_WRITE_TIMEOUT`);
            writer.releaseLock();
            const reader = socket.readable.getReader();
            const chunks: Uint8Array[] = [];
            let totalLength = 0;
            while (true) {
                const result = await withTimeout(reader.read(), API_TIMEOUT_MS, `${stage}_SOCKET_READ_TIMEOUT`);
                if (result.done)
                    break;
                if (!result.value)
                    continue;
                totalLength += result.value.byteLength;
                if (totalLength > MAX_JSON_BYTES)
                    throw new Error("API_RESPONSE_TOO_LARGE");
                chunks.push(result.value);
                if (socketResponseComplete(joinChunks(chunks, totalLength))) {
                    void reader.cancel().catch(() => undefined);
                    break;
                }
            }
            const responseBytes = joinChunks(chunks, totalLength);
            const headerEnd = findSequence(responseBytes, [13, 10, 13, 10]);
            if (headerEnd < 0)
                throw new Error(`${stage}_INVALID_SOCKET_RESPONSE_${totalLength}`);
            const decoder = new TextDecoder();
            const headerText = decoder.decode(responseBytes.subarray(0, headerEnd));
            const headerLines = headerText.split("\r\n");
            const status = Number(headerLines[0]?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1] || 0);
            const responseHeaders = new Headers();
            for (const line of headerLines.slice(1)) {
                const separator = line.indexOf(":");
                if (separator > 0)
                    responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
            }
            if (status < 200 || status >= 300)
                throw new Error(`${stage}_SOCKET_HTTP_${status || "INVALID"}`);
            const length = responseHeaders.get("content-length");
            const rawBody = responseBytes.subarray(headerEnd + 4, length ? headerEnd + 4 + Number(length) : undefined);
            const body = responseHeaders.get("transfer-encoding")?.toLowerCase().includes("chunked")
                ? decodeChunkedBody(rawBody)
                : rawBody;
            return JSON.parse(decoder.decode(body)) as T;
        }
        finally {
            signal.removeEventListener("abort", cancel);
            await socket.close().catch(() => undefined);
        }
    }, API_TIMEOUT_MS, parent);
}
async function fetchJson<T>(url: URL, referer: string, stage: string, parent: AbortSignal): Promise<T> {
    if (socketPreferredUntil > Date.now()) {
        try {
            return await fetchJsonViaSocket<T>(url, referer, stage, parent);
        }
        catch (error) {
            parent.throwIfAborted();
            socketPreferredUntil = 0;
            if (error instanceof ParserBusyError)
                throw error;
        }
    }
    const result = await withAbortTimeout(async (signal) => {
        const response = await fetch(url, {
            signal,
            headers: {
                Accept: "application/json, text/plain, */*",
                "Accept-Language": "zh-CN,zh;q=0.9",
                Referer: referer,
                "User-Agent": USER_AGENT,
            },
        });
        if (response.ok) {
            if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) {
                await response.body?.cancel();
                throw new Error("API_RESPONSE_TOO_LARGE");
            }
            const reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                if (reader)
                    while (true) {
                        const part = await reader.read();
                        if (part.done)
                            break;
                        size += part.value.byteLength;
                        if (size > MAX_JSON_BYTES)
                            throw new Error("API_RESPONSE_TOO_LARGE");
                        chunks.push(part.value);
                    }
            }
            finally {
                await reader?.cancel().catch(() => undefined);
            }
            return { data: JSON.parse(new TextDecoder().decode(joinChunks(chunks, size))) as T };
        }
        const status = response.status;
        await response.body?.cancel();
        if (status === 429)
            throw new ApiError(429, "PLATFORM_BUSY", "B站请求繁忙，请稍后重试");
        if (status !== 403 && status !== 412)
            throw new Error(`${stage}_HTTP_${status}`);
        return { data: undefined };
    }, API_TIMEOUT_MS, parent);
    if (result.data !== undefined)
        return result.data;
    const data = await fetchJsonViaSocket<T>(url, referer, stage, parent);
    socketPreferredUntil = Date.now() + 300000;
    return data;
}
export async function resolveVideo(input: string, context?: CacheContext, timing?: ParserTiming, force = false) {
    const reference = await resolveReference(input, context, timing);
    const result = await parserCache.resolve(`video:${reference.bvid}:${reference.page}`, () => withAbortTimeout((signal) => resolvePlatformVideo(reference, signal), 25000), (value) => mediaCacheSeconds(value.mediaUrl), context, {
        force, validate: (value) => Boolean(value && typeof value === "object" && "mediaUrl" in value && "bvid" in value && "page" in value && value.bvid === reference.bvid && value.page === reference.page && isAllowedMediaUrl(String(value.mediaUrl))),
    });
    timing?.cache("video", result.state);
    return result.value;
}
async function resolvePlatformVideo(reference: BilibiliReference, signal: AbortSignal) {
    const referer = `https://www.bilibili.com/video/${reference.bvid}/`;
    const pageListUrl = new URL("https://api.bilibili.com/x/player/pagelist");
    pageListUrl.searchParams.set("bvid", reference.bvid);
    pageListUrl.searchParams.set("jsonp", "jsonp");
    const pagePayload = await fetchJson<PageListPayload>(pageListUrl, referer, "PAGE_LIST", signal);
    if (pagePayload.code !== 0 || !pagePayload.data?.length) {
        throw new ApiError(404, "VIDEO_NOT_AVAILABLE", pagePayload.message || "视频不存在、不可见或已失效");
    }
    const page = pagePayload.data.find((item) => Number(item.page) === reference.page)
        || pagePayload.data[reference.page - 1];
    if (!page?.cid)
        throw new ApiError(404, "PAGE_NOT_FOUND", "指定的分P不存在");
    const playUrl = new URL("https://api.bilibili.com/x/player/playurl");
    for (const [key, value] of Object.entries({
        bvid: reference.bvid,
        cid: String(page.cid),
        qn: "64",
        fnval: "1",
        fnver: "0",
        fourk: "0",
        platform: "html5",
        high_quality: "1",
    }))
        playUrl.searchParams.set(key, value);
    const playPayload = await fetchJson<PlayUrlPayload>(playUrl, referer, "PLAY_URL", signal);
    if (playPayload.code !== 0 || !playPayload.data) {
        throw new ApiError(404, "PLAY_URL_NOT_AVAILABLE", playPayload.message || "暂无可用播放地址");
    }
    const entries = playPayload.data.durl || [];
    const candidates = entries.flatMap((entry) => [entry.url, ...(entry.backup_url || [])]);
    const mediaUrl = candidates.find((candidate): candidate is string => Boolean(candidate && isAllowedMediaUrl(candidate)));
    if (!mediaUrl)
        throw new ApiError(502, "PLAY_URL_NOT_FOUND", "未找到可播放的视频流");
    const entry = entries.find((item) => item.url === mediaUrl) || entries[0];
    return {
        bvid: reference.bvid,
        page: reference.page,
        cid: Number(page.cid),
        part: String(page.part || ""),
        duration: Number(page.duration || 0),
        quality: Number(playPayload.data.quality || 0),
        format: String(playPayload.data.format || ""),
        size: Number(entry?.size || 0),
        length: Number(entry?.length || playPayload.data.timelength || 0),
        mediaUrl,
        referer,
    };
}
function validRangeHeader(value: string | null) {
    return !value || /^bytes=(?:\d+-\d*|-\d+)$/.test(value);
}
async function fetchMedia(mediaUrl: string, referer: string, request: Request) {
    return withAbortTimeout(async (signal) => {
        let current = new URL(mediaUrl);
        for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
            if (!isAllowedMediaUrl(current.toString())) {
                throw new ApiError(502, "UNSUPPORTED_MEDIA_HOST", "媒体地址不受支持");
            }
            const headers = new Headers({
                Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "identity",
                Referer: referer,
                Origin: "https://www.bilibili.com",
                "User-Agent": USER_AGENT,
            });
            const range = request.headers.get("range");
            if (range)
                headers.set("Range", range);
            const ifRange = request.headers.get("if-range");
            if (ifRange && ifRange.length <= 200)
                headers.set("If-Range", ifRange);
            const response = await fetch(current, {
                method: request.method === "HEAD" ? "HEAD" : "GET",
                redirect: "manual",
                signal,
                headers,
            });
            const location = response.headers.get("location");
            if (response.status >= 300 && response.status < 400 && location) {
                await response.body?.cancel();
                if (redirect === MAX_REDIRECTS)
                    throw new ApiError(502, "MEDIA_REDIRECT_LOOP", "视频流跳转次数过多");
                current = new URL(location, current);
                continue;
            }
            return response;
        }
        throw new ApiError(502, "MEDIA_NOT_AVAILABLE", "无法获取视频流");
    }, MEDIA_TIMEOUT_MS, request.signal);
}
function responseHeaders(extra: Record<string, string> = {}) {
    return new Headers({ ...CORS_HEADERS, ...extra });
}
function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload, null, 2), {
        status,
        headers: responseHeaders({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        }),
    });
}
function publicVideoUrl(requestUrl: string, input: string) {
    const url = new URL(requestUrl);
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("url", input);
    return url.toString();
}
async function handleMetadata(request: Request, input: string, context: CacheContext | undefined, timing: ParserTiming) {
    const result = await timing.measure("resolve", () => resolveVideo(input, context, timing));
    return jsonResponse({
        success: true,
        data: {
            bvid: result.bvid,
            cid: result.cid,
            page: result.page,
            part: result.part,
            duration: result.duration,
            quality: result.quality,
            format: result.format,
            size: result.size,
            length: result.length,
            video_url: publicVideoUrl(request.url, result.referer + (result.page > 1 ? `?p=${result.page}` : "")),
        },
    });
}
async function handleVideo(request: Request, input: string, context: CacheContext | undefined, timing: ParserTiming) {
    if (!validRangeHeader(request.headers.get("range"))) {
        throw new ApiError(416, "INVALID_RANGE", "Range 请求格式无效");
    }
    let result = await timing.measure("resolve", () => resolveVideo(input, context, timing));
    let upstream = await timing.measure("media", () => fetchMedia(result.mediaUrl, result.referer, request));
    if (timing.wasCached("video") && ([401, 403, 404, 410].includes(upstream.status) || ([200, 206].includes(upstream.status) && !/^(video\/|application\/octet-stream)/i.test(upstream.headers.get("content-type") || "video/mp4")))) {
        await upstream.body?.cancel();
        result = await timing.measure("refresh", () => resolveVideo(input, context, timing, true));
        upstream = await timing.measure("media", () => fetchMedia(result.mediaUrl, result.referer, request));
    }
    if (upstream.status !== 200 && upstream.status !== 206) {
        const status = upstream.status;
        await upstream.body?.cancel();
        if ([401, 403, 404, 410].includes(status))
            await parserCache.remove(`video:${result.bvid}:${result.page}`);
        throw new ApiError(status === 416 ? 416 : 502, status === 416 ? "RANGE_NOT_SATISFIABLE" : "MEDIA_UPSTREAM_ERROR", status === 416 ? "请求的视频字节范围不可用" : `Bilibili 视频流返回 HTTP ${status}`);
    }
    if (!/^(video\/|application\/octet-stream)/i.test(upstream.headers.get("content-type") || "video/mp4")) {
        await upstream.body?.cancel();
        await parserCache.remove(`video:${result.bvid}:${result.page}`);
        throw new ApiError(502, "INVALID_MEDIA_TYPE", "视频 CDN 未返回可播放的视频");
    }
    const headers = responseHeaders({
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `inline; filename="bilibili-${result.bvid}-p${result.page}.mp4"`,
        "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
        "Cache-Control": "private, max-age=60",
        "X-Bilibili-Bvid": result.bvid,
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value)
            headers.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers,
    });
}
function errorResponse(error: unknown) {
    if (error instanceof ParserBusyError || (error instanceof Error && "status" in error && error.status === 504)) {
        return jsonResponse({ success: false, error: { code: "code" in error ? error.code : "PLATFORM_TIMEOUT", message: error.message } }, error instanceof ParserBusyError ? 503 : 504);
    }
    if (error instanceof ApiError) {
        return jsonResponse({ success: false, error: { code: error.code, message: error.message } }, error.status);
    }
    const detail = error instanceof Error ? error.message : "UNKNOWN";
    console.error(JSON.stringify({ event: "bilibili_api_error", detail }));
    return jsonResponse({ success: false, error: { code: detail.replace(/[^A-Z0-9_]/g, "_").slice(0, 120), message: "B站解析暂时失败，请稍后重试" } }, 502);
}
const worker = {
    async fetch(request: Request, _env?: unknown, context?: CacheContext) {
        const timing = createParserTiming();
        try {
            if (request.method === "OPTIONS")
                return new Response(null, { status: 204, headers: responseHeaders() });
            if (request.method !== "GET" && request.method !== "HEAD") {
                return jsonResponse({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 GET、HEAD 请求" } }, 405);
            }
            const url = new URL(request.url);
            if (url.pathname === "/health") {
                const response = jsonResponse({ success: true, service: "eason-bilibili-api" });
                for (const [name, value] of Object.entries(timing.headers())) response.headers.set(name, value);
                return response;
            }
            if (["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"].includes(url.pathname)) {
                return new Response(null, { status: 404, headers: responseHeaders({ "Cache-Control": "no-store" }) });
            }
            const input = url.searchParams.get("url")?.trim() || "";
            if (!input)
                throw new ApiError(400, "MISSING_URL", "请提供 url 参数");
            const response = url.pathname === "/api/video" ? await handleMetadata(request, input, context, timing)
                : ["/", "/video", "/play"].includes(url.pathname) ? await handleVideo(request, input, context, timing) : null;
            if (response) {
                const headers = new Headers(response.headers);
                for (const [name, value] of Object.entries(timing.headers()))
                    headers.set(name, value);
                return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
            }
            return jsonResponse({ success: false, error: { code: "NOT_FOUND", message: "接口不存在" } }, 404);
        }
        catch (error) {
            const response = errorResponse(error);
            for (const [name, value] of Object.entries(timing.headers()))
                response.headers.set(name, value);
            if (response.status === 429 || response.status === 503)
                response.headers.set("Retry-After", "3");
            return response;
        }
    },
};
export default worker;
