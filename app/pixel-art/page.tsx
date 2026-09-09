import type { Metadata } from "next";
import PixelArtConverter from "../components/pixel-art-converter";

export const metadata: Metadata = {
  title: "图片转像素画工具 | 多功能工具箱",
  description: "将图片量化为可调像素尺寸、色数和抖动方式的像素画。",
};

export default function Page() {
  return <PixelArtConverter />;
}
