"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiArrowUpRight, FiCheck, FiCopy, FiPlay, FiX } from "react-icons/fi";
import { TbChartDots, TbFunction, TbMathFunction, TbMatrix, TbNumbers, TbVariable } from "react-icons/tb";
import { runScientificCalculation } from "../lib/scientific-client";
import type { MatrixOperation, NumberOperation, ScienceMode, ScienceRequest, ScienceResult } from "../lib/scientific-types";
import { MathField } from "./math-field";
import { UtilityShell } from "./utility-shell";

const modules = [
  { id: "expression", label: "表达式", icon: TbMathFunction, title: "表达式计算", hint: "编辑分数、根号和幂，或填写变量值；支持实数与复数。" },
  { id: "equation", label: "方程", icon: TbVariable, title: "方程求解", hint: "填写一元方程或方程组，并指定要求解的未知量。" },
  { id: "calculus", label: "微积分", icon: TbFunction, title: "微积分计算", hint: "计算一至三阶导数，或连续实函数的定积分；三角函数使用弧度。" },
  { id: "matrix", label: "矩阵", icon: TbMatrix, title: "矩阵运算", hint: "直接在表格中填写数值，可输入小数和分数。" },
  { id: "statistics", label: "统计", icon: TbChartDots, title: "数据统计", hint: "粘贴一组数字，计算均值、标准差等统计量，最多 10000 项。" },
  { id: "number", label: "数论与组合", icon: TbNumbers, title: "数论与组合", hint: "判断质数、分解质因数，或计算公约数、排列与组合。" },
] as const;
const matrixLabels: Record<MatrixOperation, string> = { add: "A + B", multiply: "A × B", determinant: "行列式 det(A)", inverse: "逆矩阵 A⁻¹", transpose: "转置 Aᵀ" };
const numberLabels: Record<NumberOperation, string> = { prime: "质数判断", factor: "质因数分解", gcd: "最大公约数", lcm: "最小公倍数", permutations: "排列 P(n,r)", combinations: "组合 C(n,r)" };
const initialA = [["1", "2"], ["3", "4"]];
const initialB = [["2", "0"], ["1", "2"]];

