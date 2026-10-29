import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
test("OCR 只分发实际CPU-WASM与自有线程，运行时文件和安装版本一致", async () => {
  const require = createRequire(import.meta.resolve("@paddleocr/paddleocr-js")), dist = dirname(require.resolve("onnxruntime-web/wasm"));
  for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) assert.deepEqual(await readFile(new URL(`../dist/client/ocr/paddle/0.4.2/ort/${name}`, import.meta.url)), await readFile(join(dist, name)));
  const files = await readdir(new URL("../dist/client/ocr/paddle/0.4.2/ort/", import.meta.url)); assert.deepEqual(files.sort(), ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]);
  const assets = await readdir(new URL("../dist/client/", import.meta.url), { recursive: true }); assert.equal(assets.some((name) => /worker-entry-C9UNuyOJ/.test(name)), false, "未使用的SDK默认Worker不能重复分发");
  const server = await readdir(new URL("../dist/server/", import.meta.url), { recursive: true });
  assert.deepEqual(server.filter((name) => /(?:paddle-ocr\.worker-|id-photo-matte\.worker-|ort-wasm-simd-threaded.*\.wasm$)/.test(name)), [], "浏览器引擎和WASM不可重复附加到服务器部署包");
});
test("新增引擎与编码器分发完整原始许可，保留Clipper与JSBN归属", async () => {
  for (const name of ["PaddleOCR-LICENSE", "ONNX-Runtime-LICENSE", "Boost-1.0-LICENSE.txt", "JSBN-LICENSE.txt"]) assert.deepEqual(await readFile(new URL(`../dist/client/vendor-licenses/${name}`, import.meta.url)), await readFile(new URL(`../licenses/${name}`, import.meta.url)));
  assert.match(await readFile(new URL("../dist/client/vendor-licenses/clipper-lib-original.txt", import.meta.url), "utf8"), /Angus Johnson 2010-2017/);
  assert.match(await readFile(new URL("../dist/client/vendor-licenses/gifenc.txt", import.meta.url), "utf8"), /MIT License/);
});
