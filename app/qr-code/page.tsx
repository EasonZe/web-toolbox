import type { Metadata } from "next";
import QrGenerator from "../components/qr-generator";

export const metadata: Metadata = {
  title: "二维码生成工具 | Eason的工具箱",
  description:
    "将文字或网址生成自定义二维码，支持颜色、尺寸、容错级别和PNG下载。",
};

export default function QrCodePage() {
  return <QrGenerator />;
}
