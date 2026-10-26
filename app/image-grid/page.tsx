import type { Metadata } from "next";
import ImageGrid from "../components/image-grid";
export const metadata: Metadata = { title: "图片九宫格与网格切分 | 多功能工具箱", description: "本地将普通图片切成多张网格图片，预览编号、切分范围并打包下载。" };
export default function Page() { return <ImageGrid />; }
