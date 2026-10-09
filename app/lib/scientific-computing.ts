import { CancellationError, ComputeEngine, isExpression, isFunction, isNumber, isSymbol, type Expression } from "@cortex-js/compute-engine";
import { add, bignumberDependencies, combinationsDependencies, create, det, format, gcdDependencies, inv, isPrime, lcmDependencies, max, mean, median, min, multiply, permutationsDependencies, std, sum, transpose, variance } from "mathjs";
import type { ScienceFormula, ScienceRequest, ScienceResult } from "./scientific-types";

class InputError extends Error {}
const operators = new Set([
  "Add", "Subtract", "Multiply", "Divide", "Negate", "Power", "Sqrt", "Root", "Square", "Rational", "Complex",
  "Abs", "Sin", "Cos", "Tan", "Arcsin", "Arccos", "Arctan", "Sinh", "Cosh", "Tanh", "Arsinh", "Arcosh", "Artanh",
  "Ln", "Log", "Log10", "Exp", "Factorial", "Floor", "Ceil", "Round", "Sign", "Mod",
]);
const constants = new Set(["Pi", "ExponentialE", "ImaginaryUnit"]);
// 1000! has 2568 digits; 4096 digits preserve every supported integer operation.
const integerMath = create({ ...bignumberDependencies, ...combinationsDependencies, ...permutationsDependencies, ...gcdDependencies, ...lcmDependencies }, { number: "BigNumber", precision: 4096 });

function variableName(value: string) {
  const name = value.trim();
  if (!/^[a-hj-zA-HJ-Z]$/.test(name) || name.toLowerCase() === "e") throw new InputError("未知量请使用单个英文字母，例如 x、y；e 和 i 为常数。");
  return name;
}

function parse(ce: ComputeEngine, source: string, allowEquation = false): Expression {
  if (!source.trim() || source.length > 500) throw new InputError("请输入 500 字以内的完整公式。");
  const expression = ce.parse(source.replace(/×/g, "\\times ").replace(/÷/g, "\\div ").replace(/−/g, "-").replace(/π/g, "\\pi "));
  if (!expression.isValid) throw new InputError("公式不完整，请检查括号、分数和函数参数。");
  let nodes = 0;
  function check(value: Expression) {
    if (++nodes > 250) throw new InputError("公式过于复杂，请拆分后计算。");
    if (isFunction(value)) {
      if (!operators.has(value.operator) && !(allowEquation && value.operator === "Equal")) throw new InputError("此公式包含当前模块不支持的运算，请使用对应的方程或微积分模块。");
      if (value.operator === "Power" && isNumber(value.ops[1]) && Math.abs(value.ops[1].re) > 1000) throw new InputError("指数的绝对值不能超过 1000。");
      if (value.operator === "Factorial" && isNumber(value.ops[0]) && value.ops[0].re > 1000) throw new InputError("阶乘输入不能超过 1000。");
      value.ops.forEach(check);
    } else if (isSymbol(value)) {
      if (!constants.has(value.symbol) && !/^[a-zA-Z]$/.test(value.symbol)) throw new InputError("公式中有无法识别的符号，请使用数学键盘或示例输入。");
    } else if (isNumber(value)) {
      if (!value.isFinite || Math.abs(value.re) > 1e100 || Math.abs(value.im) > 1e100) throw new InputError("数值超出支持范围，请使用有限数值。");
    } else throw new InputError("请输入数学公式，不支持文字、列表或程序语句。");
  }
  check(expression);
  return expression;
}

function finite(value: Expression) {
  if (!value.isValid || ["NaN", "Indeterminate", "Undefined", "ComplexInfinity", "PositiveInfinity", "NegativeInfinity"].includes(value.toString()) || (isNumber(value) && !value.isFinite)) {
    throw new InputError("结果未定义或不是有限值，请检查除数、函数定义域和积分区间。");
  }
  if (value.latex.length > 6000) throw new InputError("结果过长，请缩小数值或简化公式。");
  return value;
}

function formula(label: string, expression: Expression): ScienceFormula {
  const value = finite(expression);
  return { label, latex: value.latex, text: value.toString() };
}

function expressionResult(title: string, expression: Expression): ScienceResult {
  const exact = formula("精确结果", expression);
  const numeric = finite(expression.N());
  const formulas = [exact];
  if (numeric.latex !== exact.latex && !numeric.unknowns.length) formulas.push(formula("数值近似", numeric));
  return { title, formulas };
}

