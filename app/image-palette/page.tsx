import type { Metadata } from "next";
import ImagePaletteExtractor from "../components/image-palette-extractor";

export const metadata: Metadata = {
  title: "图片取色与配色提取工具 | 多功能工具箱",
  description: "点击图片取色并自动提取主色、HEX、RGB、HSL 和 CSS 配色。",
};

export default function Page() {
  return <ImagePaletteExtractor />;
}
