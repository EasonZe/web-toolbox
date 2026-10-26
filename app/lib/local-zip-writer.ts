import { Zip, ZipPassThrough } from "fflate";
import { validateArchivePath } from "./local-files";
import { toolLimits } from "./resource-limits";
/** Sequential, already-encoded images need no additional compression. */
export class LocalZipWriter {
  private chunks: Uint8Array<ArrayBuffer>[] = [];
  private bytes = 0;
  private entries = 0;
  private names = new Set<string>();
  private complete = false;
  private error: Error | null = null;
  private zip: Zip;
  constructor(private budget: number) {
    this.zip = new Zip((error, chunk, final) => {
      if (error) this.error = error;
      else {
        this.bytes += chunk.length;
        if (this.bytes > budget) this.error = new Error("打包输出超过本设备的内存预算，请减少页数 / 网格或降低图片尺寸。");
        else this.chunks.push(new Uint8Array(chunk));
        this.complete = final;
      }
    });
  }
  async add(name: string, blob: Blob, signal: AbortSignal) {
    signal.throwIfAborted(); validateArchivePath(name);
    if (this.names.has(name)) throw new Error("ZIP 文件名不能重复。");
    this.names.add(name);
    if (++this.entries > toolLimits.archive.entries || this.complete || this.error) throw this.error ?? new Error("ZIP 条目无效或过多。");
    if (blob.size + this.bytes > this.budget) throw new Error("打包输出超过本设备的内存预算，请减少页数 / 网格或降低图片尺寸。");
    const data = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted();
    const entry = new ZipPassThrough(name); this.zip.add(entry); entry.push(data, true);
    if (this.error) throw this.error;
  }
  finish() {
    this.zip.end();
    if (this.error) throw this.error;
    if (!this.complete) throw new Error("ZIP 打包尚未完成。");
    const result = new Blob(this.chunks, { type: "application/zip" }); this.chunks = []; return result;
  }
  dispose() { if (!this.complete) this.zip.terminate(); this.chunks = []; }
}
