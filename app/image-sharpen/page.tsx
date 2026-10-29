import type { Metadata } from "next";
import ImagePhotoEffects from "../components/image-photo-effects";
export const metadata: Metadata = { title: "图片锐化 | 多功能工具箱", description: "本地图片反差锐化，调整半径、强度和细节阈值，保留透明度并导出原尺寸 PNG；不是 AI 复原。" };
export default function Page() { return <ImagePhotoEffects kind="sharpen" />; }
