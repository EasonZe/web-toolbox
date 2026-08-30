import type { Metadata } from "next";
import VideoConverter from "../components/video-converter";

export const metadata: Metadata = {
  title: "视频格式转换工具 | Eason的工具箱",
  description: "将视频转换为MP4、WebM、MOV或MKV，并调整画面大小、帧率与画质。",
};

export default function VideoConverterPage() {
  return <VideoConverter />;
}
