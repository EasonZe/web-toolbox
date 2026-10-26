import { toolLimits } from "./resource-limits";
export const typingSamples = {
  chinese: "生活明朗，万物可爱。把复杂的事情拆成小步骤，认真完成眼前的一件事。慢慢练习，保持节奏，让每一次输入都更加准确。窗外的风吹过树叶，桌上的书翻开新的一页，我们也在平凡的日子里发现新的可能。",
  english: "A clear mind begins with a small step. Take your time, keep a steady rhythm, and focus on accuracy before speed. Every useful idea starts with a question. We learn by trying, checking the result, and making the next attempt a little better.",
};
export function typingUnits(text: string) { return Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text.replace(/\r\n?/g, "\n").normalize("NFC")), (item) => item.segment); }
export type TypingState = { target: string[]; typed: string; phase: "idle" | "running" | "finished"; startedAt: number | null; finishedAt: number | null; duration: number };
export function createTypingState(target: string, duration = 60): TypingState {
  const normalized = target.replace(/\r\n?/g, "\n");
  if (!normalized.trim() || target.length > toolLimits.practice.typingChars || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(normalized)) throw new Error("参考文本须为可输入的正文，不接受制表符或控制字符，最多 5000 个字素。");
  const units = typingUnits(target); if (units.length > toolLimits.practice.typingGraphemes) throw new Error("参考文本超过 5000 个字素，请缩短文本。");
  if (![30, 60, 120].includes(duration)) throw new Error("测试时长须为 30、60 或 120 秒。");
  return { target: units, typed: "", phase: "idle", startedAt: null, finishedAt: null, duration };
}
export function advanceTyping(state: TypingState, now: number): TypingState {
  if (!Number.isFinite(now) || state.startedAt !== null && now < state.startedAt) throw new Error("测试时钟无效。");
  return state.phase === "running" && now - state.startedAt! >= state.duration * 1000 ? { ...state, phase: "finished", finishedAt: state.startedAt! + state.duration * 1000 } : state;
}
export function commitTyped(state: TypingState, text: string, now: number): TypingState {
  const current = advanceTyping(state, now); if (current.phase === "finished") return current;
  if (text.length > toolLimits.practice.typingChars) throw new Error("输入超长。"); const units = typingUnits(text); if (units.length > toolLimits.practice.typingGraphemes) throw new Error("输入超过 5000 个字素。");
  const startedAt = current.startedAt ?? (units.length ? now : null), complete = units.length >= current.target.length;
  return { ...current, typed: units.join(""), startedAt, phase: complete ? "finished" : startedAt !== null ? "running" : "idle", finishedAt: complete ? now : null };
}
export function typingMetrics(state: TypingState, now: number) {
  const typed = typingUnits(state.typed), correct = typed.reduce((n, unit, index) => n + (unit === state.target[index] ? 1 : 0), 0), elapsed = state.startedAt === null ? 0 : Math.max(0, Math.min(state.duration * 1000, (state.finishedAt ?? now) - state.startedAt)) / 1000;
  const cpm = elapsed > 0 ? correct * 60 / elapsed : 0;
  return { correct, wrong: typed.length - correct, typed: typed.length, elapsed, remaining: Math.max(0, state.duration - elapsed), accuracy: typed.length ? correct / typed.length * 100 : 0, cpm, wpm: cpm / 5 };
}
