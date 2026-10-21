import type { Metadata } from "next";
import UnityPackagePreview from "../components/unity-package-preview";
export const metadata: Metadata = { title: "Unity 资源包预览 | 多功能工具箱", description: "本地预览 .unitypackage 资源目录、图片、音频、文本与模型，提取原资源及 .meta。" };
export default function Page() { return <UnityPackagePreview />; }
