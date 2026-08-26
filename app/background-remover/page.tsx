import type { Metadata } from "next";
import BackgroundRemover from "../components/background-remover";

export const metadata: Metadata = {
  title: "智能抠图工具 | Eason的工具箱",
  description:
    "使用IS-Net与BEN2 AI模型移除图片背景，支持透明背景预览、背景色预览与PNG下载。",
};

export default function BackgroundRemoverPage() {
  return <BackgroundRemover />;
}
