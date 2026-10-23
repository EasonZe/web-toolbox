import type { Metadata } from "next";
import BarcodeGenerator from "../components/barcode-generator";
export const metadata: Metadata = { title: "条形码生成 | 多功能工具箱", description: "生成 Code 128、Code 39、EAN、UPC 和 ITF-14 条形码，导出 SVG 与 PNG。" };
export default function Page() { return <BarcodeGenerator />; }
