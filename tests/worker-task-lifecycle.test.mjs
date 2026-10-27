import assert from "node:assert/strict";
import test from "node:test";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const clients = [
  { name: "文件", path: "file-worker-client", entry: "local-files.worker.ts", timeout: 900000, progress: "field", run: (api, signal, report) => api.runFileWorker({ action: "json-format", text: "{}", compact: false }, signal, report) },
  { name: "OCR", path: "ocr-client", entry: "ocr.worker.ts", timeout: 600000, progress: "field", run: (api, signal, report) => api.recognizeImage(new Blob(["image"]), "chi_sim+eng", signal, report) },
  { name: "图片与音频", path: "raster-worker-client", entry: "raster.worker.ts", timeout: 900000, run: (api, signal) => api.runRasterWorker({ action: "audio", clips: [] }, signal) },
  { name: "科学计算", path: "scientific-client", entry: "scientific-computing.worker.ts", timeout: 20000, run: (api, signal) => api.runScientificCalculation({ mode: "statistics", data: "1,2" }, signal) },
  { name: "Unity", path: "game-asset-client", entry: "game-assets.worker.ts", timeout: 900000, progress: "tagged", run: (api, signal, report) => api.runAssetWorker({ action: "unity-read", file: new File(["package"], "a.unitypackage") }, signal, report) },
  { name: "正则", path: "regex-worker-client", entry: "regex.worker.ts", timeout: 5000, run: (api, signal) => api.runRegex({ pattern: "a", flags: "g", text: "abc" }, signal) },
];
const setup = (client, options) => { const app = workerClientHarness(`app/lib/${client.path}.ts`, options); return { ...app, run: (signal, report) => client.run(app.exports, signal, report) }; };
const observe = (promise) => promise.then((result) => ({ result }), (error) => ({ error }));
const cleanup = (app, controller) => { controller.abort(); for (const timer of [...app.timers.values()]) timer.callback(); };
function released(app) {
  assert.equal(app.workers.at(-1).terminations, 1); assert.equal(app.timers.size, 0);
  for (const handler of ["onmessage", "onerror", "onmessageerror"]) assert.equal(app.workers.at(-1)[handler], null);
}

for (const client of clients) {
  test(`${client.name}：反序列化失败即时结束，不等待原工具超时`, async () => {
    const app = setup(client), controller = new AbortController(), outcome = observe(app.run(controller.signal, () => {}));
    try {
      assert.equal(app.workers[0].options.type, "module"); assert.equal(app.workers[0].url.pathname.endsWith(client.entry), true);
      assert.equal(typeof app.workers[0].onmessageerror, "function"); app.workers[0].onmessageerror();
      assert.match((await outcome).error.message, /消息|传输|读取/); released(app);
    } finally { cleanup(app, controller); }
  });

  test(`${client.name}：空消息和冲突信封不误报成功、不逃出事件处理器`, async () => {
    for (const data of [null, [], {}, { error: 42 }, { result: "ok", error: "conflict" }, { progress: NaN }, { progress: 50, status: {} }, ...(client.progress === "tagged" ? [{ type: "progress", result: "not a result" }] : [])]) {
      const app = setup(client), controller = new AbortController(), outcome = observe(app.run(controller.signal, () => {}));
      try {
        assert.doesNotThrow(() => app.workers[0].onmessage({ data }));
        const reply = await Promise.race([outcome, tick().then(() => ({}))]); assert.ok(reply.error, JSON.stringify(data)); released(app);
      } finally { cleanup(app, controller); }
    }
  });

  test(`${client.name}：成功后迟到事件、失败和取消只清理一次，重试独立`, async () => {
    const app = setup(client), controller = new AbortController(), updates = [], outcome = observe(app.run(controller.signal, (...args) => updates.push(args)));
    const worker = app.workers[0], receive = worker.onmessage, failed = worker.onerror, timer = [...app.timers.values()][0];
    try {
      const result = { valid: true }; receive({ data: { result } }); assert.equal((await outcome).result, result);
      receive({ data: client.progress === "tagged" ? { type: "progress", progress: 20 } : { progress: 20 } }); failed(); timer.callback(); controller.abort();
      assert.equal(updates.length, 0); released(app);
      const retry = observe(app.run(new AbortController().signal, () => {})); app.workers[1].onmessage({ data: { result: "retry" } }); assert.equal((await retry).result, "retry"); released(app);
    } finally { cleanup(app, controller); }
  });

  test(`${client.name}：初始化时取消不发送文件，提前取消不创建线程`, async () => {
    const controller = new AbortController(), app = setup(client, { construct: () => controller.abort(new Error("cancel initialization")) });
    const outcome = observe(app.run(controller.signal, () => {}));
    try {
      const reply = await Promise.race([outcome, tick().then(() => ({}))]); assert.ok(reply.error); assert.equal(app.workers[0].request, undefined); released(app);
      assert.throws(() => app.run(controller.signal, () => {}), /cancel initialization/); assert.equal(app.workers.length, 1);
    } finally { cleanup(app, controller); }
  });

  test(`${client.name}：原超时、引擎错误、发送失败与取消语义保持并清理`, async () => {
    for (const mode of ["timeout", "engine", "load", "post", "construct", "cancel"]) {
      const app = setup(client, { failPost: mode === "post", failLoad: mode === "construct" }), controller = new AbortController();
      const outcome = observe(app.run(controller.signal, () => {}));
      try {
        if (mode === "timeout") { const timer = [...app.timers.values()][0]; assert.equal(timer.delay, client.timeout); timer.callback(); }
        if (mode === "engine") app.workers[0].onmessage({ data: { error: "fixture engine error" } });
        if (mode === "load") app.workers[0].onerror();
        if (mode === "cancel") controller.abort(new Error("fixture cancellation"));
        const reply = await outcome; assert.ok(reply.error);
        if (mode === "cancel") assert.equal(client.name === "科学计算" ? reply.error.name : reply.error.message, client.name === "科学计算" ? "AbortError" : "fixture cancellation");
        if (app.workers.length) released(app); else assert.equal(app.timers.size, 0);
      } finally { cleanup(app, controller); }
    }
  });

  if (client.progress) test(`${client.name}：保留进度协议、限制异常范围，回调抛错也能终止`, async () => {
    const packet = (progress) => client.progress === "tagged" ? { type: "progress", progress, status: "working" } : { progress, status: "working" };
    const app = setup(client), controller = new AbortController(), updates = [], outcome = observe(app.run(controller.signal, (n, text) => updates.push([n, text])));
    try {
      for (const n of [-10, 50, 120]) app.workers[0].onmessage({ data: packet(n) });
      assert.deepEqual(updates, [[0, "working"], [50, "working"], [100, "working"]]); assert.equal(app.workers[0].terminations, 0);
      app.workers[0].onmessage({ data: { result: "done" } }); assert.equal((await outcome).result, "done"); released(app);
      const broken = observe(app.run(new AbortController().signal, () => { throw new Error("consumer failed"); }));
      assert.doesNotThrow(() => app.workers[1].onmessage({ data: packet(30) })); assert.match((await broken).error.message, /consumer failed/); released(app);
    } finally { cleanup(app, controller); }
  });
}

