import type { Metadata } from "next";
import AudioBpm from "../components/audio-bpm";
export const metadata: Metadata = { title: "音频 BPM 分析 | 多功能工具箱", description: "本地按区间估算音频节拍速度，支持 BPM 搜索范围、声道选择与 JSON 报告。" };
export default function Page() { return <AudioBpm />; }
