import type { Metadata } from "next";
import AudioCompressor from "../components/audio-compressor";

export const metadata: Metadata = {
  title: "音频压缩工具 | 多功能工具箱",
  description: "压缩音频文件，自定义码率、采样率和声道，支持导出MP3、M4A和OGG，试听并下载压缩结果。",
};

export default function AudioCompressorPage() {
  return <AudioCompressor />;
}
