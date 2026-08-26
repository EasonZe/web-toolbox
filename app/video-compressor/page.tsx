import type { Metadata } from "next";
import VideoCompressor from "../components/video-compressor";

export const metadata: Metadata = {
  title: "视频压缩工具 | Eason的工具箱",
  description: "压缩视频，可调节压缩质量、分辨率与帧率。",
};

export default function VideoCompressorPage() {
  return <VideoCompressor />;
}
