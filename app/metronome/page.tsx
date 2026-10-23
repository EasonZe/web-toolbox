import type { Metadata } from "next";
import Metronome from "../components/metronome";
export const metadata: Metadata = { title: "节拍器 | 多功能工具箱", description: "调节 BPM、重拍、节奏细分和音量，支持敲击测速。" };
export default function Page() { return <Metronome />; }
