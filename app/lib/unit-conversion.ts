import { create, unitDependencies, bignumberDependencies, formatDependencies, createUnitDependencies, type Unit } from "mathjs";
import { unitCategories, type UnitCategory } from "./unit-definitions";
const math = create({ ...unitDependencies, ...bignumberDependencies, ...formatDependencies, ...createUnitDependencies }, { number: "BigNumber", precision: 40 });
math.createUnit("knots", { definition: math.unit(math.bignumber(1852).div(3600), "m/s") });
math.createUnit("cal", { definition: math.unit(math.bignumber("4.184"), "J") });
math.createUnit("kcal", { definition: math.unit(math.bignumber("4184"), "J") });
const display = (value: ReturnType<Unit["toNumeric"]>) => math.format(value, { precision: 20, lowerExp: -9, upperExp: 21 });
export function convertUnits(input: string, category: UnitCategory, from: string, to: string) {
  const text = input.trim(), definition = unitCategories[category];
  if (!definition || ![from, to].every((code) => definition.units.some(([unit]) => unit === code))) throw new Error("请选择同一类别中的单位。");
  if (text.length > 128 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,4})?$/i.test(text)) throw new Error("请输入有效数字，可使用小数或科学计数法。");
  const value = math.bignumber(text);
  if (!value.isFinite() || Math.abs(value.e ?? 0) > 1000) throw new Error("数值超出支持范围。");
  const source = math.unit(value, from);
  if (category === "temperature" && math.bignumber(source.toNumeric("K")).lt(-1e-25)) throw new Error("温度不能低于绝对零度。");
  const converted = source.toNumeric(to);
  return { value: display(converted), rows: definition.units.map(([code, label]) => ({ code, label, value: display(source.toNumeric(code)) })) };
}
