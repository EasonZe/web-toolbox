import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const text = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function button(tree, value) { const node = allElements(tree, (n) => n.type === "button" && text(n.props.children) === value)[0]; assert.ok(node, value); return node; }
function control(tree, label) { const node = allElements(tree, (n) => n.type === "label" && text(n.props.children?.[0]) === label)[0]; assert.ok(node, label); return allElements(node, (n) => ["select", "input", "textarea"].includes(n.type))[0]; }
const output = (tree) => allElements(tree, (n) => n.type === "text-result")[0]?.props.text;
const one = (tree, type) => allElements(tree, (n) => n.type === type)[0];
function fixture(name, { reduced = false, unsupported = false } = {}) {
  const calls = [], animations = [];
  const task = { result: null, error: "", busy: false, reset() { this.result = null; this.error = ""; }, run(work) { this.reset(); this.busy = true; this.pending = (async () => { try { this.result = await work(new AbortController().signal); } catch (error) { this.error = error.message; } finally { this.busy = false; } })(); return this.pending; } };
  const app = mountComponent(`app/components/${name}.tsx`, { "json-pointer": "JsonPointer", "text-digest": "TextDigest", "easing-curve": "EasingCurve" }[name], (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => task, TaskFeedback: "feedback" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "text-input", TextUtilityResult: "text-result" };
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request, signal) => { signal.throwIfAborted(); calls.push(request); return loadLocalModule("app/lib/json-pointer.ts").extractJsonPointers(request.text, request.paths); } };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  }, { crypto: webcrypto, window: { matchMedia: () => ({ matches: reduced }) } });
  function render() { const tree = app.render(); app.flushEffects(); return tree; }
  render();
  if (name === "easing-curve") {
    app.refs[0].current = { clientWidth: 320 };
    app.refs[1].current = { offsetWidth: 32, animate(frames, options) {
      if (unsupported) throw new Error("unsupported");
      const animation = { frames, options, cancelled: 0, onfinish: null, oncancel: null, cancel() { this.cancelled++; } }; animations.push(animation); return animation;
    } };
  }
  return { ...app, render, calls, task, animations };
}

test("JSON路径界面提交当前数据和路径，统计命中，输入变化即清除旧结果", async () => {
  const app = fixture("json-pointer");
  one(app.render(), "text-input").props.onChange('{"a":false,"b":9007199254740993}');
  control(app.render(), "提取路径（每行一个）").props.onChange({ target: { value: "/a\n/b\n/missing" } });
  button(app.render(), "提取数据").props.onClick(); await app.task.pending;
  assert.equal(app.calls[0].paths, "/a\n/b\n/missing"); assert.match(output(app.render()), /9007199254740993/); assert.equal(app.task.result.matched, 2);
  button(app.render(), "整个文档").props.onClick(); assert.equal(output(app.render()), undefined); assert.equal(control(app.render(), "提取路径（每行一个）").props.value, "#");
  one(app.render(), "text-input").props.onChange("{bad"); button(app.render(), "提取数据").props.onClick(); await app.task.pending; assert.match(app.task.error, /JSON/); assert.equal(output(app.render()), undefined);
  button(app.render(), "清空").props.onClick(); assert.equal(one(app.render(), "text-input").props.text, ""); assert.equal(control(app.render(), "提取路径（每行一个）").props.value, ""); app.unmount();
});

test("文本摘要界面保留空内容并使用当前算法、编码、密钥，修改设置清理旧输出", async () => {
  const app = fixture("text-digest"); one(app.render(), "text-input").props.onChange("abc");
  button(app.render(), "计算摘要").props.onClick(); await app.task.pending; assert.match(output(app.render()), /ba7816bf/);
  control(app.render(), "待核对的 Hex 摘要（可选）").props.onChange({ target: { value: app.task.result.hex.toUpperCase() } }); assert.match(text(app.render()), /摘要一致/);
  control(app.render(), "模式").props.onChange({ target: { value: "hmac" } }); assert.equal(output(app.render()), undefined);
  control(app.render(), "HMAC 密钥").props.onChange({ target: { value: "secret" } }); assert.equal(control(app.render(), "HMAC 密钥").props.type, "password");
  button(app.render(), "计算摘要").props.onClick(); await app.task.pending; assert.match(output(app.render()), /9946dad4/);
  control(app.render(), "算法").props.onChange({ target: { value: "SHA-512" } }); assert.equal(output(app.render()), undefined);
  button(app.render(), "清空内容与密钥").props.onClick(); assert.equal(control(app.render(), "HMAC 密钥").props.value, ""); assert.equal(one(app.render(), "text-input").props.text, "");
  button(app.render(), "计算摘要").props.onClick(); await app.task.pending; assert.match(app.task.error, /密钥不能为空/);
  control(app.render(), "模式").props.onChange({ target: { value: "hash" } }); button(app.render(), "计算摘要").props.onClick(); await app.task.pending; assert.equal(app.task.result.bytes, 0); app.unmount();
});

