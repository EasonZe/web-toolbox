import type { Metadata } from "next";
import ImageRounded from "../components/image-rounded";
export const metadata: Metadata = { title: "图片圆角与边框 | 多功能工具箱", description: "设置图片圆角、圆形遮罩及内外边框，本地导出透明 PNG。" };
export default function Page() { return <ImageRounded />; }
