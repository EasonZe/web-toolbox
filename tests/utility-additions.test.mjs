import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import JsBarcode from "jsbarcode";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const { generateSecrets, secureIndex } = loadLocalModule("app/lib/secure-generator.ts");
const { inspectJwt, jwtTimes } = loadLocalModule("app/lib/jwt-inspection.ts");
const { evaluateRegex } = loadLocalModule("app/lib/regex-tester.ts");
const { iconPlacement, packIco } = loadLocalModule("app/lib/icon-generator.ts");
const { barcodeOptions, barcodeExamples, barcodeFormats } = loadLocalModule("app/lib/barcode.ts");
const { planBeats, tapTempo, createMetronome } = loadLocalModule("app/lib/metronome.ts");
const password = { mode: "password", count: 100, length: 20, groups: ["lower", "upper", "digits", "symbols"], excludeSimilar: true };
test("密码批量包含全部选中字符类型且排除易混字符", () => {
  const results = generateSecrets(password);
  assert.equal(results.length, 100); assert.equal(new Set(results).size, 100);
  for (const result of results) {
    assert.equal(result.length, 20); assert.match(result, /[a-z]/); assert.match(result, /[A-Z]/); assert.match(result, /\d/); assert.match(result, /[^A-Za-z0-9]/); assert.doesNotMatch(result, /[ilLoO01]/);
  }
  assert.throws(() => generateSecrets({ ...password, groups: [] }), /至少/);
  assert.throws(() => generateSecrets({ ...password, length: NaN }), /长度/);
  assert.throws(() => generateSecrets({ ...password, count: 1.5 }), /数量/);
  assert.throws(() => generateSecrets({ ...password, count: 1001 }), /数量/);
});
test("拒绝采样不将上界余数映射为偏置字符", () => {
  const bytes = [255, 254, 253, 252, 251];
  assert.equal(secureIndex(63, () => bytes.shift()), 62);
  assert.equal(bytes.length, 0);
  assert.throws(() => secureIndex(257));
});
test("UUID 批量保留 RFC v4 版本与变体位", () => {
  const values = generateSecrets({ ...password, mode: "uuid", count: 1000 });
  assert.equal(new Set(values).size, 1000);
  for (const value of values) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
const token = (payload, header = { alg: "none", typ: "JWT" }) => `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.`;
test("JWT 处理 Bearer、中文和未签名令牌但不假装验签", () => {
  const decoded = inspectJwt(`Bearer ${token({ name: "中文😀", exp: 200 })}`);
  assert.equal(decoded.payload.name, "中文😀"); assert.equal(decoded.signature, ""); assert.equal(decoded.header.alg, "none");
  assert.equal(jwtTimes(decoded.payload, 200000)[0].status, "已过期");
  assert.equal(jwtTimes(decoded.payload, 199999)[0].status, "未过期");
  assert.equal(jwtTimes({ nbf: 200 }, 199999)[0].status, "尚未生效");
  assert.match(jwtTimes({ exp: "200" }, 0)[0].status, /无效/);
  assert.match(jwtTimes({ exp: 9e15 }, 0)[0].status, /无效/);
});
test("JWT 拒绝损坏 JSON、非对象声明、无效 Base64 与 JWE", () => {
  for (const input of ["a.b.c.d.e", "a.b.c", "a&.b.c", token(null), token([]), token({}, [])]) assert.throws(() => inspectJwt(input));
});
test("正则返回命名组、未参与组与正确 UTF-16 索引", () => {
  const result = evaluateRegex({ pattern: "(?<name>[a-z]+)=(\\d+)(x)?", flags: "g", text: "😀abc=12 def=3x" });
  assert.equal(result.matches.length, 2); assert.equal(result.matches[0].start, 2); assert.equal(result.matches[0].end, 8);
  assert.deepEqual(result.matches[0].groups, ["abc", "12", null]); assert.deepEqual(result.matches[0].named, { name: "abc" });
});
test("正则零长度 Unicode 匹配前进完整码点，不陷入循环", () => {
  assert.deepEqual(evaluateRegex({ pattern: "(?:)", flags: "gu", text: "😀a" }).matches.map((match) => match.start), [0, 2, 3]);
  assert.equal(evaluateRegex({ pattern: "a", flags: "", text: "aaa" }).matches.length, 1);
  assert.equal(evaluateRegex({ pattern: "a", flags: "y", text: "aa a" }).matches.length, 2);
});
test("正则结果上限可见，非法表达式不返回旧结果", () => {
  const result = evaluateRegex({ pattern: "a", flags: "g", text: "a".repeat(1100) });
  assert.equal(result.matches.length, 1000); assert.equal(result.limited, true);
  assert.equal(evaluateRegex({ pattern: "a", flags: "g", text: "a".repeat(1000) }).limited, false);
  assert.throws(() => evaluateRegex({ pattern: "[", flags: "g", text: "a" }));
  assert.throws(() => evaluateRegex({ pattern: "a", flags: "gg", text: "a" }));
});
test("ICO 非正方形图片保持比例，裁剪以中心为基准", () => {
  assert.deepEqual(iconPlacement(200, 100, 32, "contain"), { x: 0, y: 8, width: 32, height: 16 });
  assert.deepEqual(iconPlacement(200, 100, 32, "cover"), { x: -16, y: 0, width: 64, height: 32 });
  assert.throws(() => iconPlacement(0, 10, 32, "contain"));
});
test("多尺寸 ICO 目录偏移与实际 PNG 内容一致，保留透明通道", async () => {
  const images = await Promise.all([16, 32, 256].map(async (size) => ({ size, png: new Uint8Array(await sharp({ create: { width: size, height: size, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer()) })));
  const ico = packIco(images), header = new DataView(ico.buffer);
  assert.equal(header.getUint16(0, true), 0); assert.equal(header.getUint16(2, true), 1); assert.equal(header.getUint16(4, true), 3);
  for (let i = 0; i < images.length; i++) {
    const entry = 6 + i * 16, length = header.getUint32(entry + 8, true), offset = header.getUint32(entry + 12, true);
    assert.equal(header.getUint8(entry), images[i].size === 256 ? 0 : images[i].size);
    assert.deepEqual(ico.slice(offset, offset + length), images[i].png);
    const decoded = await sharp(ico.slice(offset, offset + length)).raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, images[i].size); assert.equal(decoded.info.channels, 4); assert.equal(decoded.data[3], 128);
  }
  assert.throws(() => packIco([])); assert.throws(() => packIco([images[0], images[0]]));
  assert.throws(() => packIco([{ ...images[0], size: 32 }]), /不一致/);
});
test("六种条码均使用真实 JsBarcode 编码及校验位检查", () => {
  for (const format of barcodeFormats) {
    const value = barcodeExamples[format], options = barcodeOptions(value, format, 100, 2, true), encoded = {};
    JsBarcode(encoded, value, options); assert.ok(encoded.encodings.length, format);
    for (const part of encoded.encodings) assert.match(part.data, /^[01]+$/);
  }
  assert.doesNotThrow(() => barcodeOptions("690123456789", "EAN13", 100, 2, true));
  assert.throws(() => barcodeOptions("6901234567890", "EAN13", 100, 2, true), /校验位/);
  assert.throws(() => barcodeOptions("中文", "CODE128", 100, 2, true));
  assert.throws(() => barcodeOptions("value", "CODE128", NaN, 2, true));
});
test("实际导出的条码 SVG 可解码为图像，条纹与编码一致且文字不能注入元素", async () => {
  const value = '<tag>&"', options = barcodeOptions(value, "CODE128", 100, 2, true), encoded = {};
  JsBarcode(encoded, value, options);
  const document = new DOMImplementation().createDocument("http://www.w3.org/2000/svg", "svg", null), svg = document.documentElement;
  JsBarcode(svg, value, { ...options, xmlDocument: document });
  const xml = new XMLSerializer().serializeToString(svg);
  assert.ok(svg.getElementsByTagName("rect").length > 20); assert.equal(svg.getElementsByTagName("tag").length, 0);
  const decoded = await sharp(Buffer.from(xml)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, channels } = decoded.info, y = 50;
  assert.equal(decoded.data[(y * width + 5) * channels], 255);
  for (let i = 0; i < encoded.encodings[0].data.length; i++) {
    const color = decoded.data[(y * width + 20 + i * 2) * channels];
    assert.equal(color, encoded.encodings[0].data[i] === "1" ? 0 : 255, `条纹 ${i}`);
  }
});
const beatSettings = { bpm: 120, beats: 4, subdivision: 2, volume: 0.5 };
test("节拍调度按 BPM 与细分排程，延迟后跳过积压拍点", () => {
  const plan = planBeats(10, 0, 10, beatSettings); assert.equal(plan.events[0].time, 10); assert.equal(plan.next, 10.25);
  const next = planBeats(plan.next, plan.step, 10.2, beatSettings); assert.equal(next.events[0].step, 1);
  const late = planBeats(1, 5, 100, beatSettings); assert.equal(late.events.length, 1); assert.equal(late.events[0].time, 100.02); assert.equal(late.events[0].step, 0);
  assert.throws(() => planBeats(0, 0, 0, { ...beatSettings, bpm: 0 }));
  assert.equal(tapTempo([1000, 1500, 2000, 2500]), 120); assert.equal(tapTempo([1000]), null);
});
function audioContext(resume = async () => {}) {
  const nodes = [];
  const make = () => { const node = { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { value: 0 }, connect() {}, disconnected: false, disconnect() { this.disconnected = true; }, starts: [], start(time) { this.starts.push(time); }, stops: [], stop(time) { this.stops.push(time); }, onended: null }; nodes.push(node); return node; };
  return { currentTime: 10, state: "running", destination: {}, onstatechange: null, createGain: make, createOscillator: make, resume, closed: 0, async close() { this.closed++; }, nodes };
}
test("节拍器停止会关闭音频并取消已排程声音，重复清理安全", async () => {
  const context = audioContext(), engine = createMetronome(context, beatSettings, () => {}, () => {});
  assert.equal(await engine.start(), true);
  const oscillator = context.nodes.find((node) => node.starts.length); assert.ok(oscillator);
  engine.dispose(); engine.dispose(); assert.equal(context.closed, 1); assert.equal(oscillator.disconnected, true); assert.equal(oscillator.stops.length, 2); assert.equal(context.onstatechange, null);
});
test("开始音频尚未完成时离页，不会在恢复后偷偷播放", async () => {
  let resume; const context = audioContext(() => new Promise((resolve) => { resume = resolve; })), engine = createMetronome(context, beatSettings, () => {}, () => {});
  const starting = engine.start(); engine.dispose(); resume();
  assert.equal(await starting, false); assert.equal(context.nodes.some((node) => node.starts.length), false); assert.equal(context.closed, 1);
});
test("系统音频中断关闭节拍器并通知界面", async () => {
  let interrupted = false; const context = audioContext(), engine = createMetronome(context, beatSettings, () => {}, () => { interrupted = true; });
  await engine.start(); context.state = "suspended"; context.onstatechange();
  assert.equal(interrupted, true); assert.equal(context.closed, 1);
});
