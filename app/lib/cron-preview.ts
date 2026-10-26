import { CronExpressionParser } from "cron-parser";
import type { CronOptions } from "./practical-tool-options";
export type CronPreview = { expression: string; timezone: string; from: string; fields: { label: string; token: string }[]; dates: { iso: string; local: string }[]; text: string };
export function previewCron(options: CronOptions, now = Date.now()): CronPreview {
  const expression = options.expression.trim().replace(/\s+/g, " "), tokens = expression.split(" ");
  if (expression.length > 500 || ![5, 6].includes(tokens.length)) throw new Error("请输入五段 Cron，或六段含秒表达式；不支持年份字段和 @ 别名。");
  if (tokens.some((token) => /\bH(?:\b|\()/i.test(token))) throw new Error("暂不支持 H 哈希随机字段，请使用明确的数字或步长，保证预览可重复。");
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 50) throw new Error("预览数量须为 1–50。");
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: options.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }); }
  catch { throw new Error("请输入有效 IANA 时区，例如 Asia/Shanghai。"); }
  if (options.from && !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(options.from)) throw new Error("起算时间须为含时区的 ISO 8601，例如 2026-10-23T08:00:00+08:00。");
  if (options.from) {
    const [year, month, day] = options.from.slice(0, 10).split("-").map(Number), hour = Number(options.from.slice(11, 13)), minute = Number(options.from.slice(14, 16));
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!days || day < 1 || day > days || hour > 23 || minute > 59) throw new Error("起算时间不是有效的日历日期或时分。");
  }
  const base = new Date(options.from || now);
  if (!Number.isFinite(base.getTime())) throw new Error("起算时间无效。");
  try {
    const iterator = CronExpressionParser.parse(expression, { currentDate: base, tz: options.timezone, strict: false });
    const dates = Array.from({ length: options.count }, () => {
      const date = iterator.next().toDate();
      const parts = formatter.formatToParts(date), part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
      return { iso: date.toISOString(), local: `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} ${part("timeZoneName")}` };
    });
    const fields = ["秒", "分", "时", "日", "月", "周"].map((label, index) => ({ label, token: (tokens.length === 5 ? ["0", ...tokens] : tokens)[index] }));
    const text = [`表达式：${expression}`, `时区：${options.timezone}`, `起算：${base.toISOString()}`, "", ...dates.map((date, index) => `${index + 1}. ${date.local} · UTC ${date.iso}`)].join("\n");
    return { expression, timezone: options.timezone, from: base.toISOString(), fields, dates, text };
  } catch (cause) { throw new Error(`Cron 无法生成后续时间：${cause instanceof Error ? cause.message : "表达式无效"}`); }
}
