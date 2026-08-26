import type { Metadata } from "next";
import AsciiArtGenerator from "../components/ascii-art-generator";

export const metadata: Metadata = {
  title: "ASCII字符画生成工具 | Eason的工具箱",
  description: "输入中英文文字，生成可调节字体、字符样式和宽度的ASCII字符画。",
};

export default function AsciiArtPage() {
  return <AsciiArtGenerator />;
}
