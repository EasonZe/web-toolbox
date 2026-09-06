import type { Cloudflare } from "../types/cloudflare-env";

const origin = "https://tool.easonzhan.xyz";
const codePattern = /^[A-Za-z0-9_-]{8,32}$/;

export function validateDestination(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("请输入4096字以内的完整网址。");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("请输入以http://或https://开头的完整网址。"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只支持不含账号密码的HTTP或HTTPS网址。");
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("[") || host === "0.0.0.0") throw new Error("请填写可以公开访问的网址。");
  if (host === "tool.easonzhan.xyz" && url.pathname.startsWith("/s/")) throw new Error("这个网址已经是本站短链接。");
  return url.href;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 8192) throw new Error("请求内容过长。");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请填写网址。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new Error("请求内容过长。"); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)) as unknown; } catch { throw new Error("请求格式不正确。"); }
}

export async function handleShortLinks(request: Request, env: Pick<Cloudflare.Env, "SHORT_LINKS" | "LINK_LIMITER">): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/s/")) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const code = url.pathname.slice(3);
    if (!codePattern.test(code)) return new Response("短链接不存在", { status: 404 });
    try {
      const row = await env.SHORT_LINKS.prepare("SELECT url, expires_at FROM short_links WHERE code = ?").bind(code).first<{ url: string; expires_at: number | null }>();
      if (!row) return new Response("短链接不存在", { status: 404 });
      if (row.expires_at && row.expires_at <= Date.now()) return new Response("这个短链接已过期，请联系分享者重新生成。", { status: 410 });
      return new Response(null, { status: 302, headers: { Location: row.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    } catch {
      console.error(JSON.stringify({ event: "short_link_lookup_failed" }));
      return new Response("短链接暂时无法访问，请稍后重试。", { status: 503 });
    }
  }
  if (request.method !== "POST") return json({ error: "请使用POST生成短链接。" }, 405);
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== url.origin) return json({ error: "请从本站生成短链接。" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "请求格式不正确。" }, 415);
  try {
    const limit = await env.LINK_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "local" });
    if (!limit.success) return json({ error: "生成太频繁，请一分钟后重试。" }, 429);
    let destination: string;
    let expiresAt: number | null;
    try {
      const body = await readBody(request);
      if (!body || typeof body !== "object" || !("url" in body)) throw new Error("请填写网址。");
      destination = validateDestination(body.url);
      const days = "days" in body ? body.days : 30;
      if (![0, 1, 7, 30, 365].includes(Number(days))) throw new Error("请选择有效期。");
      expiresAt = Number(days) ? Date.now() + Number(days) * 86400000 : null;
    } catch (e) { return json({ error: (e as Error).message }, 400); }
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"[byte & 63]).join("");
      const inserted = await env.SHORT_LINKS.prepare("INSERT OR IGNORE INTO short_links (code, url, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(code, destination, Date.now(), expiresAt).run();
      if (inserted.meta.changes === 1) return json({ url: `${origin}/s/${code}`, destination, expiresAt }, 201);
    }
    return json({ error: "生成失败，请重试。" }, 503);
  } catch {
    console.error(JSON.stringify({ event: "short_link_create_failed" }));
    return json({ error: "短链接服务暂时不可用，请稍后重试。" }, 503);
  }
}
