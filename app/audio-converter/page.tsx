import type { Metadata } from "next";
import AudioConverter from "../components/audio-converter";

export const metadata: Metadata = {
  title: "音频格式转换工具 | Eason的工具箱",
  description:
    "转换音频格式，支持导出WAV、MP3、M4A、OGG和WebM，并可调整采样率、声道与码率。",
};

export default function AudioConverterPage() {
  return <AudioConverter />;
}
