import type { Metadata } from "next";
import Teleprompter from "../components/teleprompter";
export const metadata: Metadata = { title: "提词器 | 多功能工具箱", description: "本地稿件自动滚动，支持速度、字号、暂停、镜像和全屏。" };
export default function Page() { return <Teleprompter />; }
