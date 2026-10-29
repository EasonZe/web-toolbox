import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { createElement } from "react";
import { deflateSync } from "fflate";
import { SaxesParser } from "saxes";
import ts from "typescript";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ogPackagePath = require.resolve("@vercel/og/package.json");
const ogRequire = createRequire(ogPackagePath);
const satoriEntry = ogRequire.resolve("satori");
const satoriRequire = createRequire(satoriEntry);
const fflateEntry = satoriRequire.resolve("fflate");
function packageAt(entry, name) {
  let directory = dirname(entry);
  while (dirname(directory) !== directory) {
    try {
      const value = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      if (value.name === name) return { ...value, directory };
    } catch (cause) {
      if (cause.code !== "ENOENT") throw cause;
    }
    directory = dirname(directory);
  }
  throw new Error(`没有找到 ${name} 的实际安装元数据。`);
}
const satoriPackage = packageAt(satoriEntry, "satori");
const fflatePackage = packageAt(fflateEntry, "fflate");
const bundles = ["index.node.js", "index.edge.js"].map((name) => {
  const text = readFileSync(join(dirname(ogPackagePath), "dist", name), "utf8");
  return { name, text, tree: ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) };
});

test("实际 OG 安全依赖链固定在修复版本，而非仅更改根级同名依赖", () => {
  assert.equal(JSON.parse(readFileSync(ogPackagePath, "utf8")).version, "1.0.3");
  assert.equal(satoriPackage.version, "0.33.5");
  assert.equal(fflatePackage.version, "0.7.5");
  for (const { name, text } of bundles) assert.match(text, /satori@0\.33\.5\//, `${name} 必须实际捆绑修复后的 Satori`);
});

function xmlElements(text) {
  const elements = [], texts = [], parser = new SaxesParser({ xmlns: true });
  parser.on("error", (cause) => { throw cause; });
  parser.on("opentag", (tag) => elements.push(tag));
  parser.on("text", (value) => texts.push(value));
  parser.write(text).close();
  return { elements, texts };
}
function bundledSerializer({ name, tree }) {
  const statements = [...tree.statements];
  const validator = statements.find((node) => ts.isFunctionDeclaration(node) && node.getText(tree).includes("Invalid XML"));
  assert.ok(validator?.name, `${name} 缺少 XML 名称校验实现`);
  const serializer = statements.find((node) => ts.isFunctionDeclaration(node) && node.getText(tree).includes("Object.entries") && node.getText(tree).includes(`${validator.name.text}(`));
  assert.ok(serializer?.name, `${name} 序列化必须接入名称校验，不能只包含未调用的补丁代码`);
  const start = statements.indexOf(serializer);
  const end = statements.findIndex((node, index) => index > statements.indexOf(validator) && ts.isFunctionDeclaration(node) && node.getText(tree).includes("import_escape_html.default") && !node.getText(tree).includes('typeof '));
  assert.ok(end > start, `${name} 缺少文本转义函数`);
  // Execute the actual small serializer/validator fragment from the published
  // bundle, without importing its unrelated HarfBuzz/Node runtime bootstrap.
  const source = statements.slice(start, end + 1).map((node) => node.getText(tree)).join("\n");
  return new vm.Script(`(() => { ${source}; return ${serializer.name.text}; })()`, { filename: name }).runInNewContext({ import_escape_html: { default: satoriRequire("escape-html") } }, { timeout: 1000 });
}

test("OG Node/Edge 实际内联序列化转义属性并拒绝非法 XML 名称", () => {
  for (const bundle of bundles) {
    const serialize = bundledSerializer(bundle), payload = 'blue" onload="alert(1)';
    const output = serialize("rect", { fill: payload, title: "<script>&'\"", width: 10 });
    const { elements } = xmlElements(output);
    assert.equal(elements.length, 1);
    assert.equal(elements[0].attributes.fill.value, payload);
    assert.equal(elements[0].attributes.onload, undefined);
    assert.equal(elements[0].attributes.title.value, "<script>&'\"");
    assert.throws(() => serialize("rect><script", {}), /Invalid XML element name/);
    assert.throws(() => serialize("rect", { 'fill" onload': "blue" }), /Invalid XML attribute name/);
  }
});

test("OG 1.0.3 的内联 fflate 仅保留 DEFLATE，不包含受影响 ZIP64 解析路径", () => {
  const zipSignatures = new Set([0x02014b50, 0x04034b50, 0x06054b50, 0x06064b50, 0x07064b50]);
  for (const { name, text, tree } of bundles) {
    // This exact upstream artifact still labels its inflater 0.7.3. The npm
    // override does not rewrite that bundle; verify CVE-specific code absence.
    const begin = text.indexOf("// node_modules/.pnpm/fflate@0.7.3/");
    assert.ok(begin >= 0, `${name} 的包内容变化后需要重新审查，而不是仅依赖 audit 元数据`);
    const end = text.indexOf("// node_modules/", begin + 8);
    const segment = text.slice(begin, end);
    assert.match(segment, /function inflateSync2\(data, out\)/);
    assert.doesNotMatch(segment, /unzip|z64e|Zip64/i);
    function visit(node) {
      if (ts.isNumericLiteral(node)) assert.equal(zipSignatures.has(Number(node.text)), false, `${name} 不应包含 ZIP 目录头解析签名`);
      if (ts.isIdentifier(node)) assert.doesNotMatch(node.text, /^(?:unzipSync|z64e|Unzip.*)$/);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
});

test("Satori 实际解析到 fflate 0.7.5，保留 WOFF 所需 inflateSync(data, out) 接口", () => {
  assert.equal(fflatePackage.version, "0.7.5");
  const patched = satoriRequire("fflate");
  for (const text of ["font-table", "abcdef".repeat(10000), "😀 中文 WOFF".repeat(100)]) {
    const bytes = new TextEncoder().encode(text), compressed = deflateSync(bytes), out = new Uint8Array(bytes.length);
    assert.equal(patched.inflateSync(compressed, out), out);
    assert.deepEqual(out, bytes);
  }
});

function malformedZip64() {
  const bytes = new Uint8Array(145), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, 0xffffffff, true); // ZIP64 size sentinel, but no extra field.
  view.setUint16(28, 1, true); bytes[46] = 65;
  view.setUint32(47, 0x06064b50, true);
  view.setUint32(79, 1, true); view.setUint32(95, 0, true);
  view.setUint32(103, 0x07064b50, true); view.setUint32(111, 47, true);
  view.setUint32(123, 0x06054b50, true);
  view.setUint16(131, 1, true); view.setUint32(139, 0xffffffff, true);
  return bytes;
}
test("实际可导入 fflate 拒绝缺少 ZIP64 字段的坏包，隔离线程保证回归不会挂住测试", { timeout: 10000 }, async () => {
  assert.equal(fflatePackage.version, "0.7.5");
  const worker = new Worker(`
    const { parentPort, workerData } = require("node:worker_threads");
    try { require(workerData.entry).unzipSync(workerData.bytes); parentPort.postMessage({ accepted: true }); }
    catch (cause) { parentPort.postMessage({ error: cause.message }); }
  `, { eval: true, workerData: { entry: fflateEntry, bytes: malformedZip64() } });
  let timer;
  try {
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("ZIP64 解析未及时退出。")), 3000);
      worker.once("message", resolve); worker.once("error", reject);
    });
    assert.equal(result.accepted, undefined);
    assert.match(result.error, /invalid zip data/i);
  } finally { clearTimeout(timer); await worker.terminate(); }
});

