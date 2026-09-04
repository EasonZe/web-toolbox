import type { Metadata } from "next";
import AudioReverser from "../components/audio-reverser";

export const metadata: Metadata = {
  title: "音频倒放工具 | 多功能工具箱",
  description: "在浏览器中将音频倒放，支持试听并下载WAV结果。",
};

export default function AudioReverserPage() {
  return <AudioReverser />;
}
