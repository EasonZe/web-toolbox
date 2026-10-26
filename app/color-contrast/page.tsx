import type { Metadata } from "next";
import ColorContrast from "../components/color-contrast";
export const metadata: Metadata = { title: "颜色对比度检查 | 多功能工具箱", description: "检查文字与背景的 WCAG 对比度，支持透明度、预览及 CSS 导出。" };
export default function Page() { return <ColorContrast />; }
