import assert from "node:assert/strict";
import test from "node:test";
import { calculateScience } from "../app/lib/scientific-computing.ts";

const expression = (value, options = {}) => calculateScience({ mode: "expression", expression: value, variables: "", angle: "deg", operation: "evaluate", ...options });
const equation = (equations, variables = "x", domain = "real") => calculateScience({ mode: "equation", equations, variables, domain });
const calculus = (value, options = {}) => calculateScience({ mode: "calculus", expression: value, variable: "x", operation: "derivative", order: 1, lower: "0", upper: "1", ...options });
const matrix = (operation, a, b = [["0"]]) => calculateScience({ mode: "matrix", operation, a, b });
const number = (operation, n, r = "0") => calculateScience({ mode: "number", operation, n, r });
const values = (result) => Object.fromEntries(result.values.map((entry) => [entry.label, entry.value]));

test("expressions retain exact fractions and support decimals, angle units, complex numbers and variable substitution", () => {
  assert.equal(expression("0.1+0.2").formulas[0].text, "0.3");
  const fractions = expression("\\frac{1}{3}+\\frac{1}{6}");
  assert.equal(fractions.formulas[0].text, "1/2");
  assert.equal(fractions.formulas[1].text, "0.5");
  assert.equal(expression("\\sin(30)").formulas[0].text, "1/2");
  assert.equal(expression("\\cos(\\pi)", { angle: "rad" }).formulas[0].text, "-1");
  assert.equal(expression("\\sqrt{-4}").formulas[0].text, "2i");
  assert.equal(expression("x^2+y", { variables: "x=3\ny=1/2" }).formulas[0].text, "19/2");
  assert.equal(expression("x+x+2x", { operation: "simplify" }).formulas[0].text, "4x");
});

test("equations distinguish real and complex roots and solve simultaneous linear equations", () => {
  assert.deepEqual(equation(["x^2-5x+6=0"]).formulas.map((entry) => entry.text).sort(), ["x = 2", "x = 3"]);
  assert.match(equation(["x^2+1=0"]).values[0].value, /无解/);
  assert.deepEqual(equation(["x^2+1=0"], "x", "complex").formulas.map((entry) => entry.text).sort(), ["x = -i", "x = i"]);
  assert.deepEqual(equation(["x+y=5", "x-y=1"], "x,y").formulas.map((entry) => entry.text), ["x = 3", "y = 2"]);
  assert.throws(() => equation(["x+y=5"]), /全部变量/);
  assert.throws(() => equation(["x+1"]), /等号/);
  assert.throws(() => equation(["e^x=x+2"]), /无法给出/);
});

test("calculus computes repeated derivatives and definite integrals with exact values", () => {
  assert.equal(calculus("x^3").formulas[0].text, "3x^2");
  assert.equal(calculus("x^3", { order: 3 }).formulas[0].text, "6");
  assert.equal(calculus("\\sin(x)").formulas[0].text, "cos(x)");
  assert.equal(calculus("x^2", { operation: "integral" }).formulas[0].text, "1/3");
  assert.equal(calculus("x^2", { operation: "integral", lower: "1", upper: "0" }).formulas[0].text, "-1/3");
  assert.throws(() => calculus("\\frac{1}{x}", { operation: "integral", lower: "-1", upper: "1" }), /定义域|奇点/);
  assert.throws(() => calculus("x+y"), /其他参数/);
});

test("matrix operations validate dimensions and reject singular inverses", () => {
  const a = [["1", "2"], ["3", "4"]];
  assert.equal(matrix("determinant", a).values[0].value, "-2");
  assert.deepEqual(matrix("inverse", a).matrix, [["-2", "1"], ["1.5", "-0.5"]]);
  assert.deepEqual(matrix("multiply", a, [["2", "0"], ["1", "2"]]).matrix, [["4", "4"], ["10", "8"]]);
  assert.deepEqual(matrix("add", a, a).matrix, [["2", "4"], ["6", "8"]]);
  assert.deepEqual(matrix("transpose", [["1/2", "2", "3"]]).matrix, [["0.5"], ["2"], ["3"]]);
  assert.throws(() => matrix("multiply", a, [["1"]]), /列数/);
  assert.throws(() => matrix("inverse", [["1", "2"], ["2", "4"]]), /不可逆/);
});

test("statistics distinguish population and sample variance, accept pasted table cells and reject invalid values", () => {
  const result = values(calculateScience({ mode: "statistics", data: "1\t2\n3，4" }));
  assert.equal(result["数量"], "4");
  assert.equal(result["均值"], "2.5");
  assert.equal(result["中位数"], "2.5");
  assert.equal(result["总体方差"], "1.25");
  assert.ok(Math.abs(Number(result["样本方差"]) - 5 / 3) < 1e-12);
  assert.equal(values(calculateScience({ mode: "statistics", data: "5" }))["样本标准差"], "需至少 2 项");
  assert.throws(() => calculateScience({ mode: "statistics", data: "1, nope, 3" }), /第 2 项/);
  assert.throws(() => calculateScience({ mode: "statistics", data: "1e309" }), /有效数字/);
});

test("number theory and combinatorics use exact integer arithmetic", () => {
  assert.equal(number("prime", "97").values[0].value, "是质数");
  assert.equal(number("prime", "1").values[0].value, "不是质数");
  assert.equal(number("factor", "360").formulas[0].text, "360 = 2^3 × 3^2 × 5");
  assert.equal(number("gcd", "48", "18").values[0].value, "6");
  assert.equal(number("lcm", "12", "18").values[0].value, "36");
  assert.equal(number("permutations", "10", "3").values[0].value, "720");
  assert.equal(number("combinations", "100", "50").values[0].value, "100891344545564193334812497256");
  assert.throws(() => number("combinations", "2", "3"), /不大于/);
  assert.throws(() => number("factor", "1"), /至少/);
  assert.throws(() => number("gcd", "0", "0"), /同时/);
});

test("math input rejects nonfinite values, statements and excessive computation", () => {
  for (const input of ["1/0", "\\operatorname{Import}(1)", "x\\coloneq 3", "9^{99999}", "\\sqrt{", "a".repeat(501)]) assert.throws(() => expression(input));
  assert.throws(() => expression("x+1", { variables: "x=2\nx=3" }), /重复赋值/);
});
