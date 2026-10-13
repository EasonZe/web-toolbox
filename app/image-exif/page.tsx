import type { Metadata } from "next";
import Tool from "../components/image-exif";
export const metadata: Metadata = {
  title: "图片 EXIF 查看与清除 | 多功能工具箱",
  description: "查看图片元数据，导出移除元数据的图片。",
};
export default function Page() {
  return <Tool />;
}
