import type { Metadata } from "next";
import TextureMemory from "../components/texture-memory";
export const metadata: Metadata = { title: "贴图显存估算 | 多功能工具箱", description: "按尺寸、数量、纹理阵列、立方体面与 Mipmap 逐级估算 BC、ETC2、ASTC 和未压缩纹理数据量。" };
export default function Page() { return <TextureMemory />; }
