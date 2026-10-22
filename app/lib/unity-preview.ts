import { safeName } from "./local-files";
import { toolLimits } from "./resource-limits";

export type UnityTextPreview = { value: string; truncated: boolean };

export async function readUnityTextPreview(blob: Blob, limit = toolLimits.unity.textPreviewBytes): Promise<UnityTextPreview> {
  const truncated = blob.size > limit;
  const buffer = await blob.slice(0, limit).arrayBuffer();
  let value: string;
  try {
    // A preview may end inside a valid UTF-8 sequence. Keep that last partial
    // character buffered, but still reject invalid bytes anywhere before it.
    value = new TextDecoder("utf-8", { fatal: true }).decode(buffer, { stream: truncated });
    if (value.includes("\0")) throw new Error("Binary content");
  } catch {
    value = "这是二进制资源或非 UTF-8 文本，可下载后在 Unity 中查看。";
  }
  return { value, truncated };
}

export function unityDownloadNames(path: string) {
  const basename = (path.split("/").at(-1) ?? "").normalize("NFC");
  // Reserve room for .meta in both names so the shortened resource and its
  // metadata still have matching filenames when imported into Unity.
  const max = 180 - ".meta".length;
  const dot = basename.lastIndexOf(".");
  const extension = dot > 0 ? basename.slice(dot) : "";
  const stem = dot > 0 ? basename.slice(0, dot) : basename;
  const room = max - [...extension].length;
  const shortened = room > 0
    ? [...stem].slice(0, room).join("") + extension
    : [...basename].slice(-max).join("");
  const resource = safeName(shortened);
  return { resource, meta: `${resource}.meta` };
}
