import type { Metadata } from "next";
import PdfExport from "../components/pdf-export";
export const metadata: Metadata = { title: "PDF 转图片与文字 | 多功能工具箱", description: "按页码范围导出 PDF 页面图片或提取文字，本地处理并支持 ZIP 打包。" };
export default function Page() { return <PdfExport />; }
