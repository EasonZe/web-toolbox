import type { Metadata } from "next";
import PdfPageTools from "../components/pdf-page-tools";
export const metadata: Metadata = { title: "PDF 页面裁剪 | 多功能工具箱", description: "按视觉方向裁切 PDF 四边，支持旋转页与页码范围。" };
export default function Page() { return <PdfPageTools mode="crop" />; }
