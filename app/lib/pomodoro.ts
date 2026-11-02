export type PomodoroPhase = "focus" | "short-break" | "long-break";
export type PomodoroStatus = "ready" | "running" | "paused";
export type PomodoroConfig = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  rounds: number;
};
export type PomodoroState = {
  config: PomodoroConfig;
  phase: PomodoroPhase;
  status: PomodoroStatus;
  remainingMs: number;
  deadline: number | null;
  completedFocus: number;
  completedFocusMs: number;
  cycleFocus: number;
  finishedPhases: number;
  skippedPhases: number;
};

export const defaultPomodoroConfig: PomodoroConfig = {
  focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, rounds: 4,
};

export const pomodoroPhaseNames: Record<PomodoroPhase, string> = {
  focus: "专注", "short-break": "短休息", "long-break": "长休息",
};

export function validatePomodoroConfig(config: PomodoroConfig): PomodoroConfig {
  for (const key of ["focusMinutes", "shortBreakMinutes", "longBreakMinutes"] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > 1440) {
      throw new Error("每段时长请输入 1–1440 之间的整数分钟。");
    }
  }
  if (!Number.isSafeInteger(config.rounds) || config.rounds < 1 || config.rounds > 24) {
    throw new Error("长休间隔请输入 1–24 之间的整数轮数。");
  }
  return { ...config };
}

export function pomodoroPhaseDuration(config: PomodoroConfig, phase: PomodoroPhase): number {
  return config[phase === "focus" ? "focusMinutes" : phase === "short-break" ? "shortBreakMinutes" : "longBreakMinutes"] * 60_000;
}

export function createPomodoro(config: PomodoroConfig = defaultPomodoroConfig): PomodoroState {
  const checked = validatePomodoroConfig(config);
  return {
    config: checked, phase: "focus", status: "ready", remainingMs: pomodoroPhaseDuration(checked, "focus"),
    deadline: null, completedFocus: 0, completedFocusMs: 0, cycleFocus: 0, finishedPhases: 0, skippedPhases: 0,
  };
}

function checkedNow(now: number) {
  if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 86_400_000) throw new Error("当前时间无效。");
}

// End only the current phase. A sleeping tab never manufactures later sessions.
function endPhase(state: PomodoroState, completed: boolean): PomodoroState {
  const completedFocus = state.completedFocus + (completed && state.phase === "focus" ? 1 : 0);
  const cycleFocus = state.phase === "long-break" ? 0 : state.cycleFocus + (completed && state.phase === "focus" ? 1 : 0);
  const phase: PomodoroPhase = state.phase !== "focus" ? "focus" : completed && cycleFocus >= state.config.rounds ? "long-break" : "short-break";
  return {
    ...state, phase, status: "ready", remainingMs: pomodoroPhaseDuration(state.config, phase), deadline: null,
    completedFocus, cycleFocus,
    completedFocusMs: state.completedFocusMs + (completed && state.phase === "focus" ? pomodoroPhaseDuration(state.config, "focus") : 0),
    finishedPhases: state.finishedPhases + (completed ? 1 : 0), skippedPhases: state.skippedPhases + (completed ? 0 : 1),
  };
}

export function tickPomodoro(state: PomodoroState, now: number): PomodoroState {
  checkedNow(now);
  if (state.status !== "running" || state.deadline === null) return state;
  if (now >= state.deadline) return endPhase(state, true);
  const remainingMs = Math.min(pomodoroPhaseDuration(state.config, state.phase), state.deadline - now);
  return remainingMs === state.remainingMs ? state : { ...state, remainingMs };
}

export function startPomodoro(state: PomodoroState, now: number): PomodoroState {
  checkedNow(now);
  if (state.status === "running") return state;
  return { ...state, status: "running", deadline: now + state.remainingMs };
}

export function pausePomodoro(state: PomodoroState, now: number): PomodoroState {
  const current = tickPomodoro(state, now);
  return current.status === "running" ? { ...current, status: "paused", deadline: null } : current;
}

export function skipPomodoro(state: PomodoroState, now: number): PomodoroState {
  const current = tickPomodoro(state, now);
  // If time has just expired, keep the completed phase's next step intact.
  return current.finishedPhases !== state.finishedPhases ? current : endPhase(current, false);
}

export function formatPomodoroTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
