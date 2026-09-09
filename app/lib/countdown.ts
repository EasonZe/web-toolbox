export function durationToMilliseconds(hours: number, minutes: number, seconds: number) {
  const values = [hours, minutes, seconds];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("倒计时时长不能为负数");
  const total = Math.round(hours * 3600 + minutes * 60 + seconds) * 1000;
  if (total < 1000) throw new Error("倒计时至少需要1秒");
  if (total > 30 * 24 * 3600 * 1000) throw new Error("倒计时最长支持30天");
  return total;
}

export function splitCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds % 86400 / 3600),
    minutes: Math.floor(totalSeconds % 3600 / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

export function formatCountdown(milliseconds: number) {
  const value = splitCountdown(milliseconds);
  const clock = [value.hours, value.minutes, value.seconds].map((part) => String(part).padStart(2, "0")).join(":");
  return value.days ? `${value.days}天 ${clock}` : clock;
}
