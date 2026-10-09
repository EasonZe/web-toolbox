import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "数据统计 | 多功能工具箱", description: "粘贴数字即可计算均值、中位数、极值、总体与样本方差和标准差。" };
export default function Page() { return <ScientificTool key="statistics" mode="statistics" />; }
