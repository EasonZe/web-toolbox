import type { Metadata } from "next";
import DateCalculator from "../components/date-calculator";

export const metadata: Metadata = { title: "日期计算器 | 多功能工具箱", description: "计算日期间隔并按年、月、周、天推算日期。" };
export default function Page() { return <DateCalculator />; }
