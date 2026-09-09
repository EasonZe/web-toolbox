export const popularTimeZones = [
  ["Asia/Shanghai", "北京 / 上海"], ["Asia/Hong_Kong", "香港"], ["Asia/Tokyo", "东京"], ["Asia/Seoul", "首尔"],
  ["Asia/Singapore", "新加坡"], ["Asia/Dubai", "迪拜"], ["Asia/Kolkata", "新德里"], ["Europe/London", "伦敦"],
  ["Europe/Paris", "巴黎"], ["Europe/Berlin", "柏林"], ["Europe/Moscow", "莫斯科"], ["America/New_York", "纽约"],
  ["America/Chicago", "芝加哥"], ["America/Denver", "丹佛"], ["America/Los_Angeles", "洛杉矶"], ["America/Toronto", "多伦多"],
  ["America/Sao_Paulo", "圣保罗"], ["Australia/Sydney", "悉尼"], ["Pacific/Auckland", "奥克兰"], ["UTC", "协调世界时"],
] as const;

export function formatZonedTime(date: Date, timeZone: string, hour12 = false) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", timeZoneName: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
    date: `${value("year")}年${value("month")}月${value("day")}日 ${value("weekday")}`,
    zoneName: value("timeZoneName"),
  };
}