test("曲线预览不自动播放，播放参数一致，重复播放/换预设/完成/卸载有资源清理", () => {
  const app = fixture("easing-curve"); assert.equal(app.animations.length, 0); assert.match(output(app.render()), /cubic-bezier\(0\.25, 0\.1, 0\.25, 1\)/);
  button(app.render(), "播放预览").props.onClick(); const first = app.animations[0], lateFinish = first.onfinish;
  assert.equal(first.frames[1].transform, "translateX(256px)"); assert.equal(first.options.duration, 1000); assert.equal(first.options.easing, "cubic-bezier(0.25, 0.1, 0.25, 1)");
  button(app.render(), "播放预览").props.onClick(); assert.equal(first.cancelled, 1); assert.equal(first.onfinish, null); lateFinish(); assert.match(text(app.render()), /正在预览/);
  button(app.render(), "ease-in").props.onClick(); assert.equal(app.animations[1].cancelled, 1); assert.match(output(app.render()), /0\.42, 0, 1, 1/);
  control(app.render(), "动画时长（毫秒）").props.onChange({ target: { value: "2000" } }); button(app.render(), "播放预览").props.onClick(); const final = app.animations.at(-1); assert.equal(final.options.duration, 2000);
  final.onfinish(); assert.match(text(app.render()), /预览完成/); assert.equal(button(app.render(), "停止并复位").props.disabled, false);
  button(app.render(), "停止并复位").props.onClick(); assert.equal(final.cancelled, 1);
  button(app.render(), "播放预览").props.onClick(); app.unmount(); assert.equal(app.animations.at(-1).cancelled, 1); assert.equal(app.animations.at(-1).onfinish, null);
});

test("曲线无效坐标/时长不保留CSS输出，滑块可恢复，减少动态和不支持播放均可降级", () => {
  const app = fixture("easing-curve"); control(app.render(), "x1").props.onChange({ target: { value: "2" } }); assert.equal(output(app.render()), undefined); assert.match(text(app.render()), /必须在 0～1/);
  allElements(app.render(), (n) => n.props?.["aria-label"] === "x1 滑块")[0].props.onChange({ target: { value: "0.5" } }); assert.ok(output(app.render()));
  control(app.render(), "动画时长（毫秒）").props.onChange({ target: { value: "" } }); assert.equal(output(app.render()), undefined); app.unmount();
  for (const mode of [{ reduced: true }, { unsupported: true }]) { const next = fixture("easing-curve", mode); button(next.render(), "播放预览").props.onClick(); assert.equal(next.animations.length, 0); assert.match(text(next.render()), /减少动态效果|无法播放/); assert.ok(output(next.render())); next.unmount(); }
});

test("JSON路径线程使用30秒保护，超时/取消关闭线程且迟到消息无权提交", async () => {
  for (const cancel of [false, true]) {
    const app = workerClientHarness("app/lib/file-worker-client.ts"), controller = new AbortController();
    const result = app.exports.runFileWorker({ action: "json-pointer", text: "{}", paths: "#" }, controller.signal), worker = app.workers[0], lateMessage = worker.onmessage;
    assert.equal([...app.timers.values()][0].delay, 30000);
    if (cancel) controller.abort(); else [...app.timers.values()][0].callback();
    await assert.rejects(result); lateMessage({ data: { result: { output: "late" } } });
    assert.equal(worker.terminations, 1); assert.equal(app.timers.size, 0);
  }
});
