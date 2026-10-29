import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
test("真实生产栅格 Worker 处理扫描灰度/阈值并转移缓冲，原调整接口仍可用", { timeout: 10000 }, async (t) => {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url), name = (await readdir(root)).find((name) => /^raster\.worker-.*\.js$/.test(name)); assert.ok(name);
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    globalThis.self = { postMessage(data, options) { const transfer = options?.transfer ?? []; parentPort.postMessage({ ...data, transferCount: transfer.length }, transfer); } };
    import(${JSON.stringify(new URL(name, root).href)}).then(() => { parentPort.on("message", data => self.onmessage({ data })); parentPort.postMessage({ ready: true }); });
  `, { eval: true }); t.after(() => worker.terminate()); assert.equal((await once(worker, "message"))[0].ready, true);
  async function run(data) { const receive = once(worker, "message"); worker.postMessage(data, data.pixels ? [data.pixels.buffer] : []); return (await receive)[0]; }
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const gray = await run({ action: "scan", pixels, mode: "grayscale", threshold: 100 }); assert.equal(pixels.byteLength, 0); assert.equal(gray.transferCount, 1); assert.deepEqual([...gray.result], [76, 76, 76, 255, 150, 150, 150, 255]);
  const black = await run({ action: "scan", pixels: gray.result, mode: "threshold", threshold: 100 }); assert.deepEqual([...black.result], [0, 0, 0, 255, 255, 255, 255, 255]);
  assert.match((await run({ action: "scan", pixels: new Uint8ClampedArray(4), mode: "bad", threshold: 100 })).error, /参数/);
  const normal = await run({ action: "normal", pixels: new Uint8ClampedArray([127, 127, 127, 255]), width: 1, height: 1, strength: 1, flipX: false, flipY: false, wrap: true }); assert.equal(normal.error, undefined); assert.equal(normal.result.length, 4);
});