function realNumber(ce: ComputeEngine, source: string, label: string) {
  const value = parse(ce, source).N();
  if (!isNumber(value) || !value.isFinite || value.im !== 0 || Math.abs(value.re) > 1e100) throw new InputError(`${label}必须是有限实数，可以输入小数或分数。`);
  return value.re;
}

function calculateExpression(ce: ComputeEngine, request: Extract<ScienceRequest, { mode: "expression" }>): ScienceResult {
  ce.angularUnit = request.angle;
  if (request.variables.length > 1000) throw new InputError("变量赋值过长。");
  const assignments = request.variables.split(/[\n;；]/).map((line) => line.trim()).filter(Boolean);
  if (assignments.length > 8) throw new InputError("最多支持 8 个变量。");
  const assigned = new Set<string>();
  for (const assignment of assignments) {
    const parts = assignment.split("=");
    if (parts.length !== 2) throw new InputError("变量请按 x=3 的格式填写，每行一个。");
    const name = variableName(parts[0]);
    if (assigned.has(name)) throw new InputError(`变量 ${name} 重复赋值。`);
    const value = parse(ce, parts[1]).N();
    if (!isNumber(value) || !value.isFinite) throw new InputError(`变量 ${name} 的值必须是有限数值。`);
    // Assign the parsed expression to preserve exact fractions, rather than its decimal approximation.
    ce.assign(name, parse(ce, parts[1]));
    assigned.add(name);
  }
  const expression = parse(ce, request.expression);
  const value = request.operation === "simplify" ? expression.evaluate().simplify() : expression.evaluate();
  const result = expressionResult(request.operation === "simplify" ? "公式化简" : "表达式计算", value);
  if (value.unknowns.length) result.notes = [`含未赋值变量 ${value.unknowns.join("、")}，已保留符号结果。可填写变量值继续计算。`];
  if (request.angle === "rad" && expression.unknowns.length === 1 && expression.unknowns[0] === "x" && !assignments.length) result.plot = value.toString();
  return result;
}

function calculateEquation(ce: ComputeEngine, request: Extract<ScienceRequest, { mode: "equation" }>): ScienceResult {
  const variables = request.variables.split(/[,，\s]+/).filter(Boolean).map(variableName);
  if (!variables.length || variables.length > 3 || new Set(variables).size !== variables.length) throw new InputError("请填写 1 至 3 个不同未知量，用逗号分隔，例如 x,y。");
  if (!request.equations.length || request.equations.length > 3 || request.equations.some((value) => !value.trim())) throw new InputError("请填写 1 至 3 个完整方程。");
  variables.forEach((name) => ce.declare(name, request.domain));
  const equations = request.equations.map((source) => {
    const expression = parse(ce, source, true);
    if (!isFunction(expression) || expression.operator !== "Equal") throw new InputError("每个方程必须包含等号，例如 x²−5x+6=0。");
    if (expression.unknowns.some((name) => !variables.includes(name))) throw new InputError("请在未知量中列出方程里的全部变量。");
    return expression;
  });
  const expression = equations.length === 1 ? equations[0] : ce.expr(["List", ...equations.map((value) => value.json)]);
  const solutions = expression.solve(variables.length === 1 ? variables[0] : variables);
  if (solutions === null) throw new InputError("当前引擎无法给出这个方程的完整解。请尝试一元多项式方程或线性方程组。");
  if (Array.isArray(solutions) && !solutions.length) return { title: "方程求解", values: [{ label: "结果", value: `在${request.domain === "real" ? "实数" : "复数"}范围内无解` }] };
  const formulas: ScienceFormula[] = [];
  function addSolution(value: Expression, name: string, index?: number) {
    const entry = formula(index === undefined ? name : `解 ${index + 1}`, value);
    formulas.push({ ...entry, latex: `${name}=${entry.latex}`, text: `${name} = ${entry.text}` });
  }
  if (Array.isArray(solutions)) {
    solutions.forEach((solution, index) => {
      if (isExpression(solution)) addSolution(solution, variables[0], index);
      else for (const name of variables) addSolution(solution[name], name, index);
    });
  } else for (const name of variables) addSolution((solutions as Record<string, Expression>)[name], name);
  const trigonometric = equations.some((e) => ["Sin", "Cos", "Tan"].some((op) => e.getSubexpressions(op).length));
  return { title: "方程求解", formulas, notes: trigonometric ? ["三角方程显示主值解；完整通解还需结合函数周期。"] : undefined };
}

