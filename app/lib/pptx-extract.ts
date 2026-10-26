import { SaxesParser, type SaxesTagNS } from "saxes";
import { inspectZip, extractZipEntries } from "./local-archive";
import { LocalZipWriter } from "./local-zip-writer";
import { toolLimits, isConstrainedDevice } from "./resource-limits";
import { validateArchivePath } from "./local-files";
const pNamespaces = new Set(["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"]);
const aNamespaces = new Set(["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"]);
const rNamespaces = new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"]);
const packageR = "http://schemas.openxmlformats.org/package/2006/relationships", contentNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";
export function readOfficeXml(bytes: Uint8Array, callbacks: { open?: (tag: SaxesTagNS, depth: number) => void; text?: (text: string) => void; close?: (tag: SaxesTagNS, depth: number) => void }, signal: AbortSignal) {
  if (!bytes.length || bytes.length > toolLimits.officeXml.bytes) throw new Error("XML 为空或超过 16 MiB，请精简演示文稿。");
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 60 && bytes[1] === 0 ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 60 ? "utf-16be" : "utf-8";
  let xml: string; try { xml = new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { throw new Error("XML 文本编码无效。"); }
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("不允许 XML DTD 或实体声明。");
  let depth = 0, nodes = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", (error) => { throw new Error(`XML 无法解析：${error.message}`); });
  parser.on("xmldecl", (decl) => { if (decl.encoding && !/^(utf-8|utf-16(?:le|be)?|us-ascii)$/i.test(decl.encoding)) throw new Error("仅支持 UTF-8 / UTF-16 XML。"); });
  parser.on("doctype", () => { throw new Error("不允许 XML DTD。"); });
  parser.on("opentag", (tag) => { if (++depth > toolLimits.structured.depth || ++nodes > toolLimits.structured.nodes) throw new Error("XML 嵌套或节点数量超过安全预算。"); callbacks.open?.(tag, depth); });
  parser.on("closetag", (tag) => { callbacks.close?.(tag, depth); depth--; });
  parser.on("text", (text) => callbacks.text?.(text)); parser.on("cdata", (text) => callbacks.text?.(text));
  for (let i = 0; i < xml.length; i += 65536) { signal.throwIfAborted(); parser.write(xml.slice(i, i + 65536)); } parser.close(); signal.throwIfAborted();
}
function attr(tag: SaxesTagNS, local: string, namespaces?: Set<string>) { return Object.values(tag.attributes).find((item) => item.local === local && (namespaces ? namespaces.has(item.uri) : !item.uri))?.value ?? ""; }
function readPartXml(bytes: Uint8Array, roots: Set<string>, root: string, signal: AbortSignal, child: (tag: SaxesTagNS, depth: number) => void) {
  readOfficeXml(bytes, { open(tag, depth) { if (depth === 1 && (!roots.has(tag.uri) || tag.local !== root)) throw new Error(`PPTX ${root} 根元素无效。`); child(tag, depth); } }, signal);
}
export function resolveOfficePart(base: string, target: string) {
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) throw new Error("不允许外部资源地址。");
  let decoded: string; try { decoded = decodeURIComponent(target); } catch { throw new Error("包内资源路径编码无效。"); }
  if (/[\\?#\u0000-\u001f]/.test(decoded) || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith("//")) throw new Error("包内资源路径无效。");
  const parts = decoded.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const piece of decoded.split("/")) { if (!piece || piece === ".") continue; if (piece === "..") { if (!parts.length) throw new Error("资源路径越出 ZIP 根目录。"); parts.pop(); } else parts.push(piece); }
  return validateArchivePath(parts.join("/"));
}
export function slideText(bytes: Uint8Array, signal: AbortSignal) {
  const paragraphs: string[] = []; let paragraph = "", inParagraph = 0, inText = 0, characters = 0, first = true;
  readOfficeXml(bytes, {
    open(tag) { if (first) { first = false; if (!pNamespaces.has(tag.uri) || tag.local !== "sld") throw new Error("幻灯片根元素无效。"); } if (aNamespaces.has(tag.uri) && tag.local === "p") { if (inParagraph) throw new Error("文字段落结构无效。"); inParagraph++; paragraph = ""; } if (aNamespaces.has(tag.uri) && tag.local === "t" && inParagraph) inText++; if (aNamespaces.has(tag.uri) && tag.local === "br" && inParagraph) paragraph += "\n"; },
    text(text) { if (inText) { characters += text.length; if (characters > toolLimits.text.resultChars) throw new Error("文字超过输出预算。"); paragraph += text; } },
    close(tag) { if (aNamespaces.has(tag.uri) && tag.local === "t" && inText) inText--; if (aNamespaces.has(tag.uri) && tag.local === "p" && inParagraph) { paragraphs.push(paragraph); inParagraph--; } },
  }, signal);
  return paragraphs.join("\n");
}
export type PptxImage = { name: string; source: string; mime: string; size: number; blob: Blob };
export async function extractPptx(file: File, signal: AbortSignal, report: (n: number, text: string) => void = () => {}) {
  if (!/\.pptx$/i.test(file.name) || !file.size || file.size > toolLimits.document.fileBytes) throw new Error("请选择非空 .pptx 文件，最多 200 MiB；不支持 .ppt / .pptm。");
  signal.throwIfAborted(); const data = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted(); report(3, "正在校验 PPTX 压缩包…");
  const entries = inspectZip(data), budget = toolLimits.archive.expandedBytes / (isConstrainedDevice() ? 2 : 1);
  if (entries.reduce((n, entry) => n + entry.size, 0) > budget) throw new Error("PPTX 展开体积超过本设备预算，请拆分文件。");
  const headerNames = ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"];
  if (headerNames.some((name) => (entries.find((entry) => entry.name === name)?.size ?? Infinity) > toolLimits.officeXml.bytes)) throw new Error("PPTX 结构文件缺失或过大。");
  const initial = extractZipEntries(data, new Set(headerNames));
  const defaults = new Map<string, string>(), overrides = new Map<string, string>();
  readPartXml(initial["[Content_Types].xml"], new Set([contentNamespace]), "Types", signal, (tag, depth) => { if (depth !== 2 || tag.uri !== contentNamespace) return; if (tag.local === "Default") { const extension = attr(tag, "Extension").toLowerCase(); if (!extension || defaults.has(extension)) throw new Error("默认内容类型为空或重复。"); defaults.set(extension, attr(tag, "ContentType")); } if (tag.local === "Override") { const name = resolveOfficePart("", attr(tag, "PartName")); if (overrides.has(name)) throw new Error("内容类型条目重复。"); overrides.set(name, attr(tag, "ContentType")); } });
  if (overrides.get("ppt/presentation.xml") !== "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml") throw new Error("文件不是标准 PPTX 演示文稿，或含有不支持的宏格式。");
  const relations = new Map<string, string>(), relationIds = new Set<string>();
  readPartXml(initial["ppt/_rels/presentation.xml.rels"], new Set([packageR]), "Relationships", signal, (tag, depth) => { if (depth === 2 && tag.uri === packageR && tag.local === "Relationship") { const id = attr(tag, "Id"), type = attr(tag, "Type"); if (!id || relationIds.has(id)) throw new Error("关系编号为空或重复。"); relationIds.add(id); if ([...rNamespaces].some((uri) => type === `${uri}/slide`) && attr(tag, "TargetMode") !== "External") relations.set(id, resolveOfficePart("ppt/presentation.xml", attr(tag, "Target"))); } });
  const slides: string[] = [], used = new Set<string>();
  let inSlideList = false;
  readOfficeXml(initial["ppt/presentation.xml"], { open(tag, depth) { if (depth === 1 && (!pNamespaces.has(tag.uri) || tag.local !== "presentation")) throw new Error("PPTX presentation 根元素无效。"); if (depth === 2) inSlideList = pNamespaces.has(tag.uri) && tag.local === "sldIdLst"; if (depth === 3 && inSlideList && pNamespaces.has(tag.uri) && tag.local === "sldId") { const part = relations.get(attr(tag, "id", rNamespaces)); if (!part || used.has(part)) throw new Error("幻灯片关系缺失、外部引用或重复。"); used.add(part); slides.push(part); } }, close(_tag, depth) { if (depth === 2) inSlideList = false; } }, signal);
  if (!slides.length || slides.length > toolLimits.document.pages) throw new Error("幻灯片须为 1–1000 页。");
  const imageEntries = entries.filter((entry) => entry.name.startsWith("ppt/media/") && !entry.name.endsWith("/") && (overrides.get(entry.name) ?? defaults.get(entry.name.split(".").at(-1)!.toLowerCase()) ?? "").startsWith("image/"));
  const names = new Set([...slides, ...imageEntries.map((entry) => entry.name)]);
  for (const part of slides) { const entry = entries.find((entry) => entry.name === part); if (!entry || entry.size > toolLimits.officeXml.bytes) throw new Error("幻灯片缺失或 XML 过大。"); }
  report(10, "正在提取幻灯片与图片素材…"); const extracted = extractZipEntries(data, names), zip = new LocalZipWriter(budget);
  const texts: string[] = [], images: PptxImage[] = []; let characters = 0, emptySlides = 0;
  try {
    for (let i = 0; i < slides.length; i++) { signal.throwIfAborted(); const text = slideText(extracted[slides[i]], signal); characters += text.length; if (characters > toolLimits.text.resultChars) throw new Error("幻灯片文字超过 3200 万字符，请拆分文件。"); if (!text.trim()) emptySlides++; texts.push(`--- 第 ${i + 1} 页（${slides[i]}） ---\n${text}`); report(15 + i / slides.length * 35, `正在提取第 ${i + 1} 页文字`); }
    for (let i = 0; i < imageEntries.length; i++) { signal.throwIfAborted(); const entry = imageEntries[i], name = `images/${entry.name.slice("ppt/media/".length)}`, mime = overrides.get(entry.name) ?? defaults.get(entry.name.split(".").at(-1)!.toLowerCase()) ?? "application/octet-stream";
      // Declared MIME is informational; no package image or SVG is executed or previewed.
      const blob = new Blob([new Uint8Array(extracted[entry.name])], { type: "application/octet-stream" }); images.push({ name, source: entry.name, mime, size: entry.size, blob }); await zip.add(name, blob, signal); report(50 + i / Math.max(1, imageEntries.length) * 40, `正在打包图片 ${i + 1} / ${imageEntries.length}`); }
    const text = texts.join("\n\n"), textBlob = new Blob([text], { type: "text/plain;charset=utf-8" }); await zip.add("slides.txt", textBlob, signal);
    await zip.add("manifest.json", new Blob([JSON.stringify({ slides, emptySlides, images: images.map(({ name, source, mime, size }) => ({ name, source, mime, size })) }, null, 2)]), signal); signal.throwIfAborted();
    return { blob: zip.finish(), text, textBlob, images, slides: slides.length, emptySlides };
  } finally { zip.dispose(); }
}
