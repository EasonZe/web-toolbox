import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
const one = (tree, type) => allElements(tree, (node) => node.type === type)[0];
const button = (tree, title) => { const result = allElements(tree, (node) => node.type === "button" && content(node) === title)[0]; assert.ok(result, title); return result; };
function control(tree, label) {
  const parent = allElements(tree, (node) => node.type === "label" && content(node.props.children[0]) === label)[0]; assert.ok(parent, label);
  return allElements(parent, (node) => ["input", "select"].includes(node.type))[0];
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const estimate = { bpm: 120, tempo: 120.125, phase: 0.25, alternatives: [60.0625, 240.25] };
function fixture({ deferMetadata = false, deferSource = false, deferEstimate = false, metadataError = false, sourceError = false, estimateError = false } = {}) {
  const metadataCalls = [], sourceCalls = [], estimateCalls = [], metadataPending = [], sourcePending = [], estimatePending = [];
  function makeTask() {
    let generation = 0, controller;
    return {
      result: null, busy: false, error: "", status: "", progress: 0,
      reset() { controller?.abort(); controller = null; generation++; this.result = null; this.busy = false; this.error = ""; this.status = ""; },
      setError(value) { this.error = value; }, cancel() { this.reset(); this.status = "已取消处理。"; },
      run(work) {
        this.reset(); const job = generation; controller = new AbortController(); const signal = controller.signal; this.busy = true;
        this.pending = (async () => {
          try {
            const value = await work(signal, (value, status) => { if (generation === job) { this.progress = value; this.status = status; } });
            if (generation === job && !signal.aborted) { this.result = value; this.status = "处理完成。"; }
          } catch (error) { if (generation === job) this.error = error.message; }
          finally { if (generation === job) this.busy = false; }
        })(); return this.pending;
      },
    };
  }
  const tasks = [makeTask(), makeTask()]; let taskIndex = 0;
  const app = mountComponent("app/components/audio-bpm.tsx", "AudioBpm", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask: () => tasks[taskIndex++], LocalUpload: "upload", TaskFeedback: "feedback" };
    if (id === "./text-utility-parts") return { TextUtilityResult: "text-result" };
    if (id === "../lib/audio-compression") return { async readAudioInfo(file, signal) {
      metadataCalls.push({ file, signal });
      loadLocalModule("app/lib/audio-compression.ts").validateAudioFile(file);
      if (metadataError) throw new Error("metadata failed");
      if (deferMetadata) return new Promise((resolve) => metadataPending.push(resolve));
      return { duration: file.name.startsWith("short") ? 18 : 120, channels: 2, sampleRate: 8000 };
    } };
    if (id === "../lib/audio-bpm-source") return { async readBpmSamples(file, options, signal) {
      sourceCalls.push({ file, options, signal });
      if (sourceError) throw new Error("decode failed");
      if (deferSource) return new Promise((resolve) => sourcePending.push(resolve));
      return { samples: new Float32Array(40000).fill(0.25), sampleRate: 8000 };
    } };
    if (id === "../lib/audio-bpm-worker-client") return { async estimateBpm(samples, sampleRate, options, signal) {
      estimateCalls.push({ samples, sampleRate, options, signal });
      if (estimateError) throw new Error("estimate failed");
      if (deferEstimate) return new Promise((resolve) => estimatePending.push(resolve));
      return estimate;
    } };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  });
  return { ...app, metadata: tasks[0], task: tasks[1], metadataCalls, sourceCalls, estimateCalls, metadataPending, sourcePending, estimatePending,
    render() { taskIndex = 0; const tree = app.render(); app.flushEffects(); return tree; },
  };
}
const file = (name = "track.wav") => new File(["audio"], name, { type: "audio/wav" });
async function upload(app, source = file()) { one(app.render(), "upload").props.onFiles([source]); await app.metadata.pending; }
async function tickUntil(check) { for (let index = 0; index < 20 && !check(); index++) await Promise.resolve(); assert.ok(check(), "expected deferred operation to start"); }

test("上传后直接可分析，结束时间按音频时长派生，长音频默认60秒且不自动播放", async () => {
  const app = fixture(); assert.equal(button(app.render(), "开始分析 BPM").props.disabled, true); assert.equal(app.metadataCalls.length, 0);
  await upload(app, file("short.wav")); assert.equal(button(app.render(), "开始分析 BPM").props.disabled, false);
  assert.equal(control(app.render(), "结束时间（秒）").props.value, "18");
  assert.equal(allElements(app.render(), (node) => node.type === "button" && content(node) === "使用此音频").length, 0);
  button(app.render(), "开始分析 BPM").props.onClick(); await app.task.pending;
  assert.equal(app.sourceCalls[0].options.end, 18); assert.equal(JSON.parse(one(app.render(), "text-result").props.text).tempo, 120.125);
  assert.equal(one(app.render(), "text-result").props.name, "audio-bpm.json"); assert.equal(one(app.render(), "audio"), undefined);
  control(app.render(), "结束时间（秒）").props.onChange({ target: { value: "15" } }); assert.equal(one(app.render(), "text-result"), undefined);
  await upload(app, file("long.wav")); assert.equal(control(app.render(), "开始时间（秒）").props.value, "0"); assert.equal(control(app.render(), "结束时间（秒）").props.value, "60");
  app.unmount();
});