test("真实修复版 Satori 使用本地字体绘制文字与 SVG，嵌入 title 不能注入额外元素", async (t) => {
  // Test the real installed rendering engine without claiming that bare ESM
  // @vercel/og bootstrap or Cloudflare asset resolution has been verified here.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("此回归不得下载网络字体或资源。"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const { default: satori } = await import(pathToFileURL(join(satoriPackage.directory, "dist/index.js")).href);
  const fonts = [{ name: "Geist", data: readFileSync(join(dirname(ogPackagePath), "dist/Geist-Regular.ttf")), weight: 400, style: "normal" }];
  const plain = await satori(createElement("div", { style: { display: "flex", fontSize: 24 } }, "Toolbox"), { width: 240, height: 80, fonts });
  assert.ok(xmlElements(plain).elements.some((tag) => tag.name === "path"));
  const payload = '</title><rect width="96" height="96" fill="red"/><title>';
  const input = createElement("svg", { width: 96, height: 96, viewBox: "0 0 96 96" }, createElement("rect", { width: 96, height: 96, fill: "blue" }), createElement("title", null, payload));
  const output = await satori(input, { width: 96, height: 96, fonts });
  const image = xmlElements(output).elements.find((tag) => tag.name === "image");
  assert.ok(image);
  const href = image.attributes.href.value;
  assert.match(href, /^data:image\/svg\+xml;utf8,/);
  const inner = xmlElements(decodeURIComponent(href.slice(href.indexOf(",") + 1)));
  assert.deepEqual(inner.elements.map((tag) => tag.name), ["svg", "rect", "title"]);
  assert.equal(inner.texts.join(""), payload);
  await assert.rejects(satori(createElement("div", { style: { display: "flex", _inheritedClipPathId: "malicious" } }, "Toolbox"), { width: 240, height: 80, fonts }), /Invalid style property/);
});

