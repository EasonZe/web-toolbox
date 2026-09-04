import type { Metadata } from "next";
import VideoToAudio from "../components/video-to-audio";

export const metadata: Metadata = {
  title: "视频提取音频工具 | 多功能工具箱",
  description: "提取视频声音并转换为WAV音频。",
};

export default function VideoToAudioPage() {
  return <VideoToAudio />;
}
