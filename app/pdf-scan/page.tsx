import type { Metadata } from "next";
import PdfScan from "../components/pdf-scan";
export const metadata: Metadata = { title: "PDF 转扫描件 | 多功能工具箱", description: "本地将 PDF 页面转为原彩、灰度或黑白图片型 PDF，按范围导出。" };
export default function Page() { return <PdfScan />; }
