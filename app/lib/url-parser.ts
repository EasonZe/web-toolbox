import { toolLimits } from "./resource-limits";
export type UrlParameter = { key: string; value: string };
function httpUrl(input: string, base?: string) {
  if (!input || input.length > toolLimits.url.chars || /[\u0000-\u001f\u007f]/.test(input) || /%(?![\da-f]{2})/i.test(input)) throw new Error("URL 为空、超长、含控制字符或不完整的百分号编码。");
  let url: URL;
  try { url = new URL(input, base); } catch { throw new Error("URL 无效；相对路径需要提供有效基准 URL。"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP / HTTPS，不解析或执行脚本、data 与本地文件地址。");
  if (url.href.length > toolLimits.url.chars) throw new Error("编码后的 URL 超过 32768 字符，请缩小输入。");
  return url;
}
export function inspectUrl(input: string, base = "") {
  const origin = base.trim() ? httpUrl(base.trim()).href : undefined, url = httpUrl(input.trim(), origin);
  const parameters = Array.from(url.searchParams, ([key, value]) => ({ key, value }));
  if (parameters.length > toolLimits.url.parameters) throw new Error("查询参数超过 1000 项，请分批处理。");
  const credentials = !!(url.username || url.password);
  const rows: [string, string][] = [["协议", url.protocol], ["主机名（ASCII / IDNA）", url.hostname], ["端口", url.port || "默认"], ["来源", url.origin], ["路径（编码形式）", url.pathname], ["查询串（原编码）", url.search], ["片段（原编码）", url.hash], ["包含账户信息", credentials ? "是，请勿公开包含密码的 URL" : "否"]];
  return { href: url.href, parameters, fragment: url.hash.slice(1), credentials, rows };
}
export function editUrl(href: string, parameters: UrlParameter[], fragment: string, removeCredentials = false) {
  const url = httpUrl(href);
  if (parameters.length > toolLimits.url.parameters || fragment.length > toolLimits.url.chars || /[\u0000-\u001f\u007f]/.test(fragment) || /%(?![\da-f]{2})/i.test(fragment)) throw new Error("参数过多或片段编码无效。");
  let length = fragment.length; const search = new URLSearchParams();
  for (const entry of parameters) {
    if (typeof entry.key !== "string" || typeof entry.value !== "string") throw new Error("参数名称和值必须是文本。");
    length += entry.key.length + entry.value.length; if (length > toolLimits.url.chars) throw new Error("参数文本过长。"); search.append(entry.key, entry.value);
  }
  url.search = search.toString(); url.hash = fragment ? `#${fragment}` : "";
  if (removeCredentials) url.username = url.password = "";
  return httpUrl(url.href).href;
}
export function removeTrackingParameters(parameters: UrlParameter[]) { return parameters.filter(({ key }) => !/^utm_|^(fbclid|gclid|dclid|msclkid)$/i.test(key)); }
