import type { Metadata } from "next";
import ImageConverter from "../components/image-converter";

export const metadata: Metadata = {
  title: "图片格式转换工具 | Eason的工具箱",
  description:
    "批量将图片转换为PNG、JPG或WebP格式，支持质量调节、单张下载与全部下载。",
};

export default function ImageConverterPage() {
  return <ImageConverter />;
}
