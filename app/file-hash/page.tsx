import type { Metadata } from "next";
import FileHash from "../components/file-hash";

export const metadata: Metadata = {
  title: "文件哈希计算工具 | Eason的工具箱",
  description: "计算文件的 MD5、SHA-1、SHA-256、SHA-512，支持拖入文件、分块计算、复制与哈希校验。",
};

export default function FileHashPage() {
  return <FileHash />;
}