test("图片缓冲仍转移且去重，音频源缓冲保持可编辑；发送失败不会静默重跑", async () => {
  const signal = new AbortController().signal, pixels = new Uint8ClampedArray([1, 2, 3, 255]);
  const app = workerClientHarness("app/lib/raster-worker-client.ts", { post: (request, transfer) => structuredClone(request, { transfer }) });
  const pending = app.exports.runRasterWorker({ action: "pack", width: 1, height: 1, channels: [{ pixels, channel: 0 }, { pixels, channel: 1 }] }, signal);
  assert.equal(pixels.byteLength, 0); assert.equal(app.workers[0].transfer.length, 1); app.workers[0].onmessage({ data: { result: "packed" } }); await pending;
  const samples = new Float32Array([0.1, 0.2]), audio = app.exports.runRasterWorker({ action: "audio", clips: [{ channels: [samples], sampleRate: 44100 }] }, signal);
  assert.equal(app.workers[1].transfer.length, 0); assert.equal(samples.byteLength, 8); app.workers[1].onmessage({ data: { result: "audio" } }); await audio;
});

test("构建传输列表时取消，不发送或分离图片缓冲", async () => {
  const controller = new AbortController(), pixels = new Uint8ClampedArray([1, 2, 3, 255]);
  const app = workerClientHarness("app/lib/raster-worker-client.ts", { post: () => assert.fail("must not send") });
  const request = { action: "pack", width: 1, height: 1, get channels() { controller.abort(); return [{ pixels, channel: 0 }]; } };
  await assert.rejects(app.exports.runRasterWorker(request, controller.signal), { name: "AbortError" });
  assert.equal(pixels.byteLength, 4); assert.equal(app.workers[0].request, undefined); released(app);
});

test("重复 100 次成功、取消与传输失败，计时器和取消监听均归零", async () => {
  const app = setup(clients[0]);
  for (let index = 0; index < 100; index++) {
    const controller = new AbortController(), signal = controller.signal, listeners = new Set(), add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (type, listener, options) => { if (type === "abort") listeners.add(listener); add(type, listener, options); };
    signal.removeEventListener = (type, listener, options) => { if (type === "abort") listeners.delete(listener); remove(type, listener, options); };
    const outcome = observe(app.run(signal, () => {})), worker = app.workers.at(-1);
    if (index % 3 === 0) worker.onmessage({ data: { result: "ok" } });
    else if (index % 3 === 1) controller.abort(); else worker.onmessageerror();
    const reply = await outcome; assert.ok(index % 3 === 0 ? reply.result : reply.error); released(app); assert.equal(listeners.size, 0);
  }
  assert.equal(app.workers.length, 100); assert.ok(app.workers.every((worker) => worker.terminations === 1));
});
