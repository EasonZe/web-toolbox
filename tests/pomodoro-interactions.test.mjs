import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
function button(tree, label) { const found = allElements(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(found, label); return found; }
const input = (tree, name) => allElements(tree, (node) => node.type === "input" && node.props["aria-label"] === name)[0];
const checkbox = (tree) => allElements(tree, (node) => node.type === "input" && node.props.type === "checkbox")[0];
function fixture({ noAudio = false, audioResumeRejected = false } = {}) {
  let now = 1000, id = 0; const intervals = new Map(), listeners = new Set(), contexts = [], oscillators = [], gains = [];
  class Context {
    state = "running"; currentTime = 0; destination = {}; closes = 0; resumes = 0;
    constructor() { contexts.push(this); }
    resume() { this.resumes++; return audioResumeRejected ? Promise.reject(new Error("blocked")) : Promise.resolve(); }
    close() { this.closes++; this.state = "closed"; return Promise.resolve(); }
    createOscillator() { const node = { frequency: { value: 0 }, onended: null, starts: 0, stops: 0, disconnects: 0, connect() {}, start() { this.starts++; }, stop() { this.stops++; }, disconnect() { this.disconnects++; } }; oscillators.push(node); return node; }
    createGain() { const node = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, disconnects: 0, connect() {}, disconnect() { this.disconnects++; } }; gains.push(node); return node; }
  }
  const app = mountComponent("app/components/pomodoro.tsx", "Pomodoro", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "../lib/pomodoro") return loadLocalModule("app/lib/pomodoro.ts");
  }, {
    Date: { now: () => now },
    window: { AudioContext: noAudio ? undefined : Context, setInterval(fn) { const key = ++id; intervals.set(key, fn); return key; }, clearInterval(key) { intervals.delete(key); } },
    document: { addEventListener(event, fn) { assert.equal(event, "visibilitychange"); listeners.add(fn); }, removeEventListener(event, fn) { assert.equal(event, "visibilitychange"); listeners.delete(fn); } },
  });
  return { ...app, intervals, listeners, contexts, oscillators, gains,
    render() { const tree = app.render(); app.flushEffects(); return tree; },
    at(value) { now = value; }, tick() { for (const fn of [...intervals.values()]) fn(); }, visible() { for (const fn of [...listeners]) fn(); },
  };
}

test("番茄钟初始无计时或音频资源，参数修改立即重置并显示边界错误", () => {
  const app = fixture(), tree = app.render(); assert.match(content(tree), /25:00/); assert.equal(checkbox(tree).props.checked, false);
  assert.equal(app.intervals.size, 0); assert.equal(app.contexts.length, 0);
  input(tree, "专注时长").props.onChange({ target: { value: "1" } }); assert.match(content(app.render()), /01:00/);
  input(app.render(), "专注时长").props.onChange({ target: { value: "" } }); assert.equal(button(app.render(), "开始专注").props.disabled, true); assert.match(content(app.render()), /整数分钟/);
  button(app.render(), "重置计划").props.onClick(); assert.equal(input(app.render(), "专注时长").props.value, "25"); app.unmount();
});

test("重复开始仅有一个计时源，运行和暂停禁改参数，继续保留余量", () => {
  const app = fixture(); input(app.render(), "专注时长").props.onChange({ target: { value: "1" } });
  const start = button(app.render(), "开始专注").props.onClick; start(); start(); app.render();
  assert.equal(app.intervals.size, 1); assert.equal(app.listeners.size, 1); assert.equal(input(app.render(), "专注时长").props.disabled, true);
  app.at(11_000); app.tick(); assert.match(content(app.render()), /00:50/);
  button(app.render(), "暂停").props.onClick(); assert.match(content(app.render()), /已暂停/); assert.equal(app.intervals.size, 0); assert.equal(app.listeners.size, 0);
  input(app.render(), "专注时长").props.onChange({ target: { value: "9" } }); assert.equal(input(app.render(), "专注时长").props.value, "1");
  app.at(900_000); button(app.render(), "继续").props.onClick(); app.render(); app.at(910_000); app.tick(); assert.match(content(app.render()), /00:40/);
  app.unmount(); assert.equal(app.intervals.size, 0); assert.equal(app.listeners.size, 0);
});

test("后台恢复结算一轮后等待下一段，跳过不计为完成，重置清空记录", () => {
  const app = fixture(); input(app.render(), "专注时长").props.onChange({ target: { value: "1" } }); button(app.render(), "开始专注").props.onClick(); app.render();
  app.at(3 * 86_400_000); app.visible(); let tree = app.render();
  assert.match(content(tree), /1 轮专注/); assert.match(content(tree), /1 分钟/); assert.ok(button(tree, "开始短休息")); assert.equal(app.intervals.size, 0); assert.equal(app.listeners.size, 0);
  button(tree, "跳过本段").props.onClick(); tree = app.render(); assert.ok(button(tree, "开始专注")); assert.match(content(tree), /本段不计入完成记录/); assert.match(content(tree), /1 轮专注/);
  button(tree, "跳过本段").props.onClick(); assert.match(content(app.render()), /1 轮专注/);
  button(app.render(), "重置计划").props.onClick(); tree = app.render(); assert.match(content(tree), /0 轮专注/); assert.match(content(tree), /0 分钟/); app.unmount();
});

test("音频须明确启用，阶段完成播放一次，关闭声音停止并断开所有节点", () => {
  const app = fixture(); input(app.render(), "专注时长").props.onChange({ target: { value: "1" } }); checkbox(app.render()).props.onChange({ target: { checked: true } });
  assert.equal(app.contexts.length, 1); assert.equal(app.oscillators.length, 0);
  button(app.render(), "开始专注").props.onClick(); app.render(); app.at(61_000); app.tick(); assert.equal(app.oscillators.length, 2); app.tick(); assert.equal(app.oscillators.length, 2);
  checkbox(app.render()).props.onChange({ target: { checked: false } }); assert.ok(app.oscillators.every((node) => node.stops === 2 && node.disconnects === 1 && node.onended === null)); assert.ok(app.gains.every((node) => node.disconnects === 1));
  app.unmount(); assert.equal(app.contexts[0].closes, 1);
});

test("音频自然结束清理节点；卸载运行中的计时、监听和音频均释放", () => {
  const app = fixture(); input(app.render(), "专注时长").props.onChange({ target: { value: "1" } }); checkbox(app.render()).props.onChange({ target: { checked: true } });
  button(app.render(), "开始专注").props.onClick(); app.render(); app.at(61_000); app.tick(); app.render(); for (const node of app.oscillators) node.onended();
  assert.ok(app.oscillators.every((node) => node.disconnects === 1)); assert.ok(app.gains.every((node) => node.disconnects === 1));
  button(app.render(), "开始短休息").props.onClick(); app.render(); assert.equal(app.intervals.size, 1); app.unmount();
  assert.equal(app.intervals.size, 0); assert.equal(app.listeners.size, 0); assert.equal(app.contexts[0].closes, 1); assert.ok(app.oscillators.every((node) => node.disconnects === 1));
});

test("浏览器无音频或音频启动被拒绝时显示说明，计时仍然启动", async () => {
  for (const options of [{ noAudio: true }, { audioResumeRejected: true }]) {
    const app = fixture(options); checkbox(app.render()).props.onChange({ target: { checked: true } }); button(app.render(), "开始专注").props.onClick(); await Promise.resolve();
    const tree = app.render(); assert.match(content(tree), /提示音暂不可用/); assert.ok(button(tree, "暂停")); assert.equal(app.intervals.size, 1); app.unmount();
  }
});
