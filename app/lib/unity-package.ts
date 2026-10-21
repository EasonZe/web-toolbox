import { createTarDecoder } from "modern-tar";
import { toolLimits } from "./resource-limits";
import { zipAssetBlobs } from "./asset-zip";
import type { UnityAsset, UnityPackage } from "./game-asset-types";

export function unityPath(value: string) {
  const path = value.normalize("NFC");
  if (!path || path.length > 1000 || /[\\\u0000-\u001f\u007f:<>"|?*]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw new Error("资源包含不安全或无法导出的目录路径。");
  return path;
}
export function unityAssetKind(path: string, folder = false): UnityAsset["kind"] {
  if (folder) return "文件夹";
  if (/\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(path)) return "图片";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) return "音频";
  if (/\.(fbx|obj|glb|gltf|stl|blend)$/i.test(path)) return "模型";
  if (/\.(cs|shader|compute|hlsl|cginc|txt|md|json|xml|yaml|yml|mat|prefab|unity|asset|meta|asmdef|asmref|uss|uxml|csv|anim|controller|overridecontroller|cg|shadersubgraph|shadergraph)$/i.test(path) || /(?:^|\/)(license|readme)(?:\.[^/]*)?$/i.test(path)) return "文本";
  return "其他";
}
export function unityMime(path: string) {
  const ext = path.toLowerCase().split(".").at(-1);
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", avif: "image/avif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}
export async function readUnityPackage(file: Blob, report: (value: number, text: string) => void = () => {}): Promise<UnityPackage> {
  const limits = toolLimits.unity;
  if (!file.size || file.size > limits.fileBytes) throw new Error("资源包为空或超过 512 MB。");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (new TextDecoder().decode(head).startsWith("Unity")) throw new Error("这是运行时 AssetBundle，请使用 AssetStudio 或 Unity 编辑器；本工具读取 .unitypackage 导出包。");
  if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error("请选择有效的 .unitypackage（gzip 压缩的 TAR）文件。");
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 gzip 解压，请升级浏览器。");
  let expandedBytes = 0, records = 0;
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      expandedBytes += chunk.byteLength;
      if (expandedBytes > limits.expandedBytes) throw new Error("资源包解压后超过 1 GB，已停止处理。");
      controller.enqueue(chunk);
    },
  });
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip")).pipeThrough(meter).pipeThrough(createTarDecoder({ strict: true }));
  const reader = stream.getReader();
  const groups = new Map<string, Map<string, Blob>>();
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      if (++records > limits.entries) throw new Error("资源包条目过多，最多支持 100000 个 TAR 条目。");
      const name = entry.header.name.replace(/^(?:\.\/)+/, "").replace(/\/$/, "");
      if (entry.header.type === "directory") {
        if (name && name !== "." && !/^[a-f\d]{32}$/i.test(name)) throw new Error("不是标准的 Unity 导出包目录。");
        await entry.body.cancel();
        continue;
      }
      if (entry.header.type !== "file") throw new Error("资源包包含链接或不支持的 TAR 条目。");
      const match = /^([a-f\d]{32})\/(asset|asset\.meta|pathname|preview\.png)$/i.exec(name);
      if (!match) throw new Error(`不支持的 Unity 包条目：${name.slice(0, 100)}`);
      const guid = match[1].toLowerCase(), key = match[2].toLowerCase();
      let group = groups.get(guid);
      if (!group) {
        if (groups.size >= limits.assets) throw new Error("最多支持 20000 项 Unity 资源。");
        groups.set(guid, group = new Map());
      }
      if (group.has(key)) throw new Error("资源包含有重复条目。");
      const max = key === "pathname" ? 4096 : key === "asset.meta" ? toolLimits.text.fileBytes : limits.entryBytes;
      if (!Number.isSafeInteger(entry.header.size) || entry.header.size < 0 || entry.header.size > max) throw new Error("资源条目体积超出处理范围。");
      const blob = await new Response(entry.body).blob();
      if (blob.size !== entry.header.size) throw new Error("资源数据已截断。");
      group.set(key, blob);
      if (records % 40 === 0) report(Math.min(90, 5 + groups.size / 200), `正在读取 ${groups.size} 项资源…`);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const assets: UnityAsset[] = [], paths = new Set<string>(), parentPaths = new Set<string>();
  const entries: { guid: string; path: string; asset?: Blob; meta?: Blob; thumbnail?: Blob; metaText: string }[] = [];
  for (const [guid, group] of groups) {
    const pathFile = group.get("pathname");
    if (!pathFile) throw new Error("资源缺少 pathname，无法还原目录。");
    const path = unityPath(new TextDecoder("utf-8", { fatal: true }).decode(await pathFile.arrayBuffer()).replace(/[\r\n]+$/, ""));
    if (paths.has(path.toLocaleLowerCase())) throw new Error(`资源路径重复：${path}`);
    paths.add(path.toLocaleLowerCase());
    const asset = group.get("asset"), meta = group.get("asset.meta");
    const metaText = meta ? (await meta.slice(0, 65536).text()).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n") : "";
    const segments = path.toLocaleLowerCase().split("/");
    for (let depth = 1; depth < segments.length; depth++) parentPaths.add(segments.slice(0, depth).join("/"));
    entries.push({ guid, path, asset, meta, metaText, thumbnail: group.get("preview.png") });
  }
  for (const { guid, path, asset, meta, metaText, thumbnail } of entries) {
    const folderFlag = /^folderAsset:[ \t]*(yes|true|1|no|false|0)[ \t]*(?:#.*)?$/im.exec(metaText)?.[1].toLowerCase();
    const declaredFolder = folderFlag === "yes" || folderFlag === "true" || folderFlag === "1";
    const declaredFile = folderFlag === "no" || folderFlag === "false" || folderFlag === "0";
    const fileImporter = /^(?!DefaultImporter\b)[A-Za-z][A-Za-z\d_]*Importer[ \t]*:/m.test(metaText);
    const hasChildren = parentPaths.has(path.toLocaleLowerCase());
    // Exporters such as VPMPackageAutoInstaller omit folderAsset entirely.
    // Their directory entry has pathname + minimal .meta, but no asset body.
    // Descendant paths also identify structural directories without metadata.
    const minimalMeta = /^fileFormatVersion:[ \t]*\d+[ \t]*$/m.test(metaText) &&
      new RegExp(`^guid:[ \\t]*${guid}[ \\t]*$`, "im").test(metaText);
    const inferredFolder = !declaredFile && !fileImporter &&
      ((!asset && (hasChildren || minimalMeta)) || (asset?.size === 0 && hasChildren));
    const folder = declaredFolder || inferredFolder;
    if (folder && asset?.size) throw new Error(`文件夹资源包含非空文件：${path}`);
    if (!folder && hasChildren) throw new Error(`文件资源与子目录路径冲突：${path}`);
    if (!asset && !folder) throw new Error(`资源缺少文件内容：${path}`);
    assets.push({ guid, path, kind: unityAssetKind(path, folder), size: asset?.size ?? 0, asset: folder ? undefined : asset?.slice(0, asset.size, unityMime(path)), meta, thumbnail: thumbnail?.slice(0, undefined, "image/png") });
  }
  if (!assets.length) throw new Error("包中没有可识别的 Unity 资源。");
  assets.sort((a, b) => a.path.localeCompare(b.path, "zh-CN", { numeric: true }));
  return { assets, expandedBytes };
}
export async function exportUnityAssets(assets: UnityAsset[], includeMeta: boolean) {
  const entries: { name: string; blob: Blob }[] = [];
  if (!assets.length) throw new Error("请先选择资源。");
  for (const asset of assets) {
    const path = unityPath(asset.path);
    if (asset.kind === "文件夹") entries.push({ name: `${path}/`, blob: new Blob() });
    else if (asset.asset) entries.push({ name: path, blob: asset.asset });
    if (includeMeta && asset.meta) entries.push({ name: `${path}.meta`, blob: asset.meta });
  }
  return zipAssetBlobs(entries);
}
