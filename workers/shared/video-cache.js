// These caches are local to an isolate / Cloudflare data centre, not global locks.
export class ParserBusyError extends Error {
    constructor() {
        super("解析任务繁忙，请稍后重试");
        this.name = "ParserBusyError";
        this.status = 503;
        this.code = "PARSER_BUSY";
    }
}
export async function withAbortTimeout(operation, milliseconds, parent) {
    const controller = new AbortController();
    let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const stop = (reason) => {
        if (controller.signal.aborted)
            return;
        controller.abort(reason);
        rejectDeadline(reason);
    };
    const abort = () => stop(parent.reason || new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(() => {
        const error = new Error("访问平台超时，请稍后重试");
        error.name = "TimeoutError";
        error.status = 504;
        error.code = "PLATFORM_TIMEOUT";
        stop(error);
    }, milliseconds);
    parent?.addEventListener("abort", abort, { once: true });
    try {
        if (parent?.aborted)
            abort();
        return await Promise.race([deadline, Promise.resolve().then(() => {
                controller.signal.throwIfAborted();
                return operation(controller.signal);
            })]);
    }
    finally {
        clearTimeout(timer);
        parent?.removeEventListener("abort", abort);
    }
}
export function mediaCacheSeconds(url, maximum = 300, now = Date.now()) {
    let ttl = maximum;
    const parsed = new URL(url);
    for (const [key, value] of parsed.searchParams) {
        if (!["deadline", "expires", "expire", "expiration", "x-expires", "wstime"].includes(key.toLowerCase()))
            continue;
        const timestamp = Number.parseInt(value, key.toLowerCase() === "wstime" ? 16 : 10);
        if (!Number.isFinite(timestamp) || timestamp <= 0)
            continue;
        const seconds = timestamp > 1e12 ? timestamp / 1000 : timestamp;
        ttl = Math.min(ttl, Math.floor(seconds - now / 1000 - 60));
    }
    return Math.max(0, ttl);
}
export function createVideoCache(origin, { maxEntries = 128, maxPending = 32 } = {}) {
    const memory = new Map(), pending = new Map(), writes = new Map();
    let active = 0;
    const cacheKey = async (key) => {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
        const hex = [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join("");
        return new Request(`${origin}/__parser-cache/v3/${hex}`);
    };
    function remember(key, entry) {
        memory.delete(key);
        memory.set(key, entry);
        while (memory.size > maxEntries)
            memory.delete(memory.keys().next().value);
    }
    async function persist(key, entry, context) {
        const cache = globalThis.caches?.default;
        if (!cache)
            return;
        const body = JSON.stringify(entry);
        if (new TextEncoder().encode(body).byteLength > 65536)
            return;
        const write = (async () => {
            await writes.get(key);
            const request = await cacheKey(key);
            const ttl = Math.ceil((entry.expiresAt - Date.now()) / 1000);
            if (ttl > 0)
                await cache.put(request, new Response(body, { headers: {
                        "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}`,
                    } }));
        })().catch(() => undefined);
        writes.set(key, write);
        write.finally(() => { if (writes.get(key) === write)
            writes.delete(key); });
        if (context?.waitUntil)
            context.waitUntil(write);
        else
            await write;
    }
    async function remove(key) {
        memory.delete(key);
        if (pending.has(key))
            pending.get(key).invalidated = true;
        await writes.get(key);
        const cache = globalThis.caches?.default;
        if (cache) {
            try {
                await withAbortTimeout(async () => cache.delete(await cacheKey(key)), 500);
            }
            catch { /* Best effort. */ }
        }
    }
    return {
        remove,
        async resolve(key, load, ttl, context, { force = false, validate = () => true } = {}) {
            const refreshing = pending.get(key);
            if (force && refreshing?.refresh && !refreshing.invalidated)
                return { value: await refreshing.promise, state: "shared" };
            if (force)
                await remove(key);
            const hit = memory.get(key);
            if (hit && hit.expiresAt > Date.now() && validate(hit.value)) {
                remember(key, hit);
                return { value: hit.value, state: "memory" };
            }
            memory.delete(key);
            const existing = pending.get(key);
            if (existing && !existing.invalidated)
                return { value: await existing.promise, state: "shared" };
            if (active >= maxPending)
                throw new ParserBusyError();
            active += 1;
            const job = { invalidated: false, refresh: force, promise: null };
            job.promise = (async () => {
                const cache = globalThis.caches?.default;
                if (!force && cache) {
                    try {
                        const entry = await withAbortTimeout(async () => {
                            const response = await cache.match(await cacheKey(key));
                            if (!response || Number(response.headers.get("content-length")) > 65536)
                                return null;
                            const text = await response.text();
                            if (text.length > 65536)
                                return null;
                            return JSON.parse(text);
                        }, 500);
                        if (!job.invalidated && entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now() && validate(entry.value)) {
                            remember(key, entry);
                            job.state = "edge";
                            return entry.value;
                        }
                    }
                    catch { /* A cache outage must not disable parsing. */ }
                }
                const value = await load();
                if (!validate(value))
                    throw new Error("INVALID_PARSER_RESULT");
                const seconds = typeof ttl === "function" ? ttl(value) : ttl;
                if (seconds > 0 && !job.invalidated && pending.get(key) === job) {
                    const entry = { value, expiresAt: Date.now() + seconds * 1000 };
                    if (new TextEncoder().encode(JSON.stringify(entry)).byteLength <= 65536) {
                        remember(key, entry);
                        await persist(key, entry, context);
                    }
                }
                return value;
            })();
            pending.set(key, job);
            try {
                return { value: await job.promise, state: job.state || "miss" };
            }
            finally {
                active -= 1;
                if (pending.get(key) === job)
                    pending.delete(key);
            }
        },
    };
}
export function createParserTiming() {
    const started = performance.now(), stages = [], caches = [];
    return {
        cache(name, state) { caches.push(`${name}:${state}`); },
        wasCached(name) { return caches.some((entry) => entry === `${name}:memory` || entry === `${name}:edge`); },
        async measure(name, operation) {
            const start = performance.now();
            try {
                return await operation();
            }
            finally {
                stages.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
            }
        },
        headers() {
            return {
                "Server-Timing": [...stages, `total;dur=${(performance.now() - started).toFixed(1)}`].join(", "),
                "X-Parser-Cache": caches.join(", ") || "none",
                "X-Worker-Revision": "parser-cache-20261015",
                "Timing-Allow-Origin": "*",
            };
        },
    };
}
