import type { Metadata } from "next";
import ImageCropper from "../components/image-cropper";

export const metadata: Metadata = {
  title: "图片裁剪工具 | Eason的工具箱",
  description: "上传图片，自定义裁剪比例、位置、尺寸、旋转和输出格式后下载。",
};

export default function ImageCropperPage() {
  return <ImageCropper />;
}
