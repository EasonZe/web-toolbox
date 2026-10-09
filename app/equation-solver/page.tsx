import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "方程求解 | 多功能工具箱", description: "求解常见一元方程和方程组，可选择实数或复数解。" };
export default function Page() { return <ScientificTool key="equation" mode="equation" />; }
