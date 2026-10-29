import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";

const options = { start: 0, end: 30, min: 90, max: 180, channel: "first" };
function beats(bpm, rate = 8000, seconds = 30) {
  const samples = new Float32Array(rate * seconds);
  for (let start = rate / 4; start < samples.length; start += rate * 60 / bpm) {
    for (let j = 0; j < rate * 0.08 && Math.round(start) + j < samples.length; j++) samples[Math.round(start) + j] = Math.sin(j / rate * 2 * Math.PI * 100) * Math.exp(-j / (rate * 0.012));
  }
  return samples;
}
test("真实 BPM 生产 Worker 使用上游核心估算合成节奏，转移输入并拒绝静音及错误采样", { timeout: 15000 }, async (t) => {
  const root = new URL("../dist/client/_next/static/workers/", import.meta.url);
  const name = (await readdir(root)).find((name) => /^audio-bpm\.worker-.*\.js$/.test(name)); assert.ok(name, "Vite must discover and build a dedicated BPM worker");
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');
    globalThis.self={postMessage(data){parentPort.postMessage(data)}};
    import(${JSON.stringify(new URL(name, root).href)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true})});`, { eval: true });
  t.after(() => worker.terminate()); assert.equal((await once(worker, "message"))[0].ready, true);
  async function run(samples, overrides = {}, sampleRate = 8000) {
    const response = once(worker, "message"); worker.postMessage({ samples, sampleRate, options: { ...options, ...overrides } }, [samples.buffer]);
    assert.equal(samples.byteLength, 0); return (await response)[0];
  }
  for (const tempo of [100, 120, 160]) {
    const value = await run(beats(tempo)); assert.equal(value.error, undefined); assert.ok(Math.abs(value.result.tempo - tempo) < 1, JSON.stringify(value));
    assert.ok(value.result.phase >= 0 && value.result.phase <= 60 / value.result.bpm); assert.equal(value.result.confidence, undefined);
  }
  for (const rate of [11025, 22050, 44100, 48000]) {
    const value = await run(beats(120, rate), {}, rate); assert.equal(value.error, undefined); assert.ok(Math.abs(value.result.tempo - 120) < 1, `${rate} Hz: ${JSON.stringify(value)}`);
  }
  assert.match((await run(new Float32Array(240000))).error, /静音|节奏/);
  const invalid = beats(120); invalid[0] = NaN; assert.match((await run(invalid)).error, /无效采样/);
  assert.match((await run(beats(120), { min: 200, max: 100 })).error, /BPM/);
});

test("BPM 客户端独占线程，成功、取消、超时和消息错误均终止并清理", async () => {
  for (const mode of ["success", "abort", "timeout", "error", "message"]) {
    const app = workerClientHarness("app/lib/audio-bpm-worker-client.ts"), controller = new AbortController(), samples = beats(120);
    const promise = app.exports.estimateBpm(samples, 8000, options, controller.signal), worker = app.workers[0], late = worker.onmessage;
    assert.equal(worker.transfer[0], samples.buffer); assert.equal(worker.request.samples, samples); assert.equal(worker.options.type, "module");
    const timer = [...app.timers.values()][0]; assert.equal(timer.delay, 30000);
    if (mode === "success") { worker.emit({ result: { bpm: 120 } }); assert.equal((await promise).bpm, 120); }
    else {
      if (mode === "abort") controller.abort();
      else if (mode === "timeout") timer.callback();
      else if (mode === "error") worker.onerror({ preventDefault() {} });
      else worker.onmessageerror();
      await assert.rejects(promise);
    }
    late({ data: { result: { bpm: 999 } } }); assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0); assert.equal(worker.onmessage, null);
  }
});
