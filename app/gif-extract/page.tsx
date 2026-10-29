import type { Metadata } from "next";
import GifExtract from "../components/gif-extract";
export const metadata: Metadata = { title: "GIF 拆帧与编辑 | 多功能工具箱", description: "本地还原 GIF 完整帧，导出 PNG 与 ZIP；选择、删除、重排帧并调整延迟和循环后导出 GIF。" };
export default function Page() { return <GifExtract />; }
