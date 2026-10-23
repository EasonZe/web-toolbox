export const iconSizes = [16, 32, 48, 64, 128, 256] as const;
export function iconPlacement(width: number, height: number, size: number, fit: "contain" | "cover") {
  if (![width, height, size].every((value) => Number.isFinite(value) && value > 0)) throw new Error("图片尺寸无效。");
  const scale = (fit === "contain" ? Math.min : Math.max)(size / width, size / height);
  return { x: (size - width * scale) / 2, y: (size - height * scale) / 2, width: width * scale, height: height * scale };
}
// ICO directory followed by PNG images. 256 is encoded as zero in the directory.
export function packIco(images: { size: number; png: Uint8Array }[]) {
  if (!images.length || images.length > iconSizes.length || new Set(images.map((image) => image.size)).size !== images.length) throw new Error("请选择不重复的图标尺寸。");
  for (const { size, png } of images) {
    if (!(iconSizes as readonly number[]).includes(size) || png.length < 33 || png.length > 1024 * 1024 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => png[i] === byte)) throw new Error("图标必须为有效的 PNG 图片。");
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (header.getUint32(16) !== size || header.getUint32(20) !== size) throw new Error("PNG 与图标尺寸不一致。");
  }
  const headerSize = 6 + 16 * images.length;
  const result = new Uint8Array(headerSize + images.reduce((sum, image) => sum + image.png.length, 0)), view = new DataView(result.buffer);
  view.setUint16(2, 1, true); view.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16;
    view.setUint8(entry, size === 256 ? 0 : size); view.setUint8(entry + 1, size === 256 ? 0 : size);
    view.setUint16(entry + 4, 1, true); view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true); view.setUint32(entry + 12, offset, true);
    result.set(png, offset); offset += png.length;
  });
  return result;
}
