import type { Metadata } from "next";
import ImageColorReplace from "../components/image-color-replace";
export const metadata: Metadata = { title: "图片指定颜色替换 | 多功能工具箱", description: "本地图片取色与颜色替换，调整容差、柔化和强度，导出原尺寸 PNG。" };
export default function Page() { return <ImageColorReplace />; }
