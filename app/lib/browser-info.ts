import { toolLimits } from "./resource-limits";

export type UserAgentSource = "pasted-user-agent" | "current-user-agent";
export type UserAgentInfo = {
  source: UserAgentSource;
  userAgent: string;
  browser: { name: string; version: string };
  system: { name: string; version: string; versionName: string };
  engine: { name: string; version: string };
  device: { type: string; vendor: string; model: string };
  caveats: string[];
};

export const userAgentCaveats = [
  "User-Agent 可以被修改或伪造，解析结果不用于身份识别或安全判断。",
  "浏览器可能缩减版本信息；iPad 桌面模式可能报告为 macOS，不能仅凭 User-Agent 确认设备。",
  "未读取高熵 Client Hints、硬件标识或 Canvas 指纹。",
] as const;

/** Bowser is loaded on explicit parsing only; importing this module does not read browser state. */
export async function parseUserAgent(
  text: string,
  source: UserAgentSource = "pasted-user-agent",
  signal?: AbortSignal,
): Promise<UserAgentInfo> {
  signal?.throwIfAborted();
  if (typeof text !== "string" || !text.trim()) throw new Error("请输入 User-Agent。");
  if (text.length > toolLimits.url.chars)
    throw new Error(`User-Agent 超过 ${toolLimits.url.chars.toLocaleString()} 字符，未截断输入。`);
  if (/[\u0000-\u001f\u007f]/u.test(text)) throw new Error("User-Agent 应为单行文本，不能包含换行或控制字符。");
  if (source !== "pasted-user-agent" && source !== "current-user-agent") throw new Error("来源标记无效。");
  const { default: Bowser } = await import("bowser");
  signal?.throwIfAborted();
  const parsed = Bowser.parse(text.trim());
  signal?.throwIfAborted();
  return {
    source,
    userAgent: text.trim(),
    browser: { name: parsed.browser.name ?? "", version: parsed.browser.version ?? "" },
    system: { name: parsed.os.name ?? "", version: parsed.os.version ?? "", versionName: parsed.os.versionName ?? "" },
    engine: { name: parsed.engine.name ?? "", version: parsed.engine.version ?? "" },
    device: { type: parsed.platform.type ?? "", vendor: parsed.platform.vendor ?? "", model: parsed.platform.model ?? "" },
    caveats: [...userAgentCaveats],
  };
}

/** Call only after the user explicitly chooses to read the current UA. */
export function readCurrentUserAgent(): string {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string" || !navigator.userAgent)
    throw new Error("当前环境无法读取 User-Agent，请手动粘贴。");
  return navigator.userAgent;
}

type ApiDefinition = { name: string; paths: readonly string[][]; kind: "function" | "object" };
const apiDefinitions: readonly ApiDefinition[] = [
  { name: "Web Worker", paths: [["Worker"]], kind: "function" },
  { name: "Shared Worker", paths: [["SharedWorker"]], kind: "function" },
  { name: "OffscreenCanvas", paths: [["OffscreenCanvas"]], kind: "function" },
  { name: "createImageBitmap", paths: [["createImageBitmap"]], kind: "function" },
  { name: "WebCodecs · 视频解码", paths: [["VideoDecoder"]], kind: "function" },
  { name: "WebCodecs · 视频编码", paths: [["VideoEncoder"]], kind: "function" },
  { name: "WebCodecs · 音频解码", paths: [["AudioDecoder"]], kind: "function" },
  { name: "WebCodecs · 音频编码", paths: [["AudioEncoder"]], kind: "function" },
  { name: "AudioContext", paths: [["AudioContext"], ["webkitAudioContext"]], kind: "function" },
  { name: "OfflineAudioContext", paths: [["OfflineAudioContext"], ["webkitOfflineAudioContext"]], kind: "function" },
  { name: "MediaRecorder", paths: [["MediaRecorder"]], kind: "function" },
  { name: "麦克风 / 摄像头入口", paths: [["navigator", "mediaDevices", "getUserMedia"]], kind: "function" },
  { name: "剪贴板写入入口", paths: [["navigator", "clipboard", "writeText"]], kind: "function" },
  { name: "文件选择器入口", paths: [["showOpenFilePicker"]], kind: "function" },
  { name: "Web Crypto · SubtleCrypto", paths: [["crypto", "subtle"]], kind: "object" },
  { name: "WebAssembly", paths: [["WebAssembly"]], kind: "object" },
  { name: "SharedArrayBuffer", paths: [["SharedArrayBuffer"]], kind: "function" },
];
export type ApiExposure = "present" | "absent" | "unreadable";
export type BrowserCapabilities = {
  source: "current-browser-api-exposure";
  secureContext: boolean | null;
  crossOriginIsolated: boolean | null;
  apis: { name: string; exposure: ApiExposure }[];
  caveats: string[];
};

function readPath(scope: unknown, path: readonly string[]): unknown {
  let value = scope;
  for (const key of path) {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
    value = Reflect.get(value as object, key);
  }
  return value;
}

function readBoolean(scope: unknown, key: string): boolean | null {
  try { const value = readPath(scope, [key]); return typeof value === "boolean" ? value : null; }
  catch { return null; }
}

/** Presence inspection only: never constructs APIs, starts media, requests permissions, or contacts a service. */
export function inspectBrowserCapabilities(scope: unknown = globalThis): BrowserCapabilities {
  return {
    source: "current-browser-api-exposure",
    secureContext: readBoolean(scope, "isSecureContext"),
    crossOriginIsolated: readBoolean(scope, "crossOriginIsolated"),
    apis: apiDefinitions.map(({ name, paths, kind }) => {
      let unreadable = false;
      for (const path of paths) {
        try {
          const value = readPath(scope, path);
          if (typeof value === kind && value !== null) return { name, exposure: "present" as const };
        } catch { unreadable = true; }
      }
      return { name, exposure: unreadable ? "unreadable" as const : "absent" as const };
    }),
    caveats: [
      "仅检查当前浏览器是否暴露对应 API，不代表实际可用，未测试编解码格式或功能调用。",
      "权限、HTTPS、安全策略、硬件及运行环境仍可能限制实际使用；未请求任何权限。",
      "此报告只描述当前环境，与上方手动粘贴的 User-Agent 无关，不包含其解析结果。",
    ],
  };
}
