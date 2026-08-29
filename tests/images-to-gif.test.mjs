import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/components/images-to-gif.tsx", import.meta.url), "utf8");
const libCode = ts.transpileModule(await readFile(new URL("../app/lib/images-to-gif.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lib = {};
vm.runInNewContext(libCode, { exports: lib });

test("图片合成GIF提供批量选择、排序、参数和下载流程", () => {
  assert.match(source, /<FileDropZone[\s\S]*?multiple[\s\S]*?onFiles=\{addFiles\}/);
  assert.match(source, /import\("gifenc"\)/);
  assert.match(source, /createImageBitmap/);
  assert.match(source, /gif\.writeFrame/);
  assert.match(source, /delay, repeat: repeat \? 0 : -1/);
  assert.match(source, /上移\$\{item\.file\.name\}/);
  assert.match(source, /下移\$\{item\.file\.name\}/);
  assert.match(source, /移除\$\{item\.file\.name\}/);
  assert.match(source, /下载GIF/);
  assert.match(source, /finally \{[\s\S]*?bitmap\.close\(\)/);
});

test("文件验证限制格式、数量、单张和总大小", () => {
  const image = (name, size = 10, type = "image/png") => new File([new Uint8Array(size)], name, { type });
  assert.equal(lib.isSupportedGifImage(image("a.png")), true);
  assert.equal(lib.isSupportedGifImage(image("a.svg", 10, "image/svg+xml")), false);
  assert.equal(lib.isSupportedGifImage(image("a.tiff", 10, "image/tiff")), false);
  assert.equal(lib.isSupportedGifImage(image("a.txt", 10, "text/plain")), false);
  assert.equal(lib.validateGifImages([image("a.png", 0)]).accepted.length, 0);
  assert.match(lib.validateGifImages([image("big.png", lib.imagesToGifLimits.maxFileBytes + 1)]).errors[0], /20 MB/);
  const total = lib.validateGifImages([image("b.png", 2)], [image("a.png", lib.imagesToGifLimits.maxTotalBytes)]);
  assert.equal(total.accepted.length, 0); assert.match(total.errors[0], /100 MB/);
  const full = Array.from({ length: lib.imagesToGifLimits.maxFiles }, (_, i) => image(`${i}.png`));
  assert.match(lib.validateGifImages([image("more.png")], full).errors[0], /最多/);
});

test("画布按首张比例限宽，完整显示和铺满裁剪的矩形正确", () => {
  assert.deepEqual({ ...lib.gifCanvasSize(2000, 1000, 720) }, { width: 720, height: 360 });
  assert.deepEqual({ ...lib.gifCanvasSize(300, 150, 720) }, { width: 300, height: 150 });
  assert.deepEqual({ ...lib.gifFrameRect(100, 100, 200, 100, "contain") }, { x: 50, y: 0, width: 100, height: 100 });
  assert.deepEqual({ ...lib.gifFrameRect(100, 100, 200, 100, "cover") }, { x: 0, y: -50, width: 200, height: 200 });
  assert.throws(() => lib.gifCanvasSize(100000, 100000, 720), /4000万/);
});
