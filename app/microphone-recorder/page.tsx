import type { Metadata } from "next";
import MicrophoneRecorder from "../components/microphone-recorder";

export const metadata: Metadata = {
  title: "麦克风测试与录音工具 | 多功能工具箱",
  description: "测试麦克风音量与波形，并录制、试听和下载声音。",
};

export default function Page() {
  return <MicrophoneRecorder />;
}
