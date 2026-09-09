import {
  add,
  differenceInCalendarDays,
  differenceInMonths,
  differenceInYears,
  format,
  getDayOfYear,
  getISOWeek,
  intervalToDuration,
  isLeapYear,
  isValid,
  parseISO,
  sub,
} from "date-fns";
import { zhCN } from "date-fns/locale";

export function parseDateInput(value: string) {
  const date = parseISO(value);
  if (!value || !isValid(date)) throw new Error("请选择有效日期。");
  return date;
}

export function countWeekdays(start: Date, end: Date, inclusive = false) {
  const direction = start <= end ? 1 : -1;
  const first = direction === 1 ? start : end;
  const last = direction === 1 ? end : start;
  let count = 0;
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const finish = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (cursor < finish || (inclusive && cursor <= finish)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count * direction;
}

export function calculateDateDifference(startValue: string, endValue: string, inclusive = false) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  const sign = start <= end ? 1 : -1;
  const earlier = sign === 1 ? start : end;
  const later = sign === 1 ? end : start;
  const duration = intervalToDuration({ start: earlier, end: later });
  const days = differenceInCalendarDays(end, start) + (inclusive ? sign : 0);
  return {
    days,
    weeks: Math.trunc(days / 7),
    remainingDays: Math.abs(days) % 7,
    months: differenceInMonths(end, start),
    years: differenceInYears(end, start),
    weekdays: countWeekdays(start, end, inclusive),
    duration,
  };
}

export type DateOffset = { years: number; months: number; weeks: number; days: number };

export function shiftDate(value: string, offset: DateOffset, direction: "add" | "subtract") {
  const source = parseDateInput(value);
  const result = direction === "add" ? add(source, offset) : sub(source, offset);
  return {
    value: format(result, "yyyy-MM-dd"),
    weekday: format(result, "EEEE", { locale: zhCN }),
    dayOfYear: getDayOfYear(result),
    week: getISOWeek(result),
    leapYear: isLeapYear(result),
  };
}
