import type { Metadata } from "next";
import IconGenerator from "../components/icon-generator";
export const metadata: Metadata = { title: "ICO 图标制作 | 多功能工具箱", description: "将图片生成多尺寸 ICO 图标，支持透明背景和 PNG 导出。" };
export default function Page() { return <IconGenerator />; }