function calculateCalculus(ce: ComputeEngine, request: Extract<ScienceRequest, { mode: "calculus" }>): ScienceResult {
  const variable = variableName(request.variable);
  ce.declare(variable, "real");
  const expression = parse(ce, request.expression);
  if (expression.unknowns.some((name) => name !== variable)) throw new InputError("公式只能包含当前所选未知量；请先替换其他参数。微积分的三角函数使用弧度。");
  if (request.operation === "derivative") {
    if (!Number.isInteger(request.order) || request.order < 1 || request.order > 3) throw new InputError("支持 1 至 3 阶导数。");
    const derivative = ce.expr(["D", expression.json, ...Array.from({ length: request.order }, () => variable)]).evaluate().simplify();
    if (derivative.getSubexpressions("D").length || derivative.getSubexpressions("Derivative").length) throw new InputError("当前引擎暂不支持这个函数的求导。");
    const result = expressionResult(`${request.order} 阶导数`, derivative);
    if (variable === "x") result.plot = derivative.toString();
    return result;
  }
  const lower = realNumber(ce, request.lower, "积分下限");
  const upper = realNumber(ce, request.upper, "积分上限");
  if (Math.abs(lower) > 1e6 || Math.abs(upper) > 1e6) throw new InputError("积分上下限的绝对值不能超过 1000000。");
  for (const point of [lower, (lower + upper) / 2, upper]) {
    const value = expression.subs({ [variable]: point }).N();
    if (!isNumber(value) || !value.isFinite || value.im !== 0) throw new InputError("积分区间内存在未定义或非实数值，请检查函数定义域和奇点。");
  }
  const integral = ce.expr(["Integrate", expression.json, ["Limits", variable, parse(ce, request.lower).json, parse(ce, request.upper).json]]);
  const exact = finite(integral.evaluate());
  const unresolved = exact.getSubexpressions("Integrate").length > 0;
  if (unresolved) {
    const numeric = finite(integral.N());
    if (numeric.getSubexpressions("Integrate").length || numeric.getSubexpressions("NIntegrate").length) throw new InputError("当前引擎无法计算这个定积分，请简化函数或缩小积分区间。");
    return { title: "定积分", formulas: [formula("数值近似", numeric)], notes: ["数值积分为近似结果；适用于区间内连续的实函数，± 表示引擎给出的误差估计。"] };
  }
  return { ...expressionResult("定积分", exact), notes: ["适用于积分区间内连续的实函数。"] };
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) throw new InputError("结果超出有限数值范围，请减小输入数据。");
  return format(Object.is(value, -0) ? 0 : value, { precision: 14 });
}

function calculateMatrix(ce: ComputeEngine, request: Extract<ScienceRequest, { mode: "matrix" }>): ScienceResult {
  function matrix(source: string[][], name: string) {
    if (!source.length || source.length > 5 || !source[0].length || source[0].length > 5 || source.some((row) => row.length !== source[0].length)) throw new InputError("矩阵行列数必须在 1 至 5 之间，且每行长度一致。");
    return source.map((row, r) => row.map((value, c) => realNumber(ce, value || "0", `${name} 的第 ${r + 1} 行、第 ${c + 1} 列`)));
  }
  const a = matrix(request.a, "矩阵 A");
  let output: number | number[][];
  if (request.operation === "add" || request.operation === "multiply") {
    const b = matrix(request.b, "矩阵 B");
    if (request.operation === "add" && (a.length !== b.length || a[0].length !== b[0].length)) throw new InputError("矩阵相加要求 A 和 B 的行列数相同。");
    if (request.operation === "multiply" && a[0].length !== b.length) throw new InputError("矩阵相乘要求 A 的列数等于 B 的行数。");
    output = (request.operation === "add" ? add(a, b) : multiply(a, b)) as number[][];
  } else if (request.operation === "transpose") output = transpose(a) as number[][];
  else {
    if (a.length !== a[0].length) throw new InputError("行列式和逆矩阵要求行数等于列数。");
    if (request.operation === "determinant") output = det(a) as number;
    else {
      try { output = inv(a) as number[][]; }
      catch { throw new InputError("这个矩阵不可逆，请检查是否为奇异矩阵。"); }
    }
  }
  return typeof output === "number"
    ? { title: "矩阵运算", values: [{ label: "行列式", value: numberText(output) }] }
    : { title: "矩阵运算", matrix: output.map((row) => row.map(numberText)), notes: ["矩阵使用数值运算，显示至 14 位有效数字。"] };
}

