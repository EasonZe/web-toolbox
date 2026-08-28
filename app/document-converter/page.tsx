import type { Metadata } from "next";
import DocumentConverter from "../components/document-converter";

export const metadata: Metadata = {
  title: "Word与PDF互转工具 | Eason的工具箱",
  description: "将DOCX转换为PDF，或将PDF转换为Word。支持提取可编辑文字、整页图片保留版式、选择纸张大小和方向。",
};

export default function DocumentConverterPage() { return <DocumentConverter />; }
