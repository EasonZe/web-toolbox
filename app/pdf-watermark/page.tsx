import type { Metadata } from "next";
import PdfWatermark from "../components/pdf-watermark";
export const metadata: Metadata = { title: "PDF 文字水印 | 多功能工具箱", description: "本地为 PDF 添加单个、网格或交错平铺文字水印，支持中文、角度、不透明度及指定页码。" };
export default function Page() { return <PdfWatermark />; }
