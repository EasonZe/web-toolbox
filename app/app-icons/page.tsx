import type { Metadata } from "next";
import AppIcons from "../components/app-icons";
export const metadata: Metadata = { title: "多尺寸应用图标 | 多功能工具箱", description: "本地生成 Web、PWA、Apple 和 Android 传统应用图标，单张 PNG 或 ZIP 下载。" };
export default function Page() { return <AppIcons />; }
