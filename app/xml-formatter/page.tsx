import type { Metadata } from "next";
import XmlFormatter from "../components/xml-formatter";
export const metadata: Metadata = { title: "XML 格式化与校验 | 多功能工具箱", description: "本地格式化和校验 XML，定位错误行列，复制或导出文档。" };
export default function Page() { return <XmlFormatter />; }
