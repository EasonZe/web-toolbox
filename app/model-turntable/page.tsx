import type { Metadata } from "next";
import ModelTurntable from "../components/model-turntable";

export const metadata: Metadata = {
  title: "3D模型预览与转台动画 - 多功能工具箱",
  description: "在浏览器本地导入 GLB、GLTF、OBJ、STL 或 FBX 模型，自由预览并导出360度转台动画。",
};

export default function ModelTurntablePage() { return <ModelTurntable />; }
