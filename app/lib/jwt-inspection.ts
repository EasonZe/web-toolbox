import { jwtDecode } from "jwt-decode";
import { toolLimits } from "./resource-limits";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JWT 头部和载荷必须是 JSON 对象。");
  return value as Record<string, unknown>;
}
export function inspectJwt(input: string) {
  const token = input.trim().replace(/^Bearer\s+/i, "");
  if (token.length > toolLimits.jwt.chars) throw new Error("JWT 内容过长。");
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token)) throw new Error("请输入由三段组成的 JWT；不支持加密的 JWE。");
  try {
    return { header: record(jwtDecode(token, { header: true })), payload: record(jwtDecode(token)), signature: token.split(".")[2] };
  } catch { throw new Error("JWT 的 Base64URL 或 JSON 格式无效。"); }
}
export function jwtTimes(payload: Record<string, unknown>, now: number) {
  return (["iat", "nbf", "exp"] as const).filter((key) => key in payload).map((key) => {
    const value = payload[key];
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value * 1000) > 8.64e15)
      return { key, iso: "", status: "无效时间：必须是 Unix 秒数" };
    return { key, iso: new Date(value * 1000).toISOString(), status: key === "exp" ? (now >= value * 1000 ? "已过期" : "未过期") : key === "nbf" ? (now < value * 1000 ? "尚未生效" : "已到生效时间") : "签发时间" };
  });
}
