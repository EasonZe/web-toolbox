import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "微积分计算 | 多功能工具箱", description: "计算一至三阶导数及连续实函数的定积分，并衔接函数图像绘制。" };
export default function Page() { return <ScientificTool key="calculus" mode="calculus" />; }
