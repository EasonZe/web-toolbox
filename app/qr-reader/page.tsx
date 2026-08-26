import type { Metadata } from "next";
import QrReader from "../components/qr-reader";

export const metadata: Metadata = {
  title: "二维码解析工具 | Eason的工具箱",
  description:
    "识别二维码图片，支持上传、拖放或粘贴截图，并可复制解析结果。",
};

export default function QrReaderPage() {
  return <QrReader />;
}
