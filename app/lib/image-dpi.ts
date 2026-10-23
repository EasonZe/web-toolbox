import { toolLimits } from "./resource-limits";
type DpiInfo = { mime: "image/png" | "image/jpeg"; width: number; height: number; x: number | null; y: number | null };
type Part = { start: number; end: number; kind: string };
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (data: Uint8Array, start: number, count: number) => String.fromCharCode(...data.subarray(start, start + count));
const viewOf = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
function invalid(): never { throw new Error("图片结构或分辨率元数据损坏，请更换原始 PNG / JPEG 文件。"); }
function parse(data: Uint8Array) {
  if (data.length > toolLimits.image.fileBytes || data.length < 24) invalid();
  const view = viewOf(data), parts: Part[] = [];
  if (pngSignature.every((byte, i) => data[i] === byte)) {
    let offset = 8;
    while (offset + 12 <= data.length) {
      const size = view.getUint32(offset), end = offset + size + 12, kind = ascii(data, offset + 4, 4);
      if (end > data.length || (offset === 8 && (kind !== "IHDR" || size !== 13)) || (kind === "pHYs" && size !== 9)) invalid();
      if (parts.length >= toolLimits.image.metadataParts) invalid();
      parts.push({ start: offset, end, kind }); offset = end;
      if (kind === "IEND") { if (size !== 0 || offset !== data.length || !parts.some((part) => part.kind === "IDAT")) invalid(); return { mime: "image/png" as const, parts }; }
    }
    invalid();
  }
  if (data[0] !== 255 || data[1] !== 216) throw new Error("仅支持 PNG 和 JPEG；此工具不会重新编码图片。");
  let offset = 2;
  while (offset + 4 <= data.length) {
    const start = offset;
    if (data[offset++] !== 255) invalid();
    while (data[offset] === 255) offset++;
    const marker = data[offset++];
    if (offset + 2 > data.length || marker === 0 || marker === 217) invalid();
    const length = view.getUint16(offset), end = offset + length;
    if (length < 2 || end > data.length) invalid();
    if (marker === 218) {
      if (data.at(-2) !== 255 || data.at(-1) !== 217) invalid();
      parts.push({ start, end: data.length, kind: "scan" }); return { mime: "image/jpeg" as const, parts };
    }
    // Normalize marker prefix separately; segment readers locate the payload from the end/length.
    if (parts.length >= toolLimits.image.metadataParts) invalid();
    parts.push({ start, end, kind: marker.toString(16) }); offset = end;
  }
  invalid();
}
function exifResolution(segment: Uint8Array, dpi?: number) {
  let p = 1; while (segment[p] === 255) p++;
  if (ascii(segment, p + 3, 6) !== "Exif\0\0") return null;
  return tiffResolution(segment, p + 9, dpi);
}
function tiffResolution(segment: Uint8Array, tiff: number, dpi?: number) {
  const view = viewOf(segment), little = ascii(segment, tiff, 2) === "II";
  if ((!little && ascii(segment, tiff, 2) !== "MM") || tiff + 8 > segment.length || view.getUint16(tiff + 2, little) !== 42) invalid();
  const relative = view.getUint32(tiff + 4, little), start = tiff + relative;
  if (relative < 8 || start + 2 > segment.length) invalid();
  const count = view.getUint16(start, little);
  if (start + 2 + count * 12 + 4 > segment.length) invalid();
  let x: number | null = null, y: number | null = null, unit = 2;
  for (let i = 0; i < count; i++) {
    const entry = start + 2 + i * 12, tag = view.getUint16(entry, little), type = view.getUint16(entry + 2, little), n = view.getUint32(entry + 4, little);
    if (tag === 0x128) {
      if (type !== 3 || n !== 1) invalid();
      unit = view.getUint16(entry + 8, little); if (dpi !== undefined) view.setUint16(entry + 8, 2, little);
    } else if (tag === 0x11a || tag === 0x11b) {
      const offset = tiff + view.getUint32(entry + 8, little);
      if (type !== 5 || n !== 1 || offset < tiff + 8 || offset + 8 > segment.length || (offset < start + 2 + count * 12 + 4 && offset + 8 > start)) invalid();
      const numerator = view.getUint32(offset, little), denominator = view.getUint32(offset + 4, little);
      if (tag === 0x11a) x = denominator ? numerator / denominator : null;
      else y = denominator ? numerator / denominator : null;
      if (dpi !== undefined) { view.setUint32(offset, dpi, little); view.setUint32(offset + 4, 1, little); }
    }
  }
  return { x: unit === 1 ? null : x === null ? null : x * (unit === 3 ? 2.54 : 1), y: unit === 1 ? null : y === null ? null : y * (unit === 3 ? 2.54 : 1) };
}
export function inspectImageDpi(data: Uint8Array): DpiInfo {
  const parsed = parse(data), info: DpiInfo = { mime: parsed.mime, width: 0, height: 0, x: null, y: null }, view = viewOf(data);
  if (parsed.mime === "image/png") {
    info.width = view.getUint32(16); info.height = view.getUint32(20);
    for (const part of parsed.parts) if (part.kind === "pHYs" && data[part.start + 16] === 1) { info.x = view.getUint32(part.start + 8) * 0.0254; info.y = view.getUint32(part.start + 12) * 0.0254; }
    for (const part of parsed.parts) if (part.kind === "eXIf") { const exif = tiffResolution(data.subarray(part.start + 8, part.end - 4), 0); info.x = exif.x ?? info.x; info.y = exif.y ?? info.y; }
  } else {
    for (const part of parsed.parts) {
      const segment = data.subarray(part.start, part.end); let p = 1; while (segment[p] === 255) p++;
      const payload = part.start + p + 3;
      if (["c0", "c1", "c2", "c3", "c5", "c6", "c7", "c9", "ca", "cb", "cd", "ce", "cf"].includes(part.kind)) {
        if (payload + 5 > part.end) invalid(); info.height = view.getUint16(payload + 1); info.width = view.getUint16(payload + 3);
      }
      if (part.kind === "e0" && ascii(data, payload, 5) === "JFIF\0") {
        if (payload + 14 > part.end) invalid();
        const factor = data[payload + 7] === 1 ? 1 : data[payload + 7] === 2 ? 2.54 : 0;
        info.x = view.getUint16(payload + 8) * factor || null; info.y = view.getUint16(payload + 10) * factor || null;
      }
    }
    for (const part of parsed.parts) if (part.kind === "e1") {
      const exif = exifResolution(data.subarray(part.start, part.end)); if (exif) { info.x = exif.x ?? info.x; info.y = exif.y ?? info.y; }
    }
  }
  if (!info.width || !info.height) invalid(); return info;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); return value >>> 0; });
