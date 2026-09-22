import type { Metadata } from "next";
import VideoTool from "../components/video-tool";

export const metadata: Metadata = {
  title: "抖音视频解析 | 多功能工具箱",
  description:
    "将抖音分享链接转换成可直接播放或下载的视频链接，VRChat视频播放器可使用。",
};

export default function DouyinPage() {
  return (
    <VideoTool
      config={{
        name: "抖音",
        title: "抖音视频解析",
        description:
          "将抖音分享链接转换成可直接播放或下载的视频链接。",
        note: "VRChat视频播放器可使用哦",
        apiPrefix: "https://douyin-api.easonzhan.xyz/?url=",
        placeholder: "粘贴整段分享文字或 https://v.douyin.com/... 链接",
        domains: ["douyin.com", "iesdouyin.com"],
        downloadName: "douyin-video.mp4",
      }}
    />
  );
}
