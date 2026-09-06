import type { Metadata } from "next";
import VideoWatermark from "../components/video-watermark";

export const metadata: Metadata = { title: "视频加水印工具 | 多功能工具箱", description: "为视频添加文字或图片水印，调整位置、大小、透明度并导出。" };
export default function Page() { return <VideoWatermark />; }
