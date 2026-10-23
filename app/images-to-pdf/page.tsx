import type { Metadata } from "next";
import ImagesToPdf from "../components/images-to-pdf";
export const metadata: Metadata = { title: "图片转 PDF | 多功能工具箱", description: "多张图片按顺序合成 PDF，自定义纸张、方向、边距与清晰度，本地处理。" };
export default function Page() { return <ImagesToPdf />; }
