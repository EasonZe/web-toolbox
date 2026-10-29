import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { estimateTextureMemory, fullTextureMipLevels, positiveTextureInteger, formatTextureBytes, textureFormats } = loadLocalModule("app/lib/texture-memory.ts");
const options = { width: 2048, height: 2048, count: 1, layers: 1, kind: "2d", format: "rgba8", mipmaps: "full", levels: 1 };

test("RGBA8完整Mipmap逐级求和，不使用4/3近似，含非方形与非二次幂", () => {
  const result = estimateTextureMemory(options); assert.equal(result.mipLevels, 12); assert.equal(result.baseBytes, "16777216"); assert.equal(result.totalBytes, "22369620"); assert.equal(result.mipBytes, "5592404");
  assert.deepEqual(result.rows.map((row) => [row.width, row.height]), Array.from({ length: 12 }, (_, index) => [2048 / 2 ** index, 2048 / 2 ** index]));
  const odd = estimateTextureMemory({ ...options, width: 3, height: 5 }); assert.equal(odd.totalBytes, "72"); assert.deepEqual(odd.rows.map((row) => [row.width, row.height]), [[3, 5], [1, 2], [1, 1]]);
  assert.equal(fullTextureMipLevels(1, 1), 1); assert.equal(fullTextureMipLevels(1, 17), 5);
});

test("BC与ASTC各级向上取整，小于一个块的末级仍占一个完整块", () => {
  const bc = estimateTextureMemory({ ...options, width: 7, height: 5, format: "bc1" }); assert.equal(bc.totalBytes, "48"); assert.deepEqual(bc.rows.map((row) => row.bytes), ["32", "8", "8"]);
  const astc = estimateTextureMemory({ ...options, width: 13, height: 7, format: "astc-6x6" }); assert.equal(astc.totalBytes, "144"); assert.deepEqual(astc.rows.map((row) => row.bytes), ["96", "16", "16", "16"]);
  for (const format of textureFormats) {
    const result = estimateTextureMemory({ ...options, width: 1, height: 1, format: format.id }); assert.equal(result.totalBytes, String(format.blockBytes));
  }
  for (const format of ["bc3", "bc5", "bc7", "etc2-rgba"]) assert.equal(estimateTextureMemory({ ...options, width: 4, height: 4, format, mipmaps: "none" }).totalBytes, "16");
});

test("数量、阵列层数、立方体六面与自定义层数分开计算，不重复乘面数", () => {
  const array = estimateTextureMemory({ ...options, width: 4, height: 4, count: 3, layers: 4, kind: "array", format: "bc1", mipmaps: "none" });
  assert.equal(array.totalBytes, "96"); assert.equal(array.textureBytes, "32"); assert.equal(array.faces, 1);
  const cube = estimateTextureMemory({ ...options, width: 4, height: 4, count: 2, kind: "cube", format: "bc1", mipmaps: "none" });
  assert.equal(cube.totalBytes, "96"); assert.equal(cube.textureBytes, "48"); assert.equal(cube.faces, 6);
  const custom = estimateTextureMemory({ ...options, width: 4, height: 4, mipmaps: "custom", levels: 2 }); assert.equal(custom.totalBytes, "80"); assert.equal(custom.mipLevels, 2);
  assert.throws(() => estimateTextureMemory({ ...options, kind: "cube", width: 7 }), /正方形/);
  assert.throws(() => estimateTextureMemory({ ...options, layers: 2 }), /层数须为 1/);
});

test("字节计算使用精确整数，安全数边界不溢出或转为浮点近似", () => {
  const edge = Number.MAX_SAFE_INTEGER, result = estimateTextureMemory({ ...options, width: edge, height: edge, count: edge, layers: edge, kind: "array", format: "astc-12x12", mipmaps: "none" });
  const blocks = (BigInt(edge) + 11n) / 12n;
  assert.equal(result.totalBytes, String(blocks * blocks * 16n * BigInt(edge) ** 2n));
  assert.equal(fullTextureMipLevels(edge, edge), 53);
  assert.equal(formatTextureBytes("0"), "0 B"); assert.equal(formatTextureBytes("1024"), "1.00 KiB"); assert.equal(formatTextureBytes("16777216"), "16.00 MiB"); assert.equal(formatTextureBytes("1536"), "1.50 KiB");
  assert.match(formatTextureBytes(result.totalBytes), /YiB$/);
});

test("非法尺寸、格式、类型与层级不截断、不取绝对值、不返回旧结果", () => {
  for (const invalid of [{ width: 0 }, { height: -1 }, { count: 1.5 }, { layers: NaN }, { width: Infinity }, { width: Number.MAX_SAFE_INTEGER + 1 }, { format: "__proto__" }, { kind: "volume" }, { mipmaps: "guessed" }, { mipmaps: "custom", levels: 0 }, { mipmaps: "custom", levels: 13 }, { mipmaps: "custom", levels: 1.5 }]) assert.throws(() => estimateTextureMemory({ ...options, ...invalid }));
  for (const value of ["", "0", "-1", "2.5", "1e3", "Infinity", "9007199254740992", "1".repeat(17)]) assert.throws(() => positiveTextureInteger(value, "宽度"));
  assert.equal(positiveTextureInteger(" 2048 ", "宽度"), 2048); assert.equal(positiveTextureInteger("0001", "宽度"), 1);
  assert.throws(() => formatTextureBytes("-1")); assert.throws(() => fullTextureMipLevels(1.5, 4));
});
