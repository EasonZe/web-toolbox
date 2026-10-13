import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const commonTimeZones = [
  "Asia/Shanghai",
  "UTC",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];
export function timestampResult(
  value: string,
  unit: "seconds" | "milliseconds",
  zone: string,
) {
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(value.trim()))
    throw new Error("请输入有效的秒或毫秒时间戳。");
  const millis = Number(value) * (unit === "seconds" ? 1000 : 1),
    date = new Date(millis);
  if (
    !Number.isSafeInteger(millis) ||
    Number.isNaN(date.getTime()) ||
    Math.abs(millis) > 253402300799999
  )
    throw new Error("时间戳超出范围或精度超过毫秒。");
  return {
    milliseconds: millis,
    seconds: millis / 1000,
    utc: date.toISOString(),
    date: formatInTimeZone(date, zone, "yyyy-MM-dd HH:mm:ss.SSS XXX"),
    local: formatInTimeZone(date, zone, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
  };
}
export function dateToTimestamp(value: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))
    throw new Error("请选择有效日期与时间。");
  const normalized =
    value.length === 16
      ? `${value}:00.000`
      : value.includes(".")
        ? value.padEnd(23, "0")
        : `${value}.000`;
  const date = fromZonedTime(normalized, zone);
  if (
    Number.isNaN(date.getTime()) ||
    formatInTimeZone(date, zone, "yyyy-MM-dd'T'HH:mm:ss.SSS") !== normalized
  )
    throw new Error("日期不存在，或处于夏令时跳过的时段。");
  return timestampResult(String(date.getTime()), "milliseconds", zone);
}
