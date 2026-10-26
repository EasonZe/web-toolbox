import type { Metadata } from "next";
import PptxExtractor from "../components/pptx-extractor";
export const metadata: Metadata = { title: "PPTX 图片与文字提取 | 多功能工具箱", description: "按幻灯片顺序提取 PPTX 文字及原始图片素材，支持单独与打包下载。" };
export default function Page() { return <PptxExtractor />; }
