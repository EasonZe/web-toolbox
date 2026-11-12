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

export function dateInChina() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function parseDateInput(value: string) {
  const date = parseISO(value);
  if (!value || !isValid(date)) throw new Error("请选择有效日期。");
  return date;
}

export function countWeekdays(start: Date, end: Date, inclusive = false) {
  const direction = start <= end ? 1 : -1;
  const first = direction === 1 ? start : end;
  const last = direction === 1 ? end : start;
  const days = differenceInCalendarDays(last, first) + (inclusive ? 1 : 0);
  let count = Math.floor(days / 7) * 5;
  // Complete weeks always contain five weekdays, including across DST changes.
  // Only the remaining zero to six calendar days need to be inspected.
  for (let offset = 0; offset < days % 7; offset++) {
    const day = (first.getDay() + offset) % 7;
    if (day !== 0 && day !== 6) count++;
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
