/// <reference lib="webworker" />
import type { AssetRequest } from "../lib/game-asset-types";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({ data }: MessageEvent<AssetRequest>) => {
  const report = (progress: number, status: string) => scope.postMessage({ type: "progress", progress, status });
  try {
    let result: unknown;
    if (data.action === "unity-read" || data.action === "unity-export") {
      const unity = await import("../lib/unity-package");
      result = data.action === "unity-read" ? await unity.readUnityPackage(data.file, report) : await unity.exportUnityAssets(data.assets, data.includeMeta);
    } else throw new Error("不支持的资源处理操作。");
    scope.postMessage({ result });
  } catch (cause) { scope.postMessage({ error: cause instanceof Error ? cause.message : "资源处理失败，请检查文件。" }); }
};
