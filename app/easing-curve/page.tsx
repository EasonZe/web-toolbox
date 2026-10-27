import type { Metadata } from "next";
import EasingCurve from "../components/easing-curve";
export const metadata: Metadata = { title: "CSS 缓动曲线 | 多功能工具箱", description: "调节 cubic-bezier 控制点、预览动画并导出 CSS，支持缓动预设与回弹曲线。" };
export default function Page() { return <EasingCurve />; }
