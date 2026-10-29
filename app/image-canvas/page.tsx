import type { Metadata } from "next";
import ImageCanvas from "../components/image-canvas";
export const metadata: Metadata = { title: "图片画布与纯色图 | 多功能工具箱", description: "本地生成纯色和透明 PNG 底图，为图片补背景、扩展画布、调整位置和统一画布尺寸。" };
export default function Page() { return <ImageCanvas />; }
