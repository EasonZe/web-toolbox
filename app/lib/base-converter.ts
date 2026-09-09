const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeBase(value: number) {
  if (!Number.isInteger(value) || value < 2 || value > 36) throw new Error("进制必须是 2 到 36 之间的整数。");
  return value;
}

export function parseBaseInteger(raw: string, base: number) {
  normalizeBase(base);
  const compact = raw.trim().replace(/[\s_]/g, "").toUpperCase();
  if (!compact) throw new Error("请输入需要转换的整数。");
  if (compact.length > 4096) throw new Error("输入过长，最多支持 4096 位。");
  const negative = compact.startsWith("-");
  const positive = compact.startsWith("+");
  let body = negative || positive ? compact.slice(1) : compact;
  const prefixes: Record<number, RegExp> = { 2: /^0B/, 8: /^0O/, 16: /^0X/ };
  if (prefixes[base]?.test(body)) body = body.slice(2);
  if (!body) throw new Error("请输入有效整数。");

  let value = BigInt(0);
  const radix = BigInt(base);
  for (const character of body) {
    const digit = DIGITS.indexOf(character);
    if (digit < 0 || digit >= base) throw new Error(`字符“${character}”不能用于 ${base} 进制。`);
    value = value * radix + BigInt(digit);
  }
  return negative ? -value : value;
}

export function convertBaseInteger(raw: string, fromBase: number, toBase: number) {
  normalizeBase(toBase);
  return parseBaseInteger(raw, fromBase).toString(toBase).toUpperCase();
}

export function commonBaseValues(raw: string, fromBase: number) {
  const value = parseBaseInteger(raw, fromBase);
  return [2, 8, 10, 16, 36].map((base) => ({ base, value: value.toString(base).toUpperCase() }));
}
