import type { Metadata } from "next";
import VideoTool from "../components/video-tool";

export const metadata: Metadata = {
  title: "快手视频解析 | Eason的工具箱",
  description:
    "将快手分享链接转换成可直接播放或下载的无水印视频链接，VRChat视频播放器可使用。",
};

export default function KuaishouPage() {
  return (
    <VideoTool
      config={{
        name: "快手",
        title: "快手视频解析",
        description:
          "将快手分享链接转换成可直接播放或下载的无水印视频链接。",
        note: "VRChat视频播放器可使用哦",
        apiPrefix: "https://kuaishou-api.easonzhan.xyz/?url=",
        placeholder: "粘贴整段分享文字或 https://www.kuaishou.com/f/... 链接",
        domains: ["kuaishou.com", "gifshow.com", "chenzhongtech.com"],
        downloadName: "kuaishou-video.mp4",
      }}
    />
  );
}
