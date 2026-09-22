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
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports, require) { ${code}\n })`)(exports, createRequire(import.meta.url));
  return exports;
}

test("倒计时按绝对毫秒拆分并限制有效范围", async () => {
  const { durationToMilliseconds, splitCountdown, formatCountdown } = await load("../app/lib/countdown.ts");
  assert.equal(durationToMilliseconds(1, 2, 3), 3_723_000);
  assert.deepEqual(splitCountdown(90_001), { days: 0, hours: 0, minutes: 1, seconds: 31, totalSeconds: 91 });
  assert.equal(formatCountdown(86_461_000), "1天 00:01:01");
  assert.throws(() => durationToMilliseconds(0, 0, 0), /至少需要1秒/);
});

test("汇率换算、货币格式和音频输出名正确", async () => {
  const { convertCurrency, formatCurrencyAmount } = await load("../app/lib/currency.ts");
  const { createTransformedAudioName, validateAudioTransformFile } = await load("../app/lib/audio-transform.ts");
  assert.ok(Math.abs(convertCurrency(100, 0.14) - 14) < 1e-10);
  assert.match(formatCurrencyAmount(12.5, "USD"), /12\.5/);
  assert.equal(createTransformedAudioName("song.mp3", 1.25, -3), "song-1.25x--3st.wav");
  assert.equal(validateAudioTransformFile({ name: "song.mp3", size: 1024, type: "audio/mpeg" }), "");
});

test("新工具使用成熟数据和音频实现并加入首页", async () => {
  const audio = await read("../app/components/audio-speed-pitch.tsx");
  const rates = await read("../app/api/exchange-rates/route.ts");
  const clock = await read("../app/components/world-clock.tsx");
  const wheel = await read("../app/components/lottery-wheel.tsx");
  const styles = await read("../app/globals.css");
  const morse = await read("../app/components/morse-code-converter.tsx");
  const home = await read("../app/components/tool-search-grid.tsx");
  for (const value of ["@soundtouchjs/audio-worklet", "processOffline", "pitchSemitones", "playbackRate"]) assert.ok(audio.includes(value), value);
  for (const value of ["api.frankfurter.dev/v2/rates", "Cache-Control", "currencyCodes"]) assert.ok(rates.includes(value), value);
  for (const value of ["supportedValuesOf", "/api/time", "requestFullscreen", "250"]) assert.ok(clock.includes(value), value);
  for (const value of ["大转盘", "翻牌抽签", "名单滚动"]) assert.ok(wheel.includes(value), value);
  for (const value of ["cardPhase", "selectedCardIndex", "正在随机洗牌", "幸运卡片正在翻开", "setCardRevealName(drawn.name)"]) assert.ok(wheel.includes(value), value);
  for (const value of ["lottery-flip-card-inner", "rotateY(180deg)", "card-shuffle .46s", "var(--card-index)"]) assert.ok(styles.includes(value), value);
  for (const value of ["toWavBlob", "audio.play()", "morse-audio", "下载摩斯音频 WAV"]) assert.ok(morse.includes(value), value);
  for (const value of ["/audio-speed-pitch", "/countdown", "/currency-converter", "/world-clock"]) assert.ok(home.includes(value), value);
});
