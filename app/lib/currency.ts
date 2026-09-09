export const currencies = [
  ["CNY", "人民币"], ["USD", "美元"], ["EUR", "欧元"], ["JPY", "日元"], ["GBP", "英镑"],
  ["HKD", "港币"], ["TWD", "新台币"], ["KRW", "韩元"], ["AUD", "澳大利亚元"], ["CAD", "加拿大元"],
  ["CHF", "瑞士法郎"], ["SGD", "新加坡元"], ["NZD", "新西兰元"], ["THB", "泰铢"], ["MYR", "马来西亚林吉特"],
  ["IDR", "印尼盾"], ["PHP", "菲律宾比索"], ["INR", "印度卢比"], ["AED", "阿联酋迪拉姆"], ["SAR", "沙特里亚尔"],
  ["TRY", "土耳其里拉"], ["RUB", "俄罗斯卢布"], ["BRL", "巴西雷亚尔"], ["MXN", "墨西哥比索"], ["ZAR", "南非兰特"],
  ["SEK", "瑞典克朗"], ["NOK", "挪威克朗"], ["DKK", "丹麦克朗"], ["PLN", "波兰兹罗提"], ["CZK", "捷克克朗"],
] as const;

export type CurrencyCode = (typeof currencies)[number][0];
export const currencyCodes = new Set<string>(currencies.map(([code]) => code));

export function convertCurrency(amount: number, rate: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("请输入有效金额");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("汇率数据无效");
  return amount * rate;
}

export function formatCurrencyAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: currency === "JPY" || currency === "KRW" ? 0 : 4 }).format(amount);
}
