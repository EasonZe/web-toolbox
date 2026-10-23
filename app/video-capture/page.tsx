import type { Metadata } from "next";
import VideoCapture from "../components/video-capture";
export const metadata: Metadata = { title: "视频截图与取帧 | 多功能工具箱", description: "本地截取视频画面，区间批量取帧，导出 PNG、JPEG 与 ZIP。" };
export default function Page() { return <VideoCapture />; }
