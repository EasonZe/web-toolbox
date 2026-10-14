import { isConstrainedDevice } from "./resource-limits";
import type { StreamTarget, StreamTargetChunk } from "mediabunny";

/** Retain bounded Blob chunks, not a growing contiguous ArrayBuffer. Supports muxer header rewrites. */
export function createMediaBlobTarget(Target: typeof StreamTarget, maxBytes = (isConstrainedDevice() ? 512 : 1024) * 1048576) {
  let content = new Blob();
  const writable = new WritableStream<StreamTargetChunk>({
    write({ data, position }) {
      const end = position + data.byteLength;
      if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(end) || end > maxBytes)
        throw new Error("导出结果超过本设备的下载缓冲预算，请降低码率、缩短输出区间或分批处理。");
      const parts: BlobPart[] = [content.slice(0, Math.min(position, content.size))];
      if (position > content.size) parts.push(new Uint8Array(position - content.size));
      parts.push(data);
      if (end < content.size) parts.push(content.slice(end));
      content = new Blob(parts);
    },
    abort() { content = new Blob(); },
  });
  return {
    target: new Target(writable, { chunked: true, chunkSize: 2 * 1048576 }),
    get size() { return content.size; },
    blob(mime: string) { return content.slice(0, content.size, mime); },
    clear() { content = new Blob(); },
  };
}