test("区间、BPM与声道按当前设置提交，输出明确为相对区间相位和候选而非置信度", async () => {
  const app = fixture(); const source = file(); await upload(app, source);
  for (const [label, value] of [["开始时间（秒）", "2.5"], ["结束时间（秒）", "32.5"], ["最低 BPM", "80"], ["最高 BPM", "160"], ["分析声道", "mix"]]) control(app.render(), label).props.onChange({ target: { value } });
  button(app.render(), "开始分析 BPM").props.onClick(); await app.task.pending;
  assert.equal(app.sourceCalls[0].file, source); assert.deepEqual(plain(app.sourceCalls[0].options), { start: 2.5, end: 32.5, min: 80, max: 160, channel: "mix" });
  assert.equal(app.estimateCalls[0].samples.length, 40000); assert.equal(app.estimateCalls[0].sampleRate, 8000);
  const result = JSON.parse(one(app.render(), "text-result").props.text); assert.equal(result.start, 2.5); assert.equal(result.end, 32.5); assert.equal(result.phase, 0.25); assert.equal(result.channel, "mix");
  assert.match(content(app.render()), /相对区间起点/); assert.match(content(app.render()), /半速 \/ 倍速/);
  control(app.render(), "最高 BPM").props.onChange({ target: { value: "20" } }); assert.equal(one(app.render(), "text-result"), undefined);
  button(app.render(), "开始分析 BPM").props.onClick(); await app.task.pending; assert.match(app.task.error, /BPM/); assert.equal(app.sourceCalls.length, 1);
  app.unmount();
});

test("读取元数据中不能分析，新文件、取消与迟到元数据不会恢复旧文件", async () => {
  const app = fixture({ deferMetadata: true }); const old = file("old.wav"), latest = file("latest.wav");
  one(app.render(), "upload").props.onFiles([old]); const oldPending = app.metadata.pending; await tickUntil(() => app.metadataPending.length === 1);
  assert.equal(button(app.render(), "开始分析 BPM").props.disabled, true);
  one(app.render(), "upload").props.onFiles([latest]); const latestPending = app.metadata.pending; await tickUntil(() => app.metadataPending.length === 2);
  assert.equal(app.metadataCalls[0].signal.aborted, true);
  app.metadataPending[1]({ duration: 10, channels: 1, sampleRate: 8000 }); await latestPending;
  app.metadataPending[0]({ duration: 120, channels: 2, sampleRate: 48000 }); await oldPending;
  assert.match(content(app.render()), /latest.wav/); assert.doesNotMatch(content(app.render()), /old.wav/); assert.equal(control(app.render(), "结束时间（秒）").props.value, "10");
  button(app.render(), "开始分析 BPM").props.onClick(); await app.task.pending; assert.equal(app.sourceCalls[0].file, latest);
  const key = one(app.render(), "upload").key; button(app.render(), "清空").props.onClick(); assert.notEqual(one(app.render(), "upload").key, key); assert.equal(button(app.render(), "开始分析 BPM").props.disabled, true); assert.equal(one(app.render(), "text-result"), undefined);
  app.unmount();
});

test("解码中改设置会取消旧分析，迟到采样不能再进入节拍线程", async () => {
  const app = fixture({ deferSource: true }); await upload(app);
  button(app.render(), "开始分析 BPM").props.onClick(); const pending = app.task.pending; await tickUntil(() => app.sourcePending.length === 1);
  control(app.render(), "分析声道").props.onChange({ target: { value: "second" } }); assert.equal(app.sourceCalls[0].signal.aborted, true);
  app.sourcePending[0]({ samples: new Float32Array(40000), sampleRate: 8000 }); await pending;
  assert.equal(app.estimateCalls.length, 0); assert.equal(one(app.render(), "text-result"), undefined); app.unmount();
});

test("线程分析中取消或清空不展示迟到结果，之后可以重新分析", async () => {
  for (const action of ["cancel", "clear"]) {
    const app = fixture({ deferEstimate: true }); await upload(app);
    button(app.render(), "开始分析 BPM").props.onClick(); const pending = app.task.pending; await tickUntil(() => app.estimatePending.length === 1);
    if (action === "cancel") allElements(app.render(), (node) => node.type === "feedback").find((node) => node.props.task === app.task).props.task.cancel();
    else button(app.render(), "清空").props.onClick();
    assert.equal(app.estimateCalls[0].signal.aborted, true); app.estimatePending[0](estimate); await pending; assert.equal(one(app.render(), "text-result"), undefined);
    if (action === "clear") await upload(app);
    button(app.render(), "开始分析 BPM").props.onClick(); const next = app.task.pending; await tickUntil(() => app.estimatePending.length === 2); app.estimatePending[1](estimate); await next; assert.ok(one(app.render(), "text-result")); app.unmount();
  }
});

test("元数据、解码和引擎错误均可反馈，不误显示旧结果或保持忙碌", async () => {
  for (const [config, message] of [[{ metadataError: true }, /metadata failed/], [{ sourceError: true }, /decode failed/], [{ estimateError: true }, /estimate failed/]]) {
    const app = fixture(config); await upload(app);
    if (!config.metadataError) { button(app.render(), "开始分析 BPM").props.onClick(); await app.task.pending; assert.match(app.task.error, message); }
    else { assert.match(app.metadata.error, message); assert.equal(button(app.render(), "开始分析 BPM").props.disabled, true); }
    assert.equal(one(app.render(), "text-result"), undefined); assert.equal(app.task.busy, false); app.unmount();
  }
  const app = fixture(); await upload(app, new File([], "empty.wav")); assert.match(app.metadata.error, /为空/); assert.equal(button(app.render(), "开始分析 BPM").props.disabled, true); app.unmount();
});
