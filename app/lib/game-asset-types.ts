export type UnityAsset = {
  guid: string;
  path: string;
  size: number;
  kind: "图片" | "音频" | "文本" | "模型" | "文件夹" | "其他";
  asset?: Blob;
  meta?: Blob;
  thumbnail?: Blob;
};
export type UnityPackage = { assets: UnityAsset[]; expandedBytes: number };
export type AssetRequest =
  | { action: "unity-read"; file: File }
  | { action: "unity-export"; assets: UnityAsset[]; includeMeta: boolean };
