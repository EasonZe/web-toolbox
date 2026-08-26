import type { Metadata } from "next";
import ImageCompressor from "../components/image-compressor";

export const metadata: Metadata = {
  title: "批量图片压缩工具 | Eason的工具箱",
  description:
    "批量压缩JPG、PNG与WebP图片，可调节压缩质量并批量下载。",
};

export default function ImageCompressorPage() {
  return <ImageCompressor />;
}
