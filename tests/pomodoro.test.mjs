import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const {
  createPomodoro, validatePomodoroConfig, pomodoroPhaseDuration,
  startPomodoro, tickPomodoro, pausePomodoro, skipPomodoro, formatPomodoroTime,
} = loadLocalModule("app/lib/pomodoro.ts");
const config = { focusMinutes: 1, shortBreakMinutes: 2, longBreakMinutes: 3, rounds: 2 };
function finish(state, now = 0) { const running = startPomodoro(state, now); return tickPomodoro(running, running.deadline); }

test("番茄钟默认25/5/15分钟，每4轮长休，配置快照不跟随外部对象变化", () => {
  const state = createPomodoro();
  assert.equal(state.remainingMs, 25 * 60_000); assert.equal(state.phase, "focus"); assert.equal(state.status, "ready");
  assert.equal(state.config.shortBreakMinutes, 5); assert.equal(state.config.longBreakMinutes, 15); assert.equal(state.config.rounds, 4);
  const source = { ...config }, copy = createPomodoro(source); source.focusMinutes = 999; assert.equal(copy.config.focusMinutes, 1);
});

test("番茄钟拒绝空值解析的0、负数、非数、无穷、小数和越界设置", () => {
  for (const key of ["focusMinutes", "shortBreakMinutes", "longBreakMinutes"]) {
    for (const value of [0, -1, NaN, Infinity, 1.5, 1441]) assert.throws(() => validatePomodoroConfig({ ...config, [key]: value }), /整数分钟/);
  }
  for (const value of [0, -1, NaN, Infinity, 2.5, 25]) assert.throws(() => createPomodoro({ ...config, rounds: value }), /整数轮数/);
  assert.equal(createPomodoro({ ...config, focusMinutes: 1440, rounds: 24 }).remainingMs, 86_400_000);
});

test("番茄钟使用绝对截止时间，重复开始不改变原截止时间", () => {
  const initial = createPomodoro(config), running = startPomodoro(initial, 1000);
  assert.equal(running.deadline, 61_000); assert.equal(startPomodoro(running, 20_000), running);
  assert.equal(tickPomodoro(running, 31_000).remainingMs, 30_000); assert.equal(initial.status, "ready");
});

test("暂停保存毫秒余量，暂停时不流逝，继续从新截止时间恢复", () => {
  const paused = pausePomodoro(startPomodoro(createPomodoro(config), 1000), 11_123);
  assert.equal(paused.status, "paused"); assert.equal(paused.remainingMs, 49_877); assert.equal(paused.deadline, null);
  assert.equal(tickPomodoro(paused, 900_000), paused); assert.equal(pausePomodoro(paused, 900_000), paused);
  const resumed = startPomodoro(paused, 900_000); assert.equal(resumed.deadline, 949_877);
  assert.equal(tickPomodoro(resumed, 949_876).completedFocus, 0); assert.equal(tickPomodoro(resumed, 949_877).completedFocus, 1);
});

test("专注结束进入短休等待，不自动开启下一阶段或重复统计", () => {
  const done = finish(createPomodoro(config));
  assert.equal(done.phase, "short-break"); assert.equal(done.status, "ready"); assert.equal(done.remainingMs, 120_000);
  assert.equal(done.completedFocus, 1); assert.equal(done.completedFocusMs, 60_000); assert.equal(done.cycleFocus, 1);
  assert.equal(done.finishedPhases, 1); assert.equal(done.deadline, null);
  assert.equal(tickPomodoro(done, 10 ** 10), done);
});

test("后台隔天恢复仅结算当前专注，不虚构后续多轮", () => {
  const running = startPomodoro(createPomodoro(config), 0), restored = tickPomodoro(running, 3 * 86_400_000);
  assert.equal(restored.completedFocus, 1); assert.equal(restored.finishedPhases, 1); assert.equal(restored.status, "ready");
  assert.equal(restored.phase, "short-break"); assert.equal(restored.remainingMs, 120_000);
});

test("完成指定轮数后进入长休，长休结束开始新循环且保留本页累计", () => {
  let state = createPomodoro(config);
  state = finish(state); state = finish(state); state = finish(state);
  assert.equal(state.phase, "long-break"); assert.equal(state.remainingMs, 180_000); assert.equal(state.cycleFocus, 2); assert.equal(state.completedFocus, 2);
  state = finish(state); assert.equal(state.phase, "focus"); assert.equal(state.cycleFocus, 0); assert.equal(state.completedFocus, 2); assert.equal(state.completedFocusMs, 120_000);
  state = finish(state); assert.equal(state.phase, "short-break"); assert.equal(state.cycleFocus, 1); assert.equal(state.completedFocus, 3);
});

test("每1轮长休设置得到一轮一休，短休不插入", () => {
  const state = finish(createPomodoro({ ...config, rounds: 1 })); assert.equal(state.phase, "long-break");
  assert.equal(finish(state).phase, "focus");
});

test("跳过专注不计完成，跳过休息回到专注，暂停中的跳过不累计", () => {
  let state = skipPomodoro(createPomodoro(config), 0);
  assert.equal(state.phase, "short-break"); assert.equal(state.completedFocus, 0); assert.equal(state.cycleFocus, 0);
  assert.equal(state.skippedPhases, 1); assert.equal(state.finishedPhases, 0); assert.equal(state.completedFocusMs, 0);
  state = skipPomodoro(state, 1); assert.equal(state.phase, "focus");
  state = pausePomodoro(startPomodoro(state, 2), 1002); state = skipPomodoro(state, 30_000);
  assert.equal(state.completedFocus, 0); assert.equal(state.completedFocusMs, 0); assert.equal(state.skippedPhases, 3); assert.equal(state.status, "ready");
});

test("在截止边界暂停或跳过，先完成当前阶段，不再跨过下一阶段", () => {
  const running = startPomodoro(createPomodoro(config), 0);
  for (const next of [pausePomodoro(running, 60_000), skipPomodoro(running, 60_000)]) {
    assert.equal(next.completedFocus, 1); assert.equal(next.phase, "short-break"); assert.equal(next.status, "ready"); assert.equal(next.skippedPhases, 0);
  }
});

test("长休跳过也重置循环；重建计划清空统计，不修改旧状态", () => {
  let state = createPomodoro({ ...config, rounds: 1 }); state = finish(state);
  state = skipPomodoro(state, 100_000); assert.equal(state.phase, "focus"); assert.equal(state.cycleFocus, 0); assert.equal(state.completedFocus, 1);
  const reset = createPomodoro(state.config); assert.equal(reset.completedFocus, 0); assert.equal(reset.skippedPhases, 0); assert.equal(state.completedFocus, 1);
});

test("时间格式向上取整、不显示负数；时钟回拨不会超过当前阶段时长", () => {
  assert.equal(formatPomodoroTime(60_001), "01:01"); assert.equal(formatPomodoroTime(1), "00:01"); assert.equal(formatPomodoroTime(-1), "00:00");
  assert.equal(formatPomodoroTime(86_400_000), "1440:00");
  const running = startPomodoro(createPomodoro(config), 10_000); assert.equal(tickPomodoro(running, 0).remainingMs, 60_000);
  assert.equal(pomodoroPhaseDuration(config, "long-break"), 180_000);
  for (const now of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) assert.throws(() => startPomodoro(createPomodoro(config), now), /时间无效/);
});
