import type { Metadata } from "next";
import ShadowGenerator from "../components/shadow-generator";
export const metadata: Metadata = { title: "CSS 阴影生成器 | 多功能工具箱", description: "本地生成多层内外阴影，实时预览并复制或下载 CSS。" };
export default function Page() { return <ShadowGenerator />; }
