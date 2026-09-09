import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

async function read(path) { return readFile(new URL(path, import.meta.url), "utf8"); }
async function load(path) {
  const exports = {};
  const source = await read(path);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`)(exports, createRequire(import.meta.url));
  return exports;
}

test("进制转换支持 2 至 36 进制、符号、前缀和大整数", async () => {
  const { convertBaseInteger, commonBaseValues } = await load("../app/lib/base-converter.ts");
  assert.equal(convertBaseInteger("0xFF", 16, 2), "11111111");
  assert.equal(convertBaseInteger("-1_000_000", 10, 16), "-F4240");
  assert.equal(convertBaseInteger("ZZZZZZZZZZ", 36, 10), "3656158440062975");
  assert.deepEqual(commonBaseValues("255", 10).map((item) => item.value), ["11111111", "377", "255", "FF", "73"]);
  assert.throws(() => convertBaseInteger("102", 2, 10), /不能用于/);
  assert.throws(() => convertBaseInteger("1", 1, 10), /2 到 36/);
});

test("日期计算覆盖自然日、工作日、包含首尾与日期加减", async () => {
  const { calculateDateDifference, countWeekdays, shiftDate } = await load("../app/lib/date-calculator.ts");
  const start = new Date(2024, 0, 1);
  const end = new Date(2024, 0, 8);
  assert.equal(countWeekdays(start, end, false), 5);
  assert.equal(countWeekdays(start, end, true), 6);
  assert.equal(calculateDateDifference("2024-01-01", "2024-01-08", false).days, 7);
  assert.equal(calculateDateDifference("2024-01-01", "2024-01-08", true).days, 8);
  assert.equal(shiftDate("2024-01-31", { years: 0, months: 1, weeks: 0, days: 0 }, "add").value, "2024-02-29");
});

test("六个新工具使用成熟库并覆盖关键浏览器交互", async () => {
  const files = {
    base: await read("../app/components/base-converter.tsx"),
    plot: await read("../app/components/function-plotter.tsx"),
    morse: await read("../app/components/morse-code-converter.tsx"),
    screen: await read("../app/components/screen-color-test.tsx"),
    keyboard: await read("../app/components/keyboard-tester.tsx"),
    date: await read("../app/components/date-calculator.tsx"),
  };
  for (const value of ["2 至 36", "BigInt", "常用进制", "交换进制"]) assert.ok(files.base.includes(value), value);
  for (const value of ["function-plot", "sin(x)", "ResizeObserver", "下载 SVG", "滚轮缩放"]) assert.ok(files.plot.includes(value), value);
  for (const value of ["@morsecodeapp/morse", "encodeDetailed", "decodeDetailed", "toWavBlob", "audio.play()", "volume: 0.65", "播放电码"]) {
    if (value === "volume: 0.65") assert.ok(!files.morse.includes(value), "摩斯播放器不能把 0–100 音量误传为 0–1");
    else assert.ok(files.morse.includes(value), value);
  }
  for (const value of ["useState(80)", "onTimeUpdate", "播放进度", "原生播放器", "自动播放被浏览器阻止"]) assert.ok(files.morse.includes(value), value);
  for (const value of ["requestFullscreen", "fullscreenchange", "ArrowRight", "坏点", "背光均匀度"]) assert.ok(files.screen.includes(value), value);
  for (const value of ["KeyboardEvent", "event.code", "event.key", "最大同时按下", "Fn"]) assert.ok(files.keyboard.includes(value), value);
  for (const value of ["calculateDateDifference", "shiftDate", "工作日", "日期间隔", "日期加减"]) assert.ok(files.date.includes(value), value);
});

test("首页加入六个通用工具与搜索关键词", async () => {
  const source = await read("../app/components/tool-search-grid.tsx");
  for (const value of ["/base-converter", "进制转换器", "/function-plotter", "函数图像绘制", "/morse-code", "摩斯电码转换", "/screen-test", "屏幕纯色测试", "/keyboard-test", "键盘按键测试", "/date-calculator", "日期计算器", "NKRO", "工作日"]) assert.ok(source.includes(value), value);
});
