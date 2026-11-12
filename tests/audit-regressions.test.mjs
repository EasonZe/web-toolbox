import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const { timestampResult } = loadLocalModule("app/lib/timestamp-tools.ts");
const { countWeekdays } = loadLocalModule("app/lib/date-calculator.ts");
const { isShortLinkUrl } = loadLocalModule("app/lib/short-links.ts");

test("时间戳精确接受小数秒，拒绝被浮点舍入掩盖的亚毫秒输入", () => {
  for (let millis = 1000; millis < 2000; millis++) {
    for (const sign of [1, -1]) {
      const text = `${sign < 0 ? "-" : ""}1.${String(millis - 1000).padStart(3, "0")}`;
      assert.equal(timestampResult(text, "seconds", "UTC").milliseconds, sign * millis);
    }
  }
  assert.equal(timestampResult("253402300799.999", "seconds", "UTC").milliseconds, 253402300799999);
  assert.equal(timestampResult("-0.001", "seconds", "UTC").milliseconds, -1);
  assert.throws(() => timestampResult("253402300799999.001", "milliseconds", "UTC"), /精度/);
  assert.throws(() => timestampResult("1.0001", "seconds", "UTC"));
});

function referenceWeekdays(start, end, inclusive) {
  const direction = start <= end ? 1 : -1;
  const cursor = new Date(direction === 1 ? start : end);
  const last = direction === 1 ? end : start;
  let total = 0;
  while (cursor < last || inclusive && cursor <= last) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) total++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total * direction;
}

test("工作日计算覆盖每周起点、倒序、包含末日、闰年和夏令时", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Asia/Shanghai", "America/New_York", "Europe/London"]) {
      process.env.TZ = zone;
      for (const month of [1, 2, 9, 10]) for (let day = 1; day <= 7; day++) {
        const start = new Date(2024, month, day);
        for (const duration of [0, 1, 6, 7, 8, 28, 65]) {
          const end = new Date(2024, month, day + duration);
          for (const inclusive of [false, true]) for (const pair of [[start, end], [end, start]])
            assert.equal(countWeekdays(...pair, inclusive), referenceWeekdays(...pair, inclusive));
        }
      }
    }
    process.env.TZ = "America/Sao_Paulo";
    assert.equal(countWeekdays(new Date(2018, 10, 3), new Date(2018, 10, 5), true), 1);
    const first = new Date("0001-01-01T00:00:00"), last = new Date("0001-01-08T00:00:00");
    assert.equal(countWeekdays(first, last), 5);
    assert.equal(countWeekdays(first, last, true), 6);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("短链接结果验证支持当前部署域名并拒绝跨域和伪造路径", () => {
  for (const origin of ["https://tool.easonzhan.xyz", "https://fork.example", "http://localhost:4173"]) {
    assert.equal(isShortLinkUrl(`${origin}/s/Abcd_123-`, origin), true);
    for (const value of ["https://evil.example/s/Abcd_123-", `${origin}/s/`, `${origin}/s/Abcd_123-/bad`, `${origin}/s/Abcd_123-?x=1`, null])
      assert.equal(isShortLinkUrl(value, origin), false);
  }
});

test("页面元数据始终使用项目公开地址，不接受请求头提供的域名或协议", async () => {
  const source = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  for (const host of ["attacker.example", "invalid host"] ) {
    const exports = {};
    const require = (id) => id === "../package.json" ? manifest : id === "next/headers" ? { headers: async () => new Headers({ "x-forwarded-host": host, "x-forwarded-proto": "https" }) } : {};
    vm.runInNewContext(`(function(exports, require) { ${code}\n })`, { URL })(exports, require);
    const metadata = await exports.generateMetadata();
    assert.equal(metadata.metadataBase.href, manifest.homepage);
  }
});
