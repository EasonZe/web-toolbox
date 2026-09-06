import type { Metadata } from "next";
import Calculator from "../components/calculator";

export const metadata: Metadata = { title: "计算器 | 多功能工具箱", description: "四则运算、百分比、括号和科学计算。" };
export default function Page() { return <Calculator />; }