test("实际 beta.13 官方插件使 ImageResponse 使用本地字体和 WASM 绘制 PNG，无全局 require 或网络补偿", { timeout: 30000 }, async (t) => {
  const vinextEntry = fileURLToPath(import.meta.resolve("vinext"));
  assert.equal(packageAt(vinextEntry, "vinext").version, "1.0.0-beta.13");
  const plugins = join(dirname(vinextEntry), "plugins");
  const { createOgHarfbuzzPlugin } = await import(pathToFileURL(join(plugins, "og-harfbuzz.js")).href);
  const { createOgInlineFetchAssetsPlugin } = await import(pathToFileURL(join(plugins, "og-assets.js")).href);
  assert.equal(typeof createOgHarfbuzzPlugin, "function");
  const harfbuzz = createOgHarfbuzzPlugin();
  // Serve-mode Node transformation only reads the matching installed hb.wasm;
  // it does not write callback modules or alter the repository/node_modules.
  harfbuzz.configResolved({ root: process.cwd(), command: "serve" });
  const entry = join(dirname(ogPackagePath), "dist/index.node.js");
  const transformed = harfbuzz.transform.handler.call({ error(message) { throw new Error(message); } }, bundles.find((bundle) => bundle.name === "index.node.js").text, entry);
  assert.ok(transformed?.code);
  assert.match(transformed.code, /__vi_hb_instantiateWasm/);
  const assets = createOgInlineFetchAssetsPlugin();
  assets.configResolved({ root: process.cwd(), command: "serve", resolve: { alias: [] } });
  const inlined = await assets.transform.handler(transformed.code, entry);
  assert.ok(inlined?.code, "必须由实际官方插件解析字体与栅格 WASM，而不是缺文件后跳过");
  assert.doesNotMatch(inlined.code, /fs2\.readFileSync\(\s*fileURLToPath\(new URL\("\.\/(?:Geist-Regular\.ttf|resvg\.wasm)"/);
  // data: module imports have no package-resolution base. Resolve only the
  // unchanged optional sharp specifier as Vite would; no renderer code is mocked.
  assert.match(inlined.code, /import\("sharp"\)/);
  const code = inlined.code.replaceAll('import("sharp")', `import(${JSON.stringify(pathToFileURL(require.resolve("sharp")).href)})`);
  const originalFetch = globalThis.fetch, originalRequire = Object.getOwnPropertyDescriptor(globalThis, "require");
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Yoga may fetch its already embedded data: WASM; this performs no I/O.
    if (/^data:application\/(?:wasm|octet-stream);base64,/.test(target)) return originalFetch(input, init);
    requests++;
    throw new Error(`此回归不得请求网络字体或 WASM：${String(target).slice(0, 100)}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const { ImageResponse } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const input = createElement("div", { style: { display: "flex", width: "100%", height: "100%", background: "white", color: "black", fontSize: 28 } },
    createElement("svg", { width: 48, height: 48, viewBox: "0 0 48 48" }, createElement("rect", { width: 48, height: 48, fill: "#2d6cdf" })),
    createElement("span", null, "Toolbox"));
  const response = new ImageResponse(input, { width: 240, height: 80 });
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const sharp = require("sharp"), metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 240); assert.equal(metadata.height, 80);
  const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
  const offset = (16 * 240 + 16) * 4;
  assert.deepEqual([...pixels.subarray(offset, offset + 4)], [45, 108, 223, 255], "真实内嵌 SVG 必须绘制出蓝色图形");
  assert.ok(pixels.some((value, index) => index % 4 === 0 && value < 80 && pixels[index + 1] < 80 && pixels[index + 2] < 80 && pixels[index + 3] > 0), "本地 Geist 字体必须绘制出实际文字，而不只是空白 PNG");
  assert.equal(requests, 0);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "require"), originalRequire, "不得伪造 global.require 来掩盖上游 ESM 问题");
});