function writePngCrc(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes.subarray(4, bytes.length - 4)) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  viewOf(bytes).setUint32(bytes.length - 4, (crc ^ -1) >>> 0);
}
function physChunk(dpi: number) {
  const bytes = new Uint8Array(21), view = viewOf(bytes), density = Math.round(dpi / 0.0254);
  view.setUint32(0, 9); bytes.set([112, 72, 89, 115], 4); view.setUint32(8, density); view.setUint32(12, density); bytes[16] = 1;
  writePngCrc(bytes); return bytes;
}
export function setImageDpi(data: Uint8Array, dpi: number) {
  if (!Number.isInteger(dpi) || dpi < 1 || dpi > 65535) throw new Error("DPI 必须是 1–65535 之间的整数。");
  const parsed = parse(data), chunks: Uint8Array[] = [];
  if (parsed.mime === "image/png") {
    chunks.push(data.subarray(0, 8));
    for (const part of parsed.parts) {
      if (part.kind === "eXIf") { const copy = new Uint8Array(data.subarray(part.start, part.end)); tiffResolution(copy.subarray(8, copy.length - 4), 0, dpi); writePngCrc(copy); chunks.push(copy); }
      else if (part.kind !== "pHYs") chunks.push(data.subarray(part.start, part.end));
      if (part.kind === "IHDR") chunks.push(physChunk(dpi));
    }
  } else {
    chunks.push(data.subarray(0, 2)); let jfif = false;
    for (const part of parsed.parts) {
      const segment = data.subarray(part.start, part.end); let p = 1; while (segment[p] === 255) p++;
      let next = segment;
      if (part.kind === "e0" && ascii(segment, p + 3, 5) === "JFIF\0") {
        if (segment.length < p + 17) invalid(); next = new Uint8Array(segment); const view = viewOf(next);
        next[p + 10] = 1; view.setUint16(p + 11, dpi); view.setUint16(p + 13, dpi); jfif = true;
      } else if (part.kind === "e1") { next = new Uint8Array(segment); exifResolution(next, dpi); }
      chunks.push(next);
    }
    if (!jfif) { const marker = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0]), view = viewOf(marker); view.setUint16(12, dpi); view.setUint16(14, dpi); chunks.splice(1, 0, marker); }
  }
  // Original compressed pixel data, profiles, orientation and all unrelated segments are retained.
  return new Blob(chunks as BlobPart[], { type: parsed.mime });
}
