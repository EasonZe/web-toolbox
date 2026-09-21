import type { Metadata } from "next";
import VideoWatermark from "../components/video-watermark";

export const metadata: Metadata = { title: "视频加水印工具 | 多功能工具箱", description: "为视频添加文字或图片水印，支持单点、平铺与网格水印，可调整大小和透明度。" };
export default function Page() { return <VideoWatermark />; }
