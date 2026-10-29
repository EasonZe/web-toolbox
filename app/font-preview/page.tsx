import type { Metadata } from "next";
import FontPreview from "../components/font-preview";
export const metadata: Metadata = { title: "本地字体预览 | 多功能工具箱", description: "在浏览器中临时加载 TTF、OTF、WOFF、WOFF2，调整预览文字、字号与字重，不安装或上传字体。" };
export default function Page() { return <FontPreview />; }
