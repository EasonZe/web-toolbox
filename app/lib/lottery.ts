export function parseNames(text: string) {
  const names = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (names.length > 500) throw new Error("名单最多支持500项，请缩减后重试。");
  if (names.some((s) => Array.from(s).length > 40)) throw new Error("每个名字或选项最多40字。");
  return names;
}

export function randomWinner(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("没有可抽取的名单。");
  const limit = Math.floor(0x100000000 / count) * count;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % count;
}
