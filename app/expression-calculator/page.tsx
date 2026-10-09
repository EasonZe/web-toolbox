import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "表达式计算 | 多功能工具箱", description: "支持可视化公式输入、分数、复数、变量代入与公式化简。" };
export default function Page() { return <ScientificTool key="expression" mode="expression" />; }