function MatrixEditor({ name, value, onChange }: { name: string; value: string[][]; onChange: (value: string[][]) => void }) {
  function resize(rows: number, columns: number) {
    onChange(Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => value[r]?.[c] ?? "0")));
  }
  return <fieldset className="science-matrix-editor">
    <legend>矩阵 {name}</legend>
    <div className="science-fields-row">
      <label>行数<select aria-label={`矩阵 ${name} 行数`} value={value.length} onChange={(e) => resize(Number(e.target.value), value[0].length)}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
      <label>列数<select aria-label={`矩阵 ${name} 列数`} value={value[0].length} onChange={(e) => resize(value.length, Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
    </div>
    <div className="science-matrix-cells" style={{ gridTemplateColumns: `repeat(${value[0].length}, minmax(44px, 1fr))` }}>
      {value.flatMap((row, r) => row.map((entry, c) => <input key={`${r}-${c}`} aria-label={`矩阵 ${name} 第 ${r + 1} 行第 ${c + 1} 列`} value={entry} maxLength={40} placeholder="0" spellCheck={false} onChange={(e) => onChange(value.map((items, i) => items.map((item, j) => i === r && j === c ? e.target.value : item)))} />))}
    </div>
  </fieldset>;
}

function resultText(result: ScienceResult) {
  return [result.title, ...(result.formulas?.map((formula) => `${formula.label}：${formula.text}`) ?? []), ...(result.values?.map((entry) => `${entry.label}：${entry.value}`) ?? []), ...(result.matrix?.map((row) => row.join("\t")) ?? [])].join("\n");
}

export default function ScientificTool({ mode }: { mode: ScienceMode }) {
  const [expression, setExpression] = useState("\\frac{1}{3}+\\frac{1}{6}");
  const [assignments, setAssignments] = useState("");
  const [angle, setAngle] = useState<"deg" | "rad">("deg");
  const [expressionOperation, setExpressionOperation] = useState<"evaluate" | "simplify">("evaluate");
  const [equations, setEquations] = useState(["x^2-5x+6=0"]);
  const [unknowns, setUnknowns] = useState("x");
  const [domain, setDomain] = useState<"real" | "complex">("real");
  const [functionExpression, setFunctionExpression] = useState("x^3+\\sin(x)");
  const [variable, setVariable] = useState("x");
  const [calculusOperation, setCalculusOperation] = useState<"derivative" | "integral">("derivative");
  const [order, setOrder] = useState(1);
  const [lower, setLower] = useState("0");
  const [upper, setUpper] = useState("1");
  const [matrixOperation, setMatrixOperation] = useState<MatrixOperation>("multiply");
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [data, setData] = useState("12, 15, 18, 20, 22, 25");
  const [numberOperation, setNumberOperation] = useState<NumberOperation>("factor");
  const [n, setN] = useState("360");
  const [r, setR] = useState("6");
  const [result, setResult] = useState<ScienceResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<{ request: ScienceRequest; result: ScienceResult }[]>([]);
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const activeModule = modules.find((item) => item.id === mode)!;

  useEffect(() => () => controller.current?.abort(), []);

  function invalidate() {
    controller.current?.abort(); controller.current = null;
    setBusy(false); setResult(null); setError(""); setCopied(false);
  }
  function change<T>(setter: (value: T) => void, value: T) { invalidate(); setter(value); }
  function request(): ScienceRequest {
    switch (mode) {
      case "expression": return { mode, expression, variables: assignments, angle, operation: expressionOperation };
      case "equation": return { mode, equations, variables: unknowns, domain };
      case "calculus": return { mode, expression: functionExpression, variable, operation: calculusOperation, order, lower, upper };
      case "matrix": return { mode, operation: matrixOperation, a, b };
      case "statistics": return { mode, data };
      case "number": return { mode, operation: numberOperation, n, r };
    }
  }
  async function calculate() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const input = request();
    setBusy(true); setError(""); setCopied(false); setResult(null);
    try {
      const next = await runScientificCalculation(input, current.signal);
      if (current.signal.aborted) return;
      setResult(next);
      setHistory((entries) => [{ request: input, result: next }, ...entries].slice(0, 12));
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "计算失败，请检查输入。");
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }
  function restore(entry: { request: ScienceRequest; result: ScienceResult }) {
    invalidate();
    const input = entry.request;
    switch (input.mode) {
      case "expression": setExpression(input.expression); setAssignments(input.variables); setAngle(input.angle); setExpressionOperation(input.operation); break;
      case "equation": setEquations(input.equations); setUnknowns(input.variables); setDomain(input.domain); break;
      case "calculus": setFunctionExpression(input.expression); setVariable(input.variable); setCalculusOperation(input.operation); setOrder(input.order); setLower(input.lower); setUpper(input.upper); break;
      case "matrix": setMatrixOperation(input.operation); setA(input.a); setB(input.b); break;
      case "statistics": setData(input.data); break;
      case "number": setNumberOperation(input.operation); setN(input.n); setR(input.r); break;
    }
    setResult(entry.result);
  }
  function submit() { form.current?.requestSubmit(); }
  function sample(kind: string) {
    invalidate();
    if (mode === "expression") {
      setAssignments(""); setExpressionOperation(kind === "simplify" ? "simplify" : "evaluate");
      if (kind === "fraction") setExpression("\\frac{1}{3}+\\frac{1}{6}");
      if (kind === "trig") { setExpression("\\sin(30)^2+\\cos(30)^2"); setAngle("deg"); }
      if (kind === "complex") setExpression("\\sqrt{-4}+3");
      if (kind === "variable") { setExpression("\\pi r^2"); setAssignments("r=5"); }
      if (kind === "simplify") setExpression("x+x+2x");
    } else if (mode === "equation") {
      if (kind === "quadratic") { setEquations(["x^2-5x+6=0"]); setUnknowns("x"); setDomain("real"); }
      else if (kind === "system") { setEquations(["x+y=5", "x-y=1"]); setUnknowns("x,y"); }
      else { setEquations(["x^2+1=0"]); setUnknowns("x"); setDomain("complex"); }
    } else if (mode === "calculus") {
      setVariable("x");
      if (kind === "derivative") { setFunctionExpression("x^3+\\sin(x)"); setCalculusOperation("derivative"); setOrder(1); }
      else { setFunctionExpression("x^2"); setCalculusOperation("integral"); setLower("0"); setUpper("1"); }
    } else if (mode === "matrix") { setA(initialA); setB(initialB); }
    else if (mode === "statistics") setData("12, 15, 18, 20, 22, 25");
    else {
      if (kind === "prime") { setNumberOperation("prime"); setN("97"); }
      if (kind === "factor") { setNumberOperation("factor"); setN("360"); }
      if (kind === "gcd") { setNumberOperation("gcd"); setN("48"); setR("18"); }
      if (kind === "combinations") { setNumberOperation("combinations"); setN("50"); setR("6"); }
    }
  }
  const examples: [string, string][] = mode === "expression" ? [["fraction", "分数"], ["trig", "三角函数"], ["complex", "复数"], ["variable", "变量代入"], ["simplify", "化简"]]
    : mode === "equation" ? [["quadratic", "二次方程"], ["system", "二元方程组"], ["complex", "复数解"]]
      : mode === "calculus" ? [["derivative", "函数求导"], ["integral", "定积分"]]
        : mode === "number" ? [["prime", "质数"], ["factor", "分解 360"], ["gcd", "公约数"], ["combinations", "50 选 6"]]
          : [["default", "填入示例"]];
  const actionLabel = mode === "equation" ? "求解方程" : mode === "calculus" ? calculusOperation === "derivative" ? "计算导数" : "计算定积分" : mode === "statistics" ? "统计数据" : mode === "expression" && expressionOperation === "simplify" ? "化简公式" : "计算结果";

  return <UtilityShell title={activeModule.title} description={activeModule.hint}>
    <div className="science-tool">
      <div className="science-layout">
        <form ref={form} className="utility-panel utility-controls science-controls" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="science-intro"><h2>计算设置</h2></div>
          <div className="science-examples"><span>试一试</span>{examples.map(([key, label]) => <button key={key} type="button" onClick={() => sample(key)}>{label}</button>)}</div>
          {mode === "expression" && <>
            <div className="science-field-label"><span>公式</span><MathField value={expression} label="表达式公式" onChange={(value) => change(setExpression, value)} onEnter={submit} /></div>
            <div className="science-fields-row"><label>操作<select value={expressionOperation} onChange={(e) => change(setExpressionOperation, e.target.value as typeof expressionOperation)}><option value="evaluate">计算结果</option><option value="simplify">公式化简</option></select></label><label>角度单位<select value={angle} onChange={(e) => change(setAngle, e.target.value as typeof angle)}><option value="deg">角度 DEG</option><option value="rad">弧度 RAD</option></select></label></div>
            <label>变量赋值 <span className="science-optional">可选，每行一个</span><textarea rows={2} value={assignments} maxLength={1000} placeholder={"x=3\ny=1/2"} spellCheck={false} onChange={(e) => change(setAssignments, e.target.value)} /></label>
          </>}
          {mode === "equation" && <>
            <div className="science-equations">{equations.map((value, index) => <div className="science-equation-row" key={index}><div className="science-field-label"><span>方程 {index + 1}</span><MathField value={value} label={`方程 ${index + 1}`} onChange={(next) => change(setEquations, equations.map((entry, i) => i === index ? next : entry))} onEnter={submit} /></div>{equations.length > 1 && <button type="button" className="science-remove" aria-label={`删除方程 ${index + 1}`} onClick={() => change(setEquations, equations.filter((_, i) => i !== index))}><FiX /></button>}</div>)}</div>
            {equations.length < 3 && <button type="button" onClick={() => change(setEquations, [...equations, ""])}>添加方程</button>}
            <div className="science-fields-row"><label>未知量<input value={unknowns} maxLength={12} placeholder="x 或 x,y" spellCheck={false} onChange={(e) => change(setUnknowns, e.target.value)} /></label><label>求解范围<select value={domain} onChange={(e) => change(setDomain, e.target.value as typeof domain)}><option value="real">实数</option><option value="complex">复数</option></select></label></div>
          </>}
          {mode === "calculus" && <>
            <div className="science-field-label"><span>函数</span><MathField value={functionExpression} label="微积分函数" onChange={(value) => change(setFunctionExpression, value)} onEnter={submit} /></div>
            <div className="science-fields-row"><label>操作<select value={calculusOperation} onChange={(e) => change(setCalculusOperation, e.target.value as typeof calculusOperation)}><option value="derivative">求导</option><option value="integral">定积分</option></select></label><label>未知量<input value={variable} maxLength={1} spellCheck={false} onChange={(e) => change(setVariable, e.target.value)} /></label></div>
            {calculusOperation === "derivative" ? <label>导数阶数<select value={order} onChange={(e) => change(setOrder, Number(e.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value} 阶</option>)}</select></label> : <div className="science-fields-row"><label>下限<input value={lower} maxLength={40} placeholder="0" spellCheck={false} onChange={(e) => change(setLower, e.target.value)} /></label><label>上限<input value={upper} maxLength={40} placeholder="1 或 \pi" spellCheck={false} onChange={(e) => change(setUpper, e.target.value)} /></label></div>}
          </>}
          {mode === "matrix" && <>
            <label>操作<select value={matrixOperation} onChange={(e) => change(setMatrixOperation, e.target.value as MatrixOperation)}>{Object.entries(matrixLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <MatrixEditor name="A" value={a} onChange={(value) => change(setA, value)} />
            {(matrixOperation === "add" || matrixOperation === "multiply") && <MatrixEditor name="B" value={b} onChange={(value) => change(setB, value)} />}
          </>}
          {mode === "statistics" && <label>数据<textarea aria-label="统计数据" rows={7} maxLength={200000} value={data} spellCheck={false} placeholder={"例如：12, 15, 18\n支持逗号、空格、换行分隔"} onChange={(e) => change(setData, e.target.value)} /><span className="utility-muted">可以直接粘贴表格里的数字；不要包含列名或千位分隔符。</span></label>}
          {mode === "number" && <>
            <label>操作<select value={numberOperation} onChange={(e) => change(setNumberOperation, e.target.value as NumberOperation)}>{Object.entries(numberLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <div className="science-fields-row"><label>{numberOperation === "gcd" || numberOperation === "lcm" ? "整数 a" : "整数 n"}<input inputMode="numeric" value={n} maxLength={13} onChange={(e) => change(setN, e.target.value)} /></label>{numberOperation !== "prime" && numberOperation !== "factor" && <label>{numberOperation === "gcd" || numberOperation === "lcm" ? "整数 b" : "选取数量 r"}<input inputMode="numeric" value={r} maxLength={13} onChange={(e) => change(setR, e.target.value)} /></label>}</div>
            <p className="utility-muted">{numberOperation === "permutations" || numberOperation === "combinations" ? "0 ≤ r ≤ n ≤ 1000，保留完整整数结果。" : "支持 0 至 10¹² 的整数，质因数分解从 2 开始。"}</p>
          </>}
          <div className="science-submit"><button className="primary-button" type="submit" disabled={busy}><FiPlay aria-hidden="true" />{busy ? "正在计算…" : actionLabel}</button>{busy && <button type="button" onClick={invalidate}>取消</button>}</div>
          {error && <p className="utility-error" role="alert">{error}</p>}
        </form>
        <div className="science-output-column">
          <section className="utility-panel science-result" aria-label="计算结果" aria-busy={busy}>
            <div className="utility-heading"><h2>{result?.title ?? "计算结果"}</h2>{result && <button type="button" aria-label="复制计算结果" onClick={async () => { try { await navigator.clipboard.writeText(resultText(result)); setCopied(true); } catch { setError("复制失败，请手动选择结果复制。"); } }}>{copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}{copied ? "已复制" : "复制"}</button>}</div>
            <div aria-live="polite" aria-atomic="true">
              {!result ? <div className="science-empty"><activeModule.icon aria-hidden="true" /><p>{busy ? "正在计算，稍等片刻" : "编辑输入后，点击计算"}</p><span>{busy ? "可随时取消或修改输入" : "也可以先选择上方示例"}</span></div> : <>
                {result.formulas?.map((entry, index) => <div className="science-result-formula" key={index}><span>{entry.label}</span><MathField value={entry.latex} label={`${entry.label}：${entry.text}`} readOnly /></div>)}
                {result.values && <dl className="science-values">{result.values.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl>}
                {result.matrix && <div className="science-result-matrix"><table aria-label="矩阵计算结果"><tbody>{result.matrix.map((row, index) => <tr key={index}>{row.map((entry, c) => <td key={c}>{entry}</td>)}</tr>)}</tbody></table></div>}
                {result.notes?.map((note) => <p key={note} className="utility-muted science-result-note">{note}</p>)}
                {result.plot && <Link className="science-plot-link" href={`/function-plotter?expression=${encodeURIComponent(result.plot)}`}>绘制这个函数<FiArrowUpRight aria-hidden="true" /></Link>}
              </>}
            </div>
          </section>
          {history.length > 0 && <section className="utility-panel science-history"><div className="utility-heading"><h2>最近计算</h2><button type="button" onClick={() => setHistory([])}>清空</button></div><div>{history.map((entry, index) => <button key={index} type="button" onClick={() => restore(entry)}><span>{entry.result.title}</span><strong>{entry.result.formulas?.[0]?.text ?? entry.result.values?.[0]?.value ?? entry.result.matrix?.map((row) => row.join(", ")).join("; ")}</strong></button>)}</div></section>}
          <p className="utility-muted science-local-note">计算在你的浏览器中完成，公式与数据不会上传。</p>
        </div>
      </div>
    </div>
  </UtilityShell>;
}
