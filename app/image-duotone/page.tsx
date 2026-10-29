import type { Metadata } from "next";
import ImagePhotoEffects from "../components/image-photo-effects";
export const metadata: Metadata = { title: "图片双色调 | 多功能工具箱", description: "本地图片双色调，调整暗部、亮部颜色和强度，保留透明通道并导出原尺寸 PNG。" };
export default function Page() { return <ImagePhotoEffects kind="duotone" />; }