function calculateStatistics(request: Extract<ScienceRequest, { mode: "statistics" }>): ScienceResult {
  if (request.data.length > 200000) throw new InputError("数据内容过长，最多支持 10000 项。");
  const parts = request.data.trim().split(/[\s,，;；]+/).filter(Boolean);
  if (!parts.length || parts.length > 10000) throw new InputError("请输入 1 至 10000 个数字，用逗号、空格或换行分隔。");
  const data = parts.map((part, index) => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(part) || !Number.isFinite(Number(part))) throw new InputError(`第 ${index + 1} 项不是有效数字：${part.slice(0, 25)}`);
    return Number(part);
  });
  return {
    title: "数据统计",
    values: [
      { label: "数量", value: String(data.length) }, { label: "总和", value: numberText(sum(data) as number) },
      { label: "均值", value: numberText(mean(data) as number) }, { label: "中位数", value: numberText(median(data) as number) },
      { label: "最小值", value: numberText(min(data) as number) }, { label: "最大值", value: numberText(max(data) as number) },
      { label: "总体方差", value: numberText(variance(data, "uncorrected") as number) }, { label: "总体标准差", value: numberText(std(data, "uncorrected") as number) },
      { label: "样本方差", value: data.length > 1 ? numberText(variance(data, "unbiased") as number) : "需至少 2 项" },
      { label: "样本标准差", value: data.length > 1 ? numberText(std(data, "unbiased") as number) : "需至少 2 项" },
    ],
  };
}

function calculateNumber(ce: ComputeEngine, request: Extract<ScienceRequest, { mode: "number" }>): ScienceResult {
  const combinatorics = request.operation === "permutations" || request.operation === "combinations";
  function integer(source: string, name: string) {
    if (!/^\d{1,13}$/.test(source.trim())) throw new InputError(`${name}必须是非负整数。`);
    const value = BigInt(source.trim());
    if (value > (combinatorics ? BigInt(1000) : BigInt("1000000000000"))) throw new InputError(combinatorics ? "排列组合的 n、r 不能超过 1000。" : "整数不能超过 1000000000000。");
    return value;
  }
  const n = integer(request.n, "n");
  if (request.operation === "prime") return { title: "质数判断", values: [{ label: String(n), value: isPrime(Number(n)) ? "是质数" : "不是质数" }] };
  if (request.operation === "factor") {
    if (n < BigInt(2)) throw new InputError("质因数分解的整数必须至少为 2。");
    const factors = ce.expr(["FactorInteger", Number(n)]).evaluate();
    if (!isFunction(factors) || factors.operator !== "List") throw new InputError("当前引擎无法分解这个整数。");
    const pairs = factors.ops.map((pair) => {
      if (!isFunction(pair) || pair.operator !== "Tuple") throw new InputError("质因数分解未完成。");
      return { base: pair.ops[0].toString(), power: pair.ops[1].toString() };
    });
    return { title: "质因数分解", formulas: [{ label: "分解结果", latex: `${n}=${pairs.map(({ base, power }) => power === "1" ? base : `${base}^{${power}}`).join("\\times ")}`, text: `${n} = ${pairs.map(({ base, power }) => power === "1" ? base : `${base}^${power}`).join(" × ")}` }] };
  }
  const r = integer(request.r, "r");
  if (combinatorics && r > n) throw new InputError("排列组合要求 r 不大于 n。");
  if (request.operation === "gcd" && n === BigInt(0) && r === BigInt(0)) throw new InputError("最大公约数的两个整数不能同时为 0。");
  const left = integerMath.bignumber(n.toString());
  const right = integerMath.bignumber(r.toString());
  const value = request.operation === "gcd" ? integerMath.gcd(left, right) : request.operation === "lcm" ? integerMath.lcm(left, right) : request.operation === "permutations" ? integerMath.permutations(left, right) : integerMath.combinations(left, right);
  const labels = { gcd: "最大公约数", lcm: "最小公倍数", permutations: "排列数 P(n,r)", combinations: "组合数 C(n,r)" };
  return { title: "数论与组合", values: [{ label: labels[request.operation], value: format(value, { notation: "fixed" }) }] };
}

export function calculateScience(request: ScienceRequest): ScienceResult {
  const ce = new ComputeEngine();
  try {
    return ce.withTimeLimit({ ms: 3000, label: "scientific-calculation" }, () => {
      switch (request.mode) {
        case "expression": return calculateExpression(ce, request);
        case "equation": return calculateEquation(ce, request);
        case "calculus": return calculateCalculus(ce, request);
        case "matrix": return calculateMatrix(ce, request);
        case "statistics": return calculateStatistics(request);
        case "number": return calculateNumber(ce, request);
      }
    });
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (error instanceof CancellationError) throw new InputError("运算时间过长，已停止。请简化公式或缩小数值范围。");
    throw new InputError("无法完成这次运算，请检查公式、数值和所选操作。");
  }
}
