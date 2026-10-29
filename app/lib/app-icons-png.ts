// PNG container for small opaque Apple icons. Pixel scaling remains Canvas-based;
// fflate supplies zlib. RGB color type 2 deliberately has no alpha channel.
const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const result = new Uint8Array(data.length + 12), view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) result[index + 4] = type.charCodeAt(index);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < result.length - 4; index++) crc = crcTable[(crc ^ result[index]) & 255] ^ (crc >>> 8);
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}
export async function opaqueAppIconPng(context: CanvasRenderingContext2D, size: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(size) || size < 1 || size > 1024) throw new Error("不透明图标尺寸无效。");
  const rgba = context.getImageData(0, 0, size, size).data, rgb = new Uint8Array((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4, to = y * (size * 3 + 1) + 1 + x * 3;
      if (rgba[from + 3] !== 255) throw new Error("Apple 图标背景未完全合成，请重新生成。");
      rgb[to] = rgba[from]; rgb[to + 1] = rgba[from + 1]; rgb[to + 2] = rgba[from + 2];
    }
    if (y % 128 === 127) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted(); }
  }
  const { zlibSync } = await import("fflate");
  signal.throwIfAborted();
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, size); view.setUint32(4, size); header[8] = 8; header[9] = 2;
  const blob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlibSync(rgb, { level: 1 })), chunk("IEND", new Uint8Array())], { type: "image/png" });
  signal.throwIfAborted();
  return blob;
}
