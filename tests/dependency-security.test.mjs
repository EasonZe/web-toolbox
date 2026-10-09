import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import vm from "node:vm";
import { Document, Packer, Paragraph } from "docx";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const execFileAsync = promisify(execFile);

function atLeast(version, minimum) {
  const parts = version.split(".").map(Number);
  const expected = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== expected[i]) return parts[i] > expected[i];
  }
  return true;
}

test("依赖锁使用已修复安全告警的补丁版本", async () => {
  const lock = JSON.parse(await read("package-lock.json"));
  const minimums = {
    next: "16.3.8", dompurify: "3.4.16", sharp: "0.35.5",
    "source-map-js": "1.2.2", "fast-uri": "3.1.8", undici: "7.29.1",
    "@huggingface/transformers": "3.8.1", "onnxruntime-node": "1.30.0", "argparse": "2.0.1",
    "@puppeteer/browsers": "3.2.4",
  };
  for (const [name, minimum] of Object.entries(minimums)) {
    const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    assert.ok(entries.length, `${name} 应存在于依赖锁`);
    for (const [path, entry] of entries) {
      assert.ok(atLeast(entry.version, minimum), `${path}@${entry.version} 不能低于修复版本 ${minimum}`);
    }
  }
});

test("浏览器部署资源全部符合 Cloudflare 25 MiB 静态资源限制", async () => {
  const { stat } = await import("node:fs/promises");
  const base = new URL("../dist/client/", import.meta.url);
  const files = await readdir(base, { recursive: true, withFileTypes: true });
  for (const file of files.filter((file) => file.isFile())) {
    const path = join(file.parentPath, file.name);
    assert.ok((await stat(path)).size <= 25 * 1024 * 1024, `${path} 超过 Cloudflare 资源上限`);
  }
});

test("保留的 Transformers.js 能加载升级后的 Node 后端并创建真实 Tensor", async () => {
  const { Tensor, pipeline } = await import("@huggingface/transformers");
  const tensor = new Tensor("float32", Float32Array.of(1, 2, 3), [1, 3]);
  assert.deepEqual(tensor.dims, [1, 3]);
  assert.deepEqual(tensor.tolist(), [[1, 2, 3]]);
  assert.equal(typeof pipeline, "function");
});

test("依赖锁实际移除无补丁的旧格式化、Glob 和浏览器安装依赖链", async () => {
  const lock = JSON.parse(await read("package-lock.json"));
  const forbidden = ["sprintf-js", "braces", "micromatch", "extract-zip", "basic-ftp", "roarr"];
  for (const name of forbidden) {
    assert.equal(Object.keys(lock.packages).some((path) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`), false, `${name} 不能留在依赖锁中`);
  }
  const entries = Object.entries(lock.packages).filter(([path]) => path === "node_modules/fast-glob" || path.endsWith("/node_modules/fast-glob"));
  assert.ok(entries.length);
  for (const [path, entry] of entries) {
    assert.equal(entry.link, true, `${path} 必须使用同仓库 tinyglobby 兼容层`);
    assert.match(entry.resolved, /packages\/glob-compat$/);
  }
  assert.equal(lock.packages["packages/glob-compat"].dependencies.tinyglobby, "0.2.17");
});

test("Mammoth CLI 保留 argparse 2 的兼容 API 并可转换真实中文 DOCX", async (t) => {
  const cli = require.resolve("mammoth/bin/mammoth");
  const { stdout: help } = await execFileAsync(process.execPath, [cli, "--help"], { timeout: 30000 });
  assert.match(help, /docx-path/);
  assert.match(help, /--output-format/);
  const folder = await mkdtemp(join(tmpdir(), "toolbox-mammoth-cli-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, "中文文档.docx");
  await writeFile(file, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("命令行兼容回归 <安全>")] }] })));
  const { stdout } = await execFileAsync(process.execPath, [cli, file], { timeout: 30000 });
  assert.match(stdout, /<p>命令行兼容回归 &lt;安全&gt;<\/p>/);
  const { stdout: markdown } = await execFileAsync(process.execPath, [cli, "--output-format", "markdown", file], { timeout: 30000 });
  assert.match(markdown, /命令行兼容回归/);
});

test("Cloudflare Puppeteer 与升级后的浏览器管理模块可以实际加载", async () => {
  const puppeteer = await import("@cloudflare/puppeteer");
  for (const name of ["launch", "connect", "sessions", "limits", "history"]) {
    assert.equal(typeof puppeteer.default[name], "function", `Cloudflare ${name} API`);
  }
  // Import the Node helper modules too: Cloudflare's remote entry alone does
  // not exercise these names after the browser manager's major upgrade.
  for (const path of ["node/PuppeteerNode.js", "node/ProductLauncher.js", "node/ChromeLauncher.js", "node/FirefoxLauncher.js"]) {
    await assert.doesNotReject(import(`@cloudflare/puppeteer/internal/${path}`));
  }
});

test("Mammoth 浏览器版仍能读取中文 DOCX 并转义正文中的 HTML", async () => {
  const mammoth = require("mammoth/mammoth.browser");
  const doc = new Document({ sections: [{ children: [
    new Paragraph("中文文档安全回归"),
    new Paragraph('<script>alert("test")</script>'),
  ] }] });
  const blob = await Packer.toBlob(doc);
  const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() }, {
    externalFileAccess: false, includeEmbeddedStyleMap: false,
  });
  assert.match(result.value, /中文文档安全回归/);
  assert.match(result.value, /&lt;script&gt;/);
  assert.doesNotMatch(result.value, /<script>/);
});

test("部署产物不包含 sprintf-js 命令行或 Node 安装脚本依赖链", async () => {
  const forbidden = /sprintf-js|sprintf\.(?:parse|format)|global-agent|GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE|onnxruntime-node|ArgumentParser/;
  let checked = 0;
  for (const folder of ["dist/client/", "dist/server/"]) {
    const base = new URL(`../${folder}`, import.meta.url);
    const files = await readdir(base, { recursive: true });
    for (const path of files.filter((path) => /\.(?:[cm]?js)$/.test(path))) {
      assert.doesNotMatch(await readFile(new URL(path.replaceAll("\\", "/"), base), "utf8"), forbidden, `${folder}${path}`);
      checked++;
    }
  }
  assert.ok(checked > 0, "需要先构建，再检查真实部署产物");
});

test("PDF 工作线程在没有 window 的真实 Worker 全局环境中能够初始化", async () => {
  const base = new URL("../dist/client/_next/static/workers/", import.meta.url);
  const files = (await readdir(base)).filter((path) => /^document-pdf\.worker-.+\.js$/.test(path));
  assert.equal(files.length, 1);
  const scope = { Blob, URL, fetch, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  scope.self = scope;
  assert.doesNotThrow(() => vm.runInNewContext(require("node:fs").readFileSync(new URL(files[0], base), "utf8"), scope, { timeout: 5000 }));
  assert.equal(typeof scope.self.onmessage, "function");
});
