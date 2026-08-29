import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../app/components/ascii-art-generator.tsx", import.meta.url),
  "utf8",
);
const styles = fs.readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("ASCII generator turns typed text into a real FIGlet banner", () => {
  assert.match(source, /createTextAsciiArt/);
  assert.match(source, /figlet\s*\.\s*textSync/);
  assert.match(source, /figlet\.parseFont/);
  assert.match(source, /figlet\/fonts\/ANSI Shadow/);
  assert.match(source, /figlet\/fonts\/ANSI Regular/);
  assert.match(source, /figlet\/fonts\/ANSI Compact/);
  assert.match(source, /figlet\/fonts\/Doom/);
  assert.match(source, /skewBannerRows/);
  assert.match(source, /输入文字/);
  assert.match(source, /FIGlet大字/);
  assert.match(source, /中文方块兼容模式/);
  assert.match(source, /横幅字体/);
  assert.match(source, /字符间距/);
  assert.match(source, /layout === "fitted" \? 0 : layout === "full" \? 3 : 1/);
  assert.match(source, /副标题/);
  assert.match(source, /\[subtitle, setSubtitle\] = useState\(""\)/);
  assert.match(source, /边框样式/);
  assert.match(source, /双线/);
  assert.match(source, /decorateBanner/);
  assert.match(source, /placeBlockLine/);
  assert.match(source, /╔/);
  assert.match(source, /█/);
  assert.match(source, /字符颜色/);
  assert.match(source, /背景颜色/);
  assert.match(source, /className="ascii-workbench"/);
  assert.doesNotMatch(source, /自定义字符集|字符对比|输出宽度/);
  assert.doesNotMatch(source, /<FileDropZone/);
  assert.match(styles, /font-family: "Cascadia Mono", Consolas/);
  assert.match(styles, /font-size: 16px/);
  assert.match(styles, /line-height: 16px/);
});

test("ASCII generator supports real-time preview, copy, and TXT download", () => {
  assert.match(source, /useEffect/);
  assert.match(source, /copyWithFallback/);
  assert.match(source, /复制字符画/);
  assert.match(source, /下载TXT/);
  assert.match(source, /text\/plain;charset=utf-8/);
});

test("ASCII preview scales the complete banner into narrow mobile frames", () => {
  assert.match(source, /className="ascii-output-fit"/);
  assert.match(source, /previewFrameRef/);
  assert.match(source, /previewTextRef/);
  assert.match(source, /availableWidth \/ naturalWidth/);
  assert.match(source, /availableHeight \/ naturalHeight/);
  assert.match(source, /ResizeObserver/);
  assert.match(styles, /\.ascii-output-frame\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.ascii-output-fit pre\s*\{[\s\S]*?transform-origin:\s*top left;/);
});
