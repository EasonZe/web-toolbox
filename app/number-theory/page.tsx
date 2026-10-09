import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "数论与组合 | 多功能工具箱", description: "判断质数、分解质因数、求公约数与公倍数，精确计算排列与组合。" };
export default function Page() { return <ScientificTool key="number" mode="number" />; }
