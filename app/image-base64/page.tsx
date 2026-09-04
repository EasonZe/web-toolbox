import type { Metadata } from "next";
import ImageBase64 from "../components/image-base64";

export const metadata: Metadata = {
  title: "图片与Base64互转工具 | 多功能工具箱",
  description: "图片转Base64编码，或将Data URL、纯Base64还原为图片。支持PNG、JPG、WebP、GIF等格式，复制编码、下载TXT和图片。",
};

export default function ImageBase64Page() { return <ImageBase64 />; }
