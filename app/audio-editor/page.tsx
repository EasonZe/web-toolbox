import type { Metadata } from "next";
import Tool from "../components/audio-editor";
export const metadata: Metadata = {
  title: "音频裁剪与拼接 | 多功能工具箱",
  description: "区间裁剪、多段合并、淡入淡出并导出 WAV。",
};
export default function Page() {
  return <Tool />;
}
