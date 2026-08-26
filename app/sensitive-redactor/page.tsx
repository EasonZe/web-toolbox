import type { Metadata } from "next";
import SensitiveRedactor from "../components/sensitive-redactor";

export const metadata: Metadata = {
  title: "敏感内容打码工具 | Eason的工具箱",
  description: "为图片中的敏感内容添加马赛克、模糊或颜色遮挡。",
};

export default function SensitiveRedactorPage() {
  return <SensitiveRedactor />;
}
