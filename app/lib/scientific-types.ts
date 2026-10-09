export type ScienceMode = "expression" | "equation" | "calculus" | "matrix" | "statistics" | "number";
export type MatrixOperation = "add" | "multiply" | "determinant" | "inverse" | "transpose";
export type NumberOperation = "prime" | "factor" | "gcd" | "lcm" | "permutations" | "combinations";

export type ScienceRequest =
  | { mode: "expression"; expression: string; variables: string; angle: "deg" | "rad"; operation: "evaluate" | "simplify" }
  | { mode: "equation"; equations: string[]; variables: string; domain: "real" | "complex" }
  | { mode: "calculus"; expression: string; variable: string; operation: "derivative" | "integral"; order: number; lower: string; upper: string }
  | { mode: "matrix"; operation: MatrixOperation; a: string[][]; b: string[][] }
  | { mode: "statistics"; data: string }
  | { mode: "number"; operation: NumberOperation; n: string; r: string };

export type ScienceFormula = { label: string; latex: string; text: string };
export type ScienceResult = {
  title: string;
  formulas?: ScienceFormula[];
  values?: { label: string; value: string }[];
  matrix?: string[][];
  notes?: string[];
  plot?: string;
};

export type ScienceWorkerResponse = { result: ScienceResult } | { error: string };
