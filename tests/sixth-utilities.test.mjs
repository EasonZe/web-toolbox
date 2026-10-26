import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { inspectCidr } = loadLocalModule("app/lib/cidr-calculator.ts");
const { inspectUrl, editUrl, removeTrackingParameters } = loadLocalModule("app/lib/url-parser.ts");
const { shadowCss, defaultShadowLayer, defaultGradientOptions, addGradientStop, colorRgba } = loadLocalModule("app/lib/design-generator-options.ts");
const { gradientSamples, gradientCss, gradientLine, gradientSvg, exportGradientPng, gradientDimensions } = loadLocalModule("app/lib/gradient-generator.ts");
const row = (result, name) => result.rows.find(([key]) => key === name)?.[1];
test("IPv4 子网网络/广播、掩码、可用范围与地址归属正确", () => {
  const result = inspectCidr("192.168.1.42/24", "192.168.1.255");
  assert.equal(result.network, "192.168.1.0"); assert.equal(result.last, "192.168.1.255"); assert.equal(result.count, "256"); assert.equal(result.contains, true);
  assert.equal(row(result, "子网掩码"), "255.255.255.0"); assert.equal(row(result, "反掩码"), "0.0.0.255"); assert.equal(row(result, "可用数量（常规约定）"), "254"); assert.equal(row(result, "可用起点"), "192.168.1.1"); assert.equal(row(result, "可用终点"), "192.168.1.254");
  assert.equal(inspectCidr("192.168.1.42/24", "192.168.2.1").contains, false);
});
test("IPv4 /0、/31、/32 不溢出，不把点对点端点标为广播", () => {
  assert.equal(inspectCidr("255.255.255.255/0").count, "4294967296"); assert.equal(inspectCidr("0.0.0.0/0").last, "255.255.255.255");
  const point = inspectCidr("192.0.2.1/31"); assert.equal(row(point, "可用数量（常规约定）"), "2"); assert.equal(row(point, "可用起点"), "192.0.2.0"); assert.equal(row(point, "范围终点 / 广播地址"), undefined);
  const host = inspectCidr("255.255.255.255"); assert.equal(host.prefix, 32); assert.equal(host.network, host.last); assert.equal(row(host, "可用数量（常规约定）"), "1");
});
test("IPv6 精确保留 128 位数量，展开与压缩、映射地址族和范围边界正确", () => {
  const result = inspectCidr("2001:db8::1/64", "2001:db8::ffff:ffff:ffff:ffff");
  assert.equal(result.count, "18446744073709551616"); assert.equal(result.network, "2001:db8::"); assert.equal(result.contains, true);
  assert.equal(row(result, "完整表示"), "2001:0db8:0000:0000:0000:0000:0000:0001"); assert.equal(row(result, "可用数量（常规约定）"), undefined);
  assert.equal(inspectCidr("::/0").count, "340282366920938463463374607431768211456");
  assert.equal(inspectCidr("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128").count, "1");
  assert.equal(inspectCidr("::ffff:192.0.2.1/120", "192.0.2.1").contains, false);
  assert.equal(inspectCidr("2001:db8:0:0:1:0:0:1").network, "2001:db8::1:0:0:1");
});
test("子网拒绝旧式整数/八进制/缩写地址、非法前缀、端口与区域标识", () => {
  for (const input of ["", "127.1", "0x7f000001", "2130706433", "010.0.0.1", "1.2.3.256", "1.2.3.4/33", "1.2.3.4/-1", "1.2.3.4/24junk", "1.2.3.4/01", "1.2.3.4/24/2", "[::1]:80", "fe80::1%eth0", "2001:db8::1/129", "2001:00000::1", "a.example/24"]) assert.throws(() => inspectCidr(input), undefined, input);
  assert.throws(() => inspectCidr("192.0.2.1/24", "bad"));
});
test("URL 拆分按标准处理 IDNA、默认端口和相对路径，不发起请求", () => {
  const result = inspectUrl("https://例子.测试:443/a/../b?x=1#anchor");
  assert.match(result.href, /^https:\/\/xn--fsqu00a.xn--0zwm56d\/b\?x=1#anchor$/); assert.equal(row(result, "端口"), "默认");
  assert.equal(inspectUrl("../a?x=1", "https://example.com/folder/page").href, "https://example.com/a?x=1");
  assert.equal(inspectUrl("//other.example/path", "https://example.com/").href, "https://other.example/path");
});
test("URL 不编辑时保留查询串编码，解码重复键、加号、空键与空值", () => {
  const result = inspectUrl("https://example.com/?q=hello%20world&tag=a&tag=b&plus=%2B&=&bare&bad=%FF");
  assert.match(result.href, /hello%20world/); assert.deepEqual(result.parameters.slice(0, 4), [{ key: "q", value: "hello world" }, { key: "tag", value: "a" }, { key: "tag", value: "b" }, { key: "plus", value: "+" }]);
  assert.deepEqual(result.parameters[4], { key: "", value: "" }); assert.deepEqual(result.parameters[5], { key: "bare", value: "" }); assert.equal(result.parameters[6].value, "�");
  assert.equal(inspectUrl("https://example.com/?q=a+b").parameters[0].value, "a b");
});
test("URL 编辑保留参数顺序和重复键，追踪清理与移除凭据必须显式执行", () => {
  const result = inspectUrl("https://user:password@example.com/?utm_source=app&id=001&id=002&safe=utm_value&fbclid=x#old");
  assert.equal(result.credentials, true);
  const before = JSON.stringify(result.parameters), clean = removeTrackingParameters(result.parameters);
  assert.equal(JSON.stringify(result.parameters), before); assert.deepEqual(clean.map((v) => v.key), ["id", "id", "safe"]);
  const href = editUrl(result.href, [...clean, { key: "__proto__", value: "<script> & +" }], "part%20one", true);
  assert.equal(new URL(href).username, ""); assert.equal(new URL(href).password, ""); assert.deepEqual(new URL(href).searchParams.getAll("id"), ["001", "002"]); assert.equal(new URL(href).searchParams.get("__proto__"), "<script> & +"); assert.equal(new URL(href).hash, "#part%20one");
  assert.match(editUrl(result.href, [{ key: "q", value: "two words" }], ""), /user:password@example.com\/\?q=two\+words$/);
});
test("URL 拒绝脚本、本地地址、非法端口/编码、过长及过多参数", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://example.com:99999/", "https://exa\nmple.com", "https://example.com/?q=%Z1", "relative/path"]) assert.throws(() => inspectUrl(value), undefined, value);
  assert.throws(() => inspectUrl("/a", "file:///tmp/")); assert.throws(() => inspectUrl("https://example.com/" + "x".repeat(32768))); assert.throws(() => inspectUrl("https://example.com/?" + Array(1001).fill("x=1").join("&")), /1000/);
  assert.throws(() => editUrl("https://example.com/", [{ key: "x", value: "x".repeat(32769) }], "")); assert.throws(() => editUrl("https://example.com/", [], "%ZZ"));
});
test("多层阴影按原序生成、支持 inset/负扩展/完全透明且不改输入", () => {
  const layers = [{ ...defaultShadowLayer }, { ...defaultShadowLayer, inset: true, x: -4, opacity: 0, spread: -10 }], original = JSON.stringify(layers), result = shadowCss(layers, 16, "#abc", "#123");
  assert.equal(result.surface, "#AABBCC"); assert.equal(result.background, "#112233"); assert.match(result.value, /^0px 12px 32px -8px rgba\(31, 52, 64, 0.24\),\n  inset -4px/); assert.match(result.value, /rgba\(31, 52, 64, 0\)$/); assert.equal(JSON.stringify(layers), original);
  assert.equal(colorRgba("#fff", 100), "rgba(255, 255, 255, 1)"); assert.match(result.text, /border-radius: 16px;/);
});
test("阴影与颜色输入严格校验，不允许 CSS、SVG 或非有限数注入", () => {
  for (const next of [{ color: "red; } body {" }, { color: "url(x)" }, { blur: -1 }, { x: 201 }, { spread: -101 }, { opacity: NaN }, { inset: "inset;" }]) assert.throws(() => shadowCss([{ ...defaultShadowLayer, ...next }], 10, "#fff", "#eee"));
  assert.throws(() => shadowCss([], 10, "#fff", "#eee")); assert.throws(() => shadowCss(Array(7).fill(defaultShadowLayer), 10, "#fff", "#eee")); assert.throws(() => shadowCss([defaultShadowLayer], NaN, "#fff", "#eee"));
});
test("渐变 RGB / OKLab 插值端点正确，感知中点不同，原色标不会变动", () => {
  const options = { angle: 90, space: "rgb", stops: [{ color: "#000000", position: 0, opacity: 100 }, { color: "#FFFFFF", position: 100, opacity: 100 }] }, original = JSON.stringify(options), samples = gradientSamples(options);
  assert.equal(samples[0].r, 0); assert.equal(samples.at(-1).r, 255); assert.equal(samples[32].r, 128);
  const perceptual = gradientSamples({ ...options, space: "oklab" }); assert.ok(perceptual[32].r > 95 && perceptual[32].r < 105); assert.equal(JSON.stringify(options), original);
  assert.match(gradientCss(options), /^linear-gradient\(90deg, rgba\(0, 0, 0, 1\) 0%/);
});
test("渐变使用透明度预乘，透明黑不会让不透明红过渡发黑", () => {
  for (const space of ["rgb", "oklab"]) {
    const samples = gradientSamples({ angle: 0, space, stops: [{ color: "#FF0000", opacity: 100, position: 0 }, { color: "#000000", opacity: 0, position: 100 }] });
    assert.equal(samples[32].alpha, 0.5); assert.equal(samples[32].r, 255); assert.equal(samples[32].g, 0); assert.equal(samples[32].b, 0);
  }
});
test("渐变保留窄色标节点，添加到最大空隙，非法顺序/颜色/数量被拒绝", () => {
  const stops = addGradientStop(defaultGradientOptions.stops); assert.equal(stops[1].position, 50); assert.equal(stops.length, 3); assert.equal(defaultGradientOptions.stops.length, 2);
  const narrow = [{ color: "#000", opacity: 100, position: 0 }, { color: "#f00", opacity: 100, position: 0.01 }, { color: "#fff", opacity: 100, position: 100 }];
  assert.equal(gradientSamples({ ...defaultGradientOptions, stops: narrow }).find((v) => v.position === 0.0001).r, 255);
  for (const options of [{ angle: NaN }, { space: "unknown" }, { stops: [] }, { stops: Array(9).fill(defaultGradientOptions.stops[0]) }, { stops: [{ color: "#fff", opacity: 100, position: 0 }, { color: "#000", opacity: 100, position: 0 }] }, { stops: [{ color: "</stop><script>", opacity: 100, position: 0 }, defaultGradientOptions.stops[1]] }]) assert.throws(() => gradientSamples({ ...defaultGradientOptions, ...options }));
});
test("渐变角度与矩形方向符合 CSS 约定，方向向量长度考虑宽高", () => {
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-8));
  near(gradientLine(0, 100, 50), [50, 50, 50, 0]); near(gradientLine(90, 100, 50), [0, 25, 100, 25]); near(gradientLine(180, 100, 50), [50, 0, 50, 50]);
  const diagonal = gradientLine(135, 100, 50); near(diagonal, [12.5, -12.5, 87.5, 62.5]);
});
test("生成的 SVG 只有安全图形节点，尺寸/色标/透明度与 CSS 相同", async () => {
  const svg = gradientSvg(defaultGradientOptions, 80, 40); assert.match(svg, /width="80" height="40"/); assert.match(svg, /gradientUnits="userSpaceOnUse"/); assert.doesNotMatch(svg, /script|foreignObject|https?:\/\/(?!www.w3.org)/);
  assert.equal((svg.match(/<stop /g) ?? []).length, gradientSamples(defaultGradientOptions).length);
  const image = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true }); assert.equal(image.info.width, 80); assert.equal(image.info.height, 40);
});
function canvasRuntime(mode = "normal", controller) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document"), canvases = [];
  const document = { createElement() { const inner = createCanvas(1, 1), canvas = { get width() { return inner.width; }, set width(v) { this.w = v; inner.width = Math.max(1, v); }, get height() { return inner.height; }, set height(v) { this.h = v; inner.height = Math.max(1, v); }, getContext() { return mode === "no-context" ? null : inner.getContext("2d"); }, async toBlob(callback) { const bytes = await inner.encode("png"); controller?.abort(); callback(mode === "empty" ? null : new Blob([bytes], { type: "image/png" })); } }; canvases.push(canvas); return canvas; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  return { canvases, restore() { if (saved) Object.defineProperty(globalThis, "document", saved); else delete globalThis.document; } };
}
test("真实 PNG 和 SVG 渐变像素一致，输出原尺寸和透明通道，画布释放", async () => {
  const runtime = canvasRuntime();
  try {
    const options = { ...defaultGradientOptions, angle: 90, space: "rgb", stops: [{ color: "#FF0000", opacity: 100, position: 0 }, { color: "#0000FF", opacity: 50, position: 100 }] };
    const blob = await exportGradientPng(options, 100, 40, new AbortController().signal);
    const png = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), svg = await sharp(Buffer.from(gradientSvg(options, 100, 40))).ensureAlpha().raw().toBuffer();
    assert.equal(png.info.width, 100); assert.equal(png.info.height, 40); assert.ok(png.data[0] > 250); assert.ok(png.data[(99 * 4) + 2] > 250); assert.ok(png.data[99 * 4 + 3] >= 127 && png.data[99 * 4 + 3] <= 130);
    for (let i = 0; i < svg.length; i++) assert.ok(Math.abs(svg[i] - png.data[i]) <= 3, `channel ${i}`);
    assert.ok(runtime.canvases.every((c) => c.w === 0 && c.h === 0));
  } finally { runtime.restore(); }
});
test("渐变 PNG 取消/编码失败/无上下文均不返回成品，移动预算明确拒绝", async () => {
  for (const mode of ["cancel", "empty", "no-context"]) {
    const controller = new AbortController(), runtime = canvasRuntime(mode, mode === "cancel" ? controller : undefined);
    try { await assert.rejects(exportGradientPng(defaultGradientOptions, 10, 10, controller.signal)); assert.ok(runtime.canvases.every((c) => c.w === 0 && c.h === 0)); } finally { runtime.restore(); }
  }
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try { Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone" } }); assert.throws(() => gradientDimensions(8192, 2048), /16 MP/); assert.doesNotThrow(() => gradientDimensions(4000, 4000)); } finally { if (saved) Object.defineProperty(globalThis, "navigator", saved); else delete globalThis.navigator; }
  for (const dims of [[8193, 1], [0, 1], [100.5, 10], [8192, 8192]]) assert.throws(() => gradientDimensions(...dims));
});
test("新增库锁定版本与完整原始许可随构建分发，不纳入缺失许可的 Nzh", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")); assert.equal(pkg.dependencies.nzh, undefined);
  for (const [name, version] of [["ipaddr.js", "2.5.0"], ["culori", "4.0.2"]]) { assert.equal(pkg.dependencies[name], version); assert.equal(await readFile(new URL(`../dist/client/vendor-licenses/${name}.txt`, import.meta.url), "utf8"), await readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), "utf8")); }
});
