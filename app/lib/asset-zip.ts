import { Zip, ZipPassThrough } from "fflate";

// Blob chunks avoid constructing another complete uncompressed archive buffer.
export async function zipAssetBlobs(entries: { name: string; blob: Blob }[]) {
  const parts: BlobPart[] = [];
  let failure: Error | null = null;
  let complete = false;
  const seen = new Set<string>();
  const zip = new Zip((error, data, final) => {
    if (error) failure = error;
    else parts.push(new Uint8Array(data));
    if (final) complete = true;
  });
  try {
    for (const entry of entries) {
      if (seen.has(entry.name.toLocaleLowerCase())) throw new Error(`导出路径重复：${entry.name}`);
      seen.add(entry.name.toLocaleLowerCase());
      const item = new ZipPassThrough(entry.name);
      zip.add(item);
      const reader = entry.blob.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          item.push(value);
          if (failure) throw failure;
        }
      } finally { reader.releaseLock(); }
      item.push(new Uint8Array(), true);
    }
    zip.end();
    if (failure) throw failure;
    if (!complete) throw new Error("ZIP 打包未完成。");
    return new Blob(parts, { type: "application/zip" });
  } catch (cause) { zip.terminate(); throw cause; }
}
