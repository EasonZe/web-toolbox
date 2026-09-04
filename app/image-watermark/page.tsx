import type { Metadata } from "next";
import ImageWatermark from "../components/image-watermark";

export const metadata: Metadata = {
  title: "图片加水印工具 | 多功能工具箱",
  description: "为图片添加文字或图片水印，支持单点、平铺与网格水印。",
};

export default function ImageWatermarkPage() {
  return <ImageWatermark />;
}
