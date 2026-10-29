// GIF89a Appendix F: validate codes without allocating or expanding the pixel stream.
// The actual pixels are still decoded by gifuct-js after this bounded preflight.
export function validateGifLzw(bytes: Uint8Array, start: number, end: number, minimumCodeSize: number, expectedPixels: number, maxCodes = expectedPixels * 2 + 4096) {
  if (![start, end, minimumCodeSize, expectedPixels, maxCodes].every(Number.isSafeInteger)
    || start < 0 || end > bytes.length || start >= end || minimumCodeSize < 2 || minimumCodeSize > 8 || expectedPixels < 1 || maxCodes < 1) throw new Error("GIF LZW 校验参数无效。");

  const clearCode = 1 << minimumCodeSize, endCode = clearCode + 1;
  // Every new string is one pixel longer than an existing string. Fixed storage
  // avoids both a pixel-sized allocation and potentially quadratic prefix walks.
  const lengths = new Uint16Array(4096);
  lengths.fill(1, 0, clearCode);
  let position = start, remaining = 0, terminated = false, bits = 0, datum = 0;
  let codeSize = minimumCodeSize + 1, nextCode = endCode + 1, previousLength = 0;
  let pixels = 0, codes = 0, maximumCodeSize = codeSize;
  const codeBudget = Math.min(maxCodes, expectedPixels * 2 + 4096);

  function readByte() {
    if (terminated) return -1;
    if (!remaining) {
      if (position >= end) throw new Error("GIF LZW 数据缺少子块结束标记。");
      remaining = bytes[position++];
      if (!remaining) {
        terminated = true;
        if (position !== end) throw new Error("GIF LZW 子块结束后存在额外数据。");
        return -1;
      }
      if (position + remaining > end) throw new Error("GIF LZW 子块数据截断。");
    }
    remaining--;
    return bytes[position++];
  }

  for (;;) {
    if (++codes > codeBudget) throw new Error("GIF LZW 编码工作量过大，请使用重新编码后的图片。");
    while (bits < codeSize) {
      const byte = readByte();
      if (byte < 0) throw new Error("GIF LZW 缺少结束码或编码数据截断。");
      datum |= byte << bits;
      bits += 8;
    }
    const code = datum & ((1 << codeSize) - 1);
    datum >>>= codeSize;
    bits -= codeSize;
    if (code === endCode) {
      if (pixels !== expectedPixels) throw new Error("GIF LZW 实际像素数量不足，图像帧已损坏。");
      // Only the unused bits of the last byte may follow EOI; it must be the
      // final code, before the image-data block terminator (GIF89a Appendix F).
      if (readByte() !== -1) throw new Error("GIF LZW 结束码后存在额外编码数据。");
      return { pixels, codes, maximumCodeSize };
    }
    if (code === clearCode) {
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
      previousLength = 0;
      continue;
    }

    let length: number;
    if (code < clearCode) length = 1;
    else if (previousLength && code < nextCode) length = lengths[code];
    // KwKwK: the only legal reference to the entry not added to the table yet.
    else if (previousLength && code === nextCode && nextCode < 4096) length = previousLength + 1;
    else throw new Error("GIF LZW 包含无效字典码，图像帧已损坏。");
    pixels += length;
    if (pixels > expectedPixels) throw new Error("GIF LZW 实际像素数量超过图像帧尺寸。");

    if (previousLength && nextCode < 4096) {
      lengths[nextCode++] = previousLength + 1;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize++;
        maximumCodeSize = Math.max(maximumCodeSize, codeSize);
      }
    }
    // A full 12-bit table is frozen until a later clear code, not reset early.
    previousLength = length;
  }
}
