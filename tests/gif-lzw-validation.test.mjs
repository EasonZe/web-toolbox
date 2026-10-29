import assert from "node:assert/strict";
import test from "node:test";
import { decompressFrame, parseGIF } from "gifuct-js";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { makeGif } from "./helpers/ninth-fixtures.mjs";

const { validateGifLzw } = loadLocalModule("app/lib/gif-lzw-validation.ts");
const { inspectGifBytes, inspectGif, extractGif } = loadLocalModule("app/lib/gif-extract.ts");

function subBlocks(payload, chunkSize = 255) {
  const result = [];
  for (let i = 0; i < payload.length; i += chunkSize) {
    const part = payload.slice(i, i + chunkSize);
    result.push(part.length, ...part);
  }
  return new Uint8Array([...result, 0]);
}

// An independent code-stream fixture writer. Real gifenc images below additionally
// check the size transitions against a production encoder, not just this writer.
function packedCodes(codes, minimum = 2) {
  const clear = 2 ** minimum, stop = clear + 1;
  let width = minimum + 1, entries = stop + 1, previous = false, byte = 0, bits = 0;
  const bytes = [];
  for (const code of codes) {
    for (let bit = 0; bit < width; bit++) {
      byte += ((code >> bit) & 1) * 2 ** bits++;
      if (bits === 8) { bytes.push(byte); byte = bits = 0; }
    }
    if (code === clear) { width = minimum + 1; entries = stop + 1; previous = false; }
    else if (code !== stop) {
      if (previous && entries < 4096) {
        entries++;
        if (entries === 2 ** width && width < 12) width++;
      }
      previous = true;
    }
  }
  if (bits) bytes.push(byte);
  return new Uint8Array(bytes);
}

function validateCodes(codes, pixels, { minimum = 2, chunkSize = 255, maxCodes } = {}) {
  const blocks = subBlocks(packedCodes(codes, minimum), chunkSize);
  return validateGifLzw(blocks, 0, blocks.length, minimum, pixels, maxCodes);
}

function imageDataBounds(bytes) {
  const { frames } = inspectGifBytes(bytes), { start, end } = frames[0];
  const descriptorFlags = bytes[start + 9];
  return { start: start + 10 + (descriptorFlags & 128 ? 3 * 2 ** ((descriptorFlags & 7) + 1) : 0), end };
}

function replacedData(bytes, data) {
  const bounds = imageDataBounds(bytes);
  return new Uint8Array([...bytes.subarray(0, bounds.start), ...data, ...bytes.subarray(bounds.end)]);
}

test("GIF 已复现的立即 EOI 损坏帧在 gifuct 补零前被拒绝", async () => {
  const broken = replacedData(makeGif([{ pixels: [1, 1, 1] }]), [2, 1, 44, 0]);
  // Keep the original failure visible: gifuct accepts the short stream and fills zeros.
  const parsed = parseGIF(broken.buffer), frame = parsed.frames.find((item) => item.image);
  assert.deepEqual(decompressFrame(frame, parsed.gct, true).pixels, [0, 0, 0]);
  assert.throws(() => inspectGifBytes(broken), /LZW.*像素数量不足/);
  await assert.rejects(inspectGif(new File([broken], "broken.gif"), new AbortController().signal), /LZW.*像素数量不足/);
  await assert.rejects(extractGif(new File([broken], "broken.gif"), { start: 1, end: 1, step: 1, background: "transparent" }, new AbortController().signal), /LZW.*像素数量不足/);
});

test("GIF LZW 拒绝短帧、像素过多、未知码以及 clear 后引用旧字典", () => {
  assert.throws(() => validateCodes([4, 1, 5], 3), /像素数量不足/);
  assert.throws(() => validateCodes([4, 1, 6, 5], 2), /像素数量超过/);
  for (const codes of [[4, 7, 5], [4, 6, 5], [4, 0, 7, 5], [4, 1, 6, 4, 6, 5]]) {
    assert.throws(() => validateCodes(codes, 20), /无效字典码/);
  }
});

test("GIF LZW 像素恰好填满仍必须有完整 EOI，不接受隐式补零或截断码", () => {
  assert.throws(() => validateCodes([4, 1], 1), /缺少结束码|数据截断/);
  assert.throws(() => validateCodes([4, 1, 6], 3), /像素数量超过|缺少结束码|数据截断/);
  const truncated = subBlocks(packedCodes([256, 17, 257], 8).slice(0, -1));
  assert.throws(() => validateGifLzw(truncated, 0, truncated.length, 8, 1), /缺少结束码|数据截断/);
});

