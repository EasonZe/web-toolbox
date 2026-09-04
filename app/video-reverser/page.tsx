import type { Metadata } from "next";
import VideoReverser from "../components/video-reverser";

export const metadata: Metadata = {
  title: "视频倒放工具 | 多功能工具箱",
  description: "在浏览器中倒放视频画面和声音，并导出WebM视频。",
};

export default function VideoReverserPage() {
  return <VideoReverser />;
}
