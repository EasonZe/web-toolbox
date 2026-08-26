import type { Metadata } from "next";
import ColorConverter from "../components/color-converter";

export const metadata: Metadata = {
  title: "颜色格式转换工具 | Eason的工具箱",
  description:
    "转换 HEX、RGB、HSL、HSV/HSB 与 CMYK 颜色格式。",
};

export default function ColorPage() {
  return <ColorConverter />;
}
