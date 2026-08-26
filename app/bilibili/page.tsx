import type { Metadata } from "next";
import VideoTool from "../components/video-tool";

export const metadata: Metadata = {
  title: "B站视频解析 | Eason的工具箱",
  description:
    "将B站分享链接转换成可直接播放或下载的视频链接，VRChat视频播放器可使用。",
};

export default function BilibiliPage() {
  return (
    <VideoTool
      config={{
        name: "B站",
        title: "B站视频解析",
        description: "将B站分享链接转换成可直接播放或下载的视频链接。",
        note: "VRChat视频播放器可使用哦",
        apiPrefix: "https://bilibili-api.easonzhan.xyz/?url=",
        placeholder:
          "粘贴整段分享文字、BV 号或 https://www.bilibili.com/video/BV... 链接",
        domains: ["bilibili.com", "b23.tv", "bili2233.cn"],
        downloadName: "bilibili-video.mp4",
        canonicalizeBilibili: true,
      }}
    />
  );
}
