import type { Metadata } from "next";
import ImageDpi from "../components/image-dpi";
export const metadata: Metadata = { title: "图片 DPI 修改 | 多功能工具箱", description: "无损修改 PNG / JPEG 分辨率元数据，保留原始像素。" };
export default function Page() { return <ImageDpi />; }
