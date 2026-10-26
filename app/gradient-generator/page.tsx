import type { Metadata } from "next";
import GradientGenerator from "../components/gradient-generator";
export const metadata: Metadata = { title: "渐变色生成器 | 多功能工具箱", description: "调整色标、透明度、方向与插值空间，导出渐变 CSS、SVG 和 PNG。" };
export default function Page() { return <GradientGenerator />; }
