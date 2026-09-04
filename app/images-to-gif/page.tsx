import type { Metadata } from "next";
import ImagesToGif from "../components/images-to-gif";

export const metadata: Metadata = {
  title: "多张图片合成GIF工具 | 多功能工具箱",
  description: "上传并排列多张图片，自定义帧间隔、尺寸、填充方式和循环播放，合成为GIF动画。",
};

export default function ImagesToGifPage() { return <ImagesToGif />; }
