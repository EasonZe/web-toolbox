import type { Metadata } from "next";
import AudioSpeedPitch from "../components/audio-speed-pitch";

export const metadata: Metadata = { title: "音频变速与变调 | 多功能工具箱", description: "独立调整音频播放速度和音高，试听并导出WAV。" };
export default function Page() { return <AudioSpeedPitch />; }
