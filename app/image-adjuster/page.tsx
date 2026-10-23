import type { Metadata } from "next";
import ImageAdjuster from "../components/image-adjuster";
export const metadata: Metadata = { title: "图片调色与滤镜 | 多功能工具箱", description: "本地调节图片亮度、对比度、饱和度与冷暖，导出原尺寸 PNG。" };
export default function Page() { return <ImageAdjuster />; }
