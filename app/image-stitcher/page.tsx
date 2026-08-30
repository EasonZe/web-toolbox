import type { Metadata } from "next";
import ImageStitcher from "../components/image-stitcher";

export const metadata: Metadata = {
  title: "图片拼接工具 | Eason的工具箱",
  description: "批量排列多张图片，自定义方向、尺寸、间距、对齐和背景后拼接导出。",
};

export default function ImageStitcherPage() {
  return <ImageStitcher />;
}
