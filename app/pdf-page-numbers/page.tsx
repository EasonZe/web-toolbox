import type { Metadata } from "next";
import PdfPageTools from "../components/pdf-page-tools";
export const metadata: Metadata = { title: "PDF 加页码 | 多功能工具箱", description: "本地添加 PDF 页码，支持选页、位置、模板、字号和中文字体。" };
export default function Page() { return <PdfPageTools mode="numbers" />; }
