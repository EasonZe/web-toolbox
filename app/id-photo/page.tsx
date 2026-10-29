import type { Metadata } from "next";
import Tool from "../components/id-photo";
export const metadata: Metadata = { title: "证件照制作与排版 | 多功能工具箱", description: "本地裁切、底色、人像抠图与相纸排版，导出含 DPI 信息的图片。" };
export default function Page() { return <Tool />; }
