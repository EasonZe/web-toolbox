import type { Metadata } from "next";
import ImageLineRedraw from "../components/image-line-redraw";

export const metadata: Metadata = {
  title: "图片等宽线条重绘工具 | 多功能工具箱",
  description:
    "提取图片轮廓，并用统一粗细的线条重绘成可下载的线稿。",
};

export default function ImageLineRedrawPage() {
  return <ImageLineRedraw />;
}
