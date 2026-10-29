import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { parseUserAgent, readCurrentUserAgent, inspectBrowserCapabilities } = loadLocalModule("app/lib/browser-info.ts");
const { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");
const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("UA 按浏览器、系统、引擎、设备解析，保留来源且不混入本机能力", async () => {
  const result = await parseUserAgent(` ${chrome} `);
  assert.equal(result.source, "pasted-user-agent"); assert.equal(result.userAgent, chrome);
  assert.equal(result.browser.name, "Chrome"); assert.equal(result.browser.version, "130.0.0.0");
  assert.equal(result.system.name, "Windows"); assert.equal(result.engine.name, "Blink"); assert.equal(result.device.type, "desktop");
  assert.equal(result.apis, undefined); assert.equal(result.secureContext, undefined);
  assert.match(result.caveats.join(" "), /伪造/); assert.match(result.caveats.join(" "), /iPad 桌面模式/);
  assert.equal((await parseUserAgent(chrome, "current-user-agent")).source, "current-user-agent");
});

test("UA 覆盖 Edge、Firefox、Safari 手机和 Android，不确定型号保持未识别", async () => {
  const cases = [
    [chrome + " Edg/130.0.0.0", "Microsoft Edge", "Windows", "desktop"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox", "Linux", "desktop"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari", "iOS", "mobile"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Chrome", "Android", "mobile"],
  ];
  for (const [ua, browser, os, type] of cases) {
    const result = await parseUserAgent(ua);
    assert.equal(result.browser.name, browser); assert.equal(result.system.name, os); assert.equal(result.device.type, type);
  }
  const unknown = await parseUserAgent("unrecognized-device");
  assert.equal(unknown.browser.name, ""); assert.equal(unknown.system.name, ""); assert.equal(unknown.device.model, "");
});

test("UA 单行、长度和来源验证不截断，预取消和导入期间取消均不返回结果", async () => {
  for (const text of ["", "  ", "a\nb", "a\rb", "a\u0000b", "a\tb", "a\u007fb", "x".repeat(toolLimits.url.chars + 1)])
    await assert.rejects(parseUserAgent(text));
  await assert.rejects(parseUserAgent(chrome, "invented-source"), /来源/);
  assert.equal((await parseUserAgent("x".repeat(toolLimits.url.chars))).userAgent.length, toolLimits.url.chars);
  const controller = new AbortController(); controller.abort(); await assert.rejects(parseUserAgent(chrome, "pasted-user-agent", controller.signal));
  const late = new AbortController(), result = parseUserAgent(chrome, "pasted-user-agent", late.signal); late.abort(); await assert.rejects(result);
});

test("库导入和纯 UA 解析不会自动读取当前 UA，Bowser 只在显式解析时载入", async () => {
  const nativeRequire = createRequire(import.meta.url), code = ts.transpileModule(await readFile(new URL("../app/lib/browser-info.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let reads = 0, loads = 0;
  const scope = { exports: {}, require(id) { if (id === "bowser") { loads++; return nativeRequire(id); } return { toolLimits }; }, navigator: { get userAgent() { reads++; throw new Error("not requested"); } } };
  vm.runInNewContext(code, scope); assert.equal(reads, 0); assert.equal(loads, 0);
  await scope.exports.parseUserAgent(chrome); assert.equal(reads, 0); assert.equal(loads, 1);
});

test("当前 UA 仅显式读取，缺失环境给出可操作错误", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: chrome } }); assert.equal(readCurrentUserAgent(), chrome);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} }); assert.throws(readCurrentUserAgent, /手动粘贴/);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined }); assert.throws(readCurrentUserAgent, /手动粘贴/);
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator; }
});

test("API 检查只读暴露状态，不构造 API、不读取 UA、不请求权限或调用媒体", () => {
  let calls = 0;
  function forbidden() { calls++; throw new Error("must not call"); }
  const scope = {
    isSecureContext: true, crossOriginIsolated: false,
    Worker: forbidden, OffscreenCanvas: forbidden, VideoDecoder: forbidden, AudioContext: forbidden,
    MediaRecorder: forbidden, showOpenFilePicker: forbidden, WebAssembly: {}, crypto: { subtle: {} },
    navigator: { get userAgent() { throw new Error("must not read UA"); }, mediaDevices: { getUserMedia: forbidden }, clipboard: { writeText: forbidden } },
  };
  const result = inspectBrowserCapabilities(scope), status = (name) => result.apis.find((api) => api.name === name)?.exposure;
  assert.equal(result.source, "current-browser-api-exposure"); assert.equal(result.secureContext, true); assert.equal(result.crossOriginIsolated, false);
  assert.equal(status("Web Worker"), "present"); assert.equal(status("WebCodecs · 视频解码"), "present"); assert.equal(status("WebCodecs · 视频编码"), "absent");
  assert.equal(status("麦克风 / 摄像头入口"), "present"); assert.equal(status("剪贴板写入入口"), "present"); assert.equal(calls, 0);
  assert.equal(result.userAgent, undefined); assert.equal(result.browser, undefined); assert.match(result.caveats.join(" "), /不代表实际可用/);
});

test("API 缺失、错误类型、被限制的 getter 与 Safari 前缀均明确处理", () => {
  const scope = { Worker: {}, VideoDecoder: null, crypto: { subtle: null }, webkitAudioContext() {}, get isSecureContext() { throw new Error("blocked"); }, get OffscreenCanvas() { throw new Error("blocked"); } };
  const result = inspectBrowserCapabilities(scope), status = (name) => result.apis.find((api) => api.name === name)?.exposure;
  assert.equal(status("Web Worker"), "absent"); assert.equal(status("WebCodecs · 视频解码"), "absent"); assert.equal(status("Web Crypto · SubtleCrypto"), "absent");
  assert.equal(status("OffscreenCanvas"), "unreadable"); assert.equal(status("AudioContext"), "present"); assert.equal(result.secureContext, null); assert.equal(result.crossOriginIsolated, null);
  assert.equal(inspectBrowserCapabilities(null).apis.every((api) => api.exposure === "absent"), true);
});
