import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import test from "node:test";
test("生产图片 Worker 真正执行调色并转移结果，旧通道打包仍可用", { timeout: 10000 }, async (t) => {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url), name = (await readdir(root)).find((name) => /^raster\.worker-.*\.js$/.test(name)); assert.ok(name);
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    globalThis.self = { postMessage(data, options) { parentPort.postMessage({ ...data, transferred: options?.transfer.length ?? 0 }, options?.transfer); } };
    import(${JSON.stringify(new URL(name, root).href)}).then(() => { parentPort.on("message", data => self.onmessage({ data })); parentPort.postMessage("ready"); });
  `, { eval: true });
  t.after(() => worker.terminate()); assert.equal((await once(worker, "message"))[0], "ready");
  const reply = once(worker, "message"); worker.postMessage({ action: "adjust", pixels: new Uint8ClampedArray([10, 50, 200, 128]), width: 1, height: 1, settings: { brightness: 0, contrast: 0, saturation: 100, warmth: 0, grayscale: 0, invert: 100 } });
  const result = (await reply)[0]; assert.deepEqual(result.result, new Uint8ClampedArray([245, 205, 55, 128])); assert.equal(result.transferred, 1);
  const oldReply = once(worker, "message"); worker.postMessage({ action: "pack", width: 1, height: 1, channels: [10, 20, 30, 255].map((constant) => ({ pixels: null, channel: 0, constant, invert: false })) });
  assert.deepEqual((await oldReply)[0].result, new Uint8ClampedArray([10, 20, 30, 255]));
});
