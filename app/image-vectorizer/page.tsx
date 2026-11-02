import type { Metadata } from "next";
import ImageVectorizer from "../components/image-vectorizer";
export const metadata: Metadata = { title: "图片转 SVG 矢量图 | 多功能工具箱", description: "本地 PNG、JPG、WebP、AVIF 和 BMP 图片描摹为真实 SVG 矢量路径，调整颜色、线条拟合、小斑点过滤与透明背景，预览并下载。" };
export default function Page() { return <ImageVectorizer />; }
