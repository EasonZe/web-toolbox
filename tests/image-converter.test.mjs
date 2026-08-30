import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/image-converter.tsx", import.meta.url),
  "utf8",
);

test("图片格式转换工具支持批量选择和批量任务", () => {
  assert.match(source, /<FileDropZone[\s\S]*?multiple[\s\S]*?onFiles=\{addFiles\}/);
  assert.match(source, /const maxFiles = 20/);
  assert.match(source, /const maxFileSize = 25 \* 1024 \* 1024/);
  assert.match(source, /const maxTotalSize = 150 \* 1024 \* 1024/);
  assert.match(source, /for \(const sourceItem of items\)/);
  assert.match(source, /开始批量转换/);
  assert.match(source, /转换完成，共/);
});

test("图片格式转换工具支持三种输出、单张下载和全部下载", () => {
  assert.match(source, /image\/png/);
  assert.match(source, /image\/jpeg/);
  assert.match(source, /image\/webp/);
  assert.match(source, /canvas\.toBlob/);
  assert.match(source, /function downloadOne/);
  assert.match(source, /async function downloadAll/);
  assert.match(source, /下载全部/);
  assert.match(source, /图片质量/);
  assert.doesNotMatch(source, /fetch\(|FormData|XMLHttpRequest/);
  assert.doesNotMatch(source, /浏览器本地处理|不会上传/);
});
