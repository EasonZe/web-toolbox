import type { Metadata } from "next";
import ImageBlur from "../components/image-blur";
export const metadata: Metadata = { title: "图片模糊 | 多功能工具箱", description: "本地图片全图与局部矩形均值模糊，调整半径和强度，保留透明度并导出原尺寸 PNG；不用于安全脱敏。" };
export default function Page() { return <ImageBlur />; }
