import type { Metadata } from "next";
import VideoTrimmer from "../components/video-trimmer";
export const metadata: Metadata = { title: "视频裁剪 | 多功能工具箱", description: "按起止区间裁剪视频，本地导出 MP4 或 WebM，保留或移除主音轨。" };
export default function Page() { return <VideoTrimmer />; }
