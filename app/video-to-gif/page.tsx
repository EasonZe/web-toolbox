import type { Metadata } from "next";
import VideoToGif from "../components/video-to-gif";

export const metadata: Metadata = {
  title: "视频转GIF工具 | Eason的工具箱",
  description: "截取视频片段并转换为GIF。",
};

export default function VideoToGifPage() {
  return <VideoToGif />;
}