test("GIF LZW 接受 KwKwK、任意位置 clear 和不强制推荐性的首个 clear", () => {
  assert.equal(validateCodes([4, 1, 6, 5], 3).pixels, 3);
  assert.equal(validateCodes([4, 4, 1, 4, 2, 5], 2).pixels, 2);
  assert.equal(validateCodes([1, 2, 5], 2).pixels, 2);
  assert.equal(validateCodes([4, 1, 6, 4, 2, 6, 5], 6).pixels, 6);
});

test("GIF LZW 码字可跨多个子块，结束码后不能藏入完整数据字节", () => {
  const codes = [4, 0, 1, 2, 3, 0, 1, 2, 3, 5];
  assert.equal(validateCodes(codes, 8, { chunkSize: 1 }).pixels, 8);
  const payload = packedCodes([4, 1, 5]);
  const extra = subBlocks(new Uint8Array([...payload, 0]));
  assert.throws(() => validateGifLzw(extra, 0, extra.length, 2, 1), /结束码后存在额外/);
  const separate = new Uint8Array([payload.length, ...payload, 1, 0, 0]);
  assert.throws(() => validateGifLzw(separate, 0, separate.length, 2, 1), /结束码后存在额外/);
});

test("GIF LZW 支持 3 至 12 位增长、字典满后延迟 clear、以及 clear 后重建", () => {
  const literals = Array.from({ length: 6000 }, (_, i) => i % 4);
  const result = validateCodes([4, ...literals, 4, 1, 6, 5], literals.length + 3);
  assert.equal(result.maximumCodeSize, 12);
  assert.equal(result.pixels, 6003);
  assert.equal(validateCodes([4, ...literals, 5], literals.length, { chunkSize: 1 }).maximumCodeSize, 12);
});

test("真实 gifenc 编码的多色大图跨越 12 位与字典重置，像素和预检一致", () => {
  const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, i ^ 127]);
  let seed = 0x12345678;
  const pixels = Array.from({ length: 100_000 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255; });
  const bytes = makeGif([{ pixels, width: 500, height: 200, palette }], { width: 500, height: 200 });
  const bounds = imageDataBounds(bytes);
  const result = validateGifLzw(bytes, bounds.start + 1, bounds.end, bytes[bounds.start], pixels.length);
  assert.equal(result.maximumCodeSize, 12);
  const parsed = parseGIF(bytes.buffer), frame = parsed.frames.find((item) => item.image);
  assert.deepEqual(decompressFrame(frame, parsed.gct, false).pixels, pixels);
  assert.equal(inspectGifBytes(bytes).frames.length, 1);
});

test("GIF 预检保留本地色表、局部帧、交错、多帧和 Uint8Array 偏移支持", () => {
  const bytes = makeGif([{ pixels: [1, 3, 2, 0], width: 1, height: 4, interlaced: true }, { pixels: [1], width: 1, top: 2, palette: [[0, 0, 0], [128, 128, 128]] }], { width: 1, height: 4 });
  const prefixed = new Uint8Array(bytes.length + 5); prefixed.set(bytes, 5);
  const result = inspectGifBytes(prefixed.subarray(5));
  assert.equal(result.frames.length, 2); assert.equal(result.frames[1].top, 2);
});

test("GIF LZW 对大量不产出像素的 clear 与总码预算有上限", () => {
  assert.throws(() => validateCodes([...Array(4100).fill(4), 1, 5], 1), /工作量过大/);
  assert.throws(() => validateCodes([4, ...Array(100).fill(1), 5], 100, { maxCodes: 10 }), /工作量过大/);
});

test("GIF LZW 校验参数和损坏子块不会越界读取", () => {
  const valid = subBlocks(packedCodes([4, 1, 5]));
  for (const args of [[-1, valid.length, 2, 1], [0, valid.length + 1, 2, 1], [0, valid.length, 1, 1], [0, valid.length, 9, 1], [0, valid.length, 2, 0], [0, valid.length, 2, NaN]]) {
    assert.throws(() => validateGifLzw(valid, ...args), /参数无效/);
  }
  assert.throws(() => validateGifLzw(valid, 0, valid.length, 2, 1, 0), /参数无效/);
  assert.throws(() => validateGifLzw(valid.subarray(0, -1), 0, valid.length - 1, 2, 1), /缺少子块结束/);
  const short = new Uint8Array([255, 1]);
  assert.throws(() => validateGifLzw(short, 0, short.length, 2, 1), /子块数据截断/);
  const afterTerminator = new Uint8Array([...valid, 0]);
  assert.throws(() => validateGifLzw(afterTerminator, 0, afterTerminator.length, 2, 1), /子块结束后存在额外/);
});
