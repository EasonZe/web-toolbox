import { calculateFileHashes } from "../lib/file-hash-engine";
import type { HashAlgorithm, HashWorkerMessage } from "../lib/file-hash";

const send = (message: HashWorkerMessage) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<{ file: File; algorithms: HashAlgorithm[] }>) => {
  try {
    const { file, algorithms } = event.data;
    const results = await calculateFileHashes(file, algorithms, (loaded, total) => {
      send({ type: "progress", loaded, total });
    });
    send({ type: "done", results });
  } catch {
    send({ type: "error", message: "文件读取或计算失败，请重新选择文件后重试。" });
  }
};
