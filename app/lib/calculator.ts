import { all, create } from "mathjs";

const math = create(all, { number: "BigNumber", precision: 32 });
const functions = new Set(["sqrt", "abs", "sin", "cos", "tan", "log", "log10", "exp"]);
const operators = new Set(["add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus", "mod", "percentage"]);

export function calculate(expression: string, degrees = true): string {
  const normalized = expression.trim().replace(/×/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/−/g, "-");
  if (!normalized || normalized.length > 200) throw new Error("请输入200字以内的算式。");
  try {
    const node = math.parse(normalized);
    let count = 0;
    node.traverse((child) => {
      if (++count > 100) throw new Error("算式过长");
      if (child.type === "ConstantNode") {
        const value = Number((child as { value?: unknown }).value);
        if (!Number.isFinite(value) || Math.abs(value) > 1e100) throw new Error("数值超出范围");
      } else if (child.type === "SymbolNode") {
        const name = (child as { name?: string }).name ?? "";
        if (!["pi", "e"].includes(name) && !functions.has(name)) throw new Error("未知符号");
      } else if (child.type === "OperatorNode") {
        if (!operators.has((child as { fn?: string }).fn ?? "")) throw new Error("不支持此运算");
        if ((child as { fn?: string }).fn === "pow") {
          const exponent = (child as { args?: { toString(): string }[] }).args?.[1]?.toString() ?? "";
          if (!/^\(?\s*[+-]?\s*\d+(?:\.\d+)?\s*\)?$/.test(exponent) || Math.abs(Number(exponent.replace(/[()\s]/g, ""))) > 1000) throw new Error("指数超出范围");
        }
      } else if (child.type === "FunctionNode") {
        if (!functions.has((child as { name?: string }).name ?? "")) throw new Error("不支持此函数");
      } else if (child.type !== "ParenthesisNode") throw new Error("仅支持数字算式");
    });
    const scope = new Map();
    if (degrees) {
      for (const name of ["sin", "cos", "tan"] as const) {
        scope.set(name, (v: number) => math[name](math.multiply(v, math.divide(math.pi, 180)) as number));
      }
    }
    const result = node.evaluate(scope);
    if ((!math.isBigNumber(result) && typeof result !== "number") || !Number.isFinite(Number(result))) throw new Error("结果不是有限实数");
    return math.format(result, { precision: 24, lowerExp: -9, upperExp: 15 });
  } catch {
    throw new Error("无法计算，请检查算式、括号和数值范围（除数不能为0）。");
  }
}
