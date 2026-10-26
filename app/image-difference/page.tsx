import type { Metadata } from "next";
import ImageDifferenceTool from "../components/image-difference";
export const metadata: Metadata = { title: "图片差异对比 | 多功能工具箱", description: "本地比较同尺寸图片的视觉像素差异，查看修改区域并导出 PNG。" };
export default function Page() { return <ImageDifferenceTool />; }
