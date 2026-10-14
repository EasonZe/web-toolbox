import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const text = loadLocalModule("app/lib/text-inspection.ts");
const archive = loadLocalModule("app/lib/local-archive.ts");
const pdf = loadLocalModule("app/lib/pdf-pages.ts");
const rename = loadLocalModule("app/lib/file-renaming.ts");
const subtitles = loadLocalModule("app/lib/subtitle-tools.ts");
const time = loadLocalModule("app/lib/timestamp-tools.ts");
const texture = loadLocalModule("app/lib/texture-tools.ts");
const audio = loadLocalModule("app/lib/audio-editing.ts");
const files = loadLocalModule("app/lib/local-files.ts");

test("JSON 格式化保留大整数与原始词法，严格校验并定位错误", () => {
  const source =
    '{ "id" : 900719925474099312345, "s": " a b ", "__proto__": 1 }';
  assert.equal(
    text.inspectJson(source, true).output,
    '{"id":900719925474099312345,"s":" a b ","__proto__":1}',
  );
  assert.match(text.inspectJson(source).output, /900719925474099312345/);
  for (const value of ['{"a":1,}', '{/*comment*/"a":1}', '{"a":}', "NaN"])
    assert.ok(text.inspectJson(value).error);
  const bad = text.inspectJson('{\n  "a":\n}');
  assert.match(bad.error, /第 3 行/);
  assert.ok(bad.offset > 0);
  assert.throws(
    () => text.inspectJson("[".repeat(101) + "0" + "]".repeat(101)),
    /嵌套/,
  );
});
test("文本对比真实区分新增、删除、修改和字符差异", () => {
  const rows = text.compareTexts("same\nold line\n", "same\nnew line\nadded\n");
  assert.equal(rows[0].kind, "same");
  assert.equal(rows[1].kind, "changed");
  assert.equal(rows[2].kind, "added");
  assert.ok(rows[1].oldParts.some((part) => part.changed));
  assert.ok(rows[1].nextParts.some((part) => part.changed));
  assert.equal(text.compareTexts("gone\n", "")[0].kind, "removed");
  assert.throws(() => text.compareTexts("a".repeat(2_000_001), ""), /200 万/);
});
test("Unicode 按码点迭代并标记零宽、隐藏空格、控制符与非法代理项", () => {
  const rows = text.inspectUnicode("A😀\u200B\u00A0\u202E\uD800");
  assert.equal(rows.length, 6);
  assert.equal(rows[1].code, "U+1F600");
  assert.equal(rows[1].utf16, "D83D DE00");
  assert.equal(rows[1].utf8, "F0 9F 98 80");
  assert.equal(rows[2].position, 3);
  assert.equal(rows.filter((row) => row.hidden).length, 4);
  assert.equal(text.inspectUnicode(" \n\t").filter((r) => r.hidden).length, 0);
});
test("重命名预览保留扩展名、序号与替换，并拒绝重复结果", () => {
  const source = [
    { name: "old.jpg", lastModified: 0 },
    { name: "old.png", lastModified: 0 },
  ];
  const settings = {
    ...rename.defaultRenameOptions,
    prefix: "demo_",
    find: "old",
    replace: "new",
    dateSource: "custom",
    date: "2026-10-13",
  };
  assert.deepEqual(rename.planFileNames(source, settings), [
    "demo_20261013_001_new.jpg",
    "demo_20261013_002_new.png",
  ]);
  assert.throws(
    () =>
      rename.planFileNames([source[0], source[0]], {
        ...settings,
        sequence: false,
      }),
    /重复/,
  );
  assert.throws(
    () => rename.planFileNames(source, { ...settings, digits: 0 }),
    /位数/,
  );
  assert.equal(files.safeName("CON.txt"), "_CON.txt");
  assert.throws(
    () => rename.planFileNames(source, { ...settings, date: "2026-02-31" }),
    /日期/,
  );
  const long = rename.planFileNames(
    [{ name: "中文😀".repeat(70) + ".PNG", lastModified: 0 }],
    settings,
  )[0];
  assert.ok(long.endsWith(".PNG"));
  assert.ok(new TextEncoder().encode(long).length <= 240);
});

test("图片文件签名与 PNG 巨大尺寸在解码之前被拒绝", () => {
  const images = loadLocalModule("app/lib/local-images.ts"),
    header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(header.buffer);
  view.setUint32(16, 100000);
  view.setUint32(20, 100000);
  assert.throws(() => images.inspectRasterHeader(header, 16_777_216), /像素/);
  assert.throws(
    () =>
      images.inspectRasterHeader(
        new TextEncoder().encode("<svg></svg>"),
        16_777_216,
      ),
    /SVG/,
  );
});

test("OCR 模型作为普通静态资源分发，保持原模型压缩载荷", async () => {
  for (const language of ["eng", "chi_sim"]) {
    const built = await readFile(
      new URL(
        `../dist/client/ocr/7.0.0/data/${language}.traineddata`,
        import.meta.url,
      ),
    );
    const original = await readFile(
      new URL(
        `../node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
        import.meta.url,
      ),
    );
    assert.deepEqual(built, original);
  }
  const worker = await readFile(
    new URL("../app/workers/ocr.worker.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /gzip:\s*false/);
  assert.match(worker, /errorHandler:[\s\S]*?self\.postMessage/);
});
test("真实 ZIP 打包、列表预览、单独提取与完整提取可以往返", () => {
  const data = archive.packZip([
    { name: "目录/中文.txt", data: strToU8("你好") },
    { name: "empty.bin", data: new Uint8Array() },
  ]);
  const listing = archive.inspectZip(data);
  assert.deepEqual(
    listing.map((e) => e.name),
    ["目录/中文.txt", "empty.bin"],
  );
  assert.equal(
    new TextDecoder().decode(
      archive.extractZip(data, "目录/中文.txt")["目录/中文.txt"],
    ),
    "你好",
  );
  assert.equal(Object.keys(archive.extractZip(data)).length, 2);
});
test("ZIP 拒绝路径穿越、重复名称、加密、超限体积与损坏 CRC", () => {
  assert.throws(
    () => archive.inspectZip(zipSync({ "../escape.txt": strToU8("x") })),
    /路径/,
  );
  assert.throws(
    () =>
      archive.packZip([
        { name: "x", data: new Uint8Array() },
        { name: "x", data: new Uint8Array() },
      ]),
    /重复/,
  );
  const base = zipSync({ "safe.txt": strToU8("data") }, { level: 0 }),
    entry = archive.inspectZip(base)[0];
  const crcBad = base.slice();
  crcBad[entry.offset + 30 + "safe.txt".length] ^= 1;
  assert.throws(() => archive.extractZip(crcBad), /校验/);
  const central = base.findIndex(
    (_, i) =>
      base[i] === 0x50 &&
      base[i + 1] === 0x4b &&
      base[i + 2] === 1 &&
      base[i + 3] === 2,
  );
  const huge = base.slice();
  new DataView(huge.buffer).setUint32(central + 24, 300 * 1048576, true);
  assert.throws(() => archive.inspectZip(huge), /超限/);
  const encrypted = base.slice();
  encrypted[central + 8] |= 1;
  assert.throws(() => archive.inspectZip(encrypted), /加密/);
});
test("PDF 合并、筛选、重排、旋转与单页拆分产生真实文档", async () => {
  const first = await PDFDocument.create();
  first.addPage([100, 200]);
  first.addPage([300, 400]);
  const second = await PDFDocument.create();
  second.addPage([500, 600]);
  const a = await first.save(),
    b = await second.save();
  assert.equal((await pdf.inspectPdf(a)).length, 2);
  assert.deepEqual(pdf.parsePageSelection("3,1-2", 3), [2, 0, 1]);
  assert.throws(() => pdf.parsePageSelection("1,1", 3), /重复/);
  const choices = [
    { source: 1, page: 0, rotation: 90 },
    { source: 0, page: 1, rotation: 0 },
  ];
  const merged = await PDFDocument.load(await pdf.buildPdf([a, b], choices));
  assert.equal(merged.getPageCount(), 2);
  assert.equal(merged.getPage(0).getWidth(), 500);
  assert.equal(merged.getPage(0).getRotation().angle, 90);
  assert.equal(merged.getPage(1).getWidth(), 300);
  const single = await PDFDocument.load(
    await pdf.buildPdf([a, b], [choices[0]]),
  );
  assert.equal(single.getPageCount(), 1);
  await assert.rejects(
    pdf.buildPdf([a], [{ source: 0, page: 5, rotation: 0 }]),
    /无效/,
  );
});
test("字幕 SRT/VTT 往返、多行文字与时间偏移均保留毫秒精度", () => {
  const srt =
    "1\n00:00:01,123 --> 00:00:02,456\n中文\nEnglish\n\n2\n00:00:03,000 --> 00:00:04,000\n结束\n";
  const cues = subtitles.parseSubtitles(srt);
  assert.equal(cues[0].from, 1123);
  assert.equal(cues[0].text, "中文\nEnglish");
  const vtt = subtitles.serializeSubtitles(cues, "vtt");
  assert.match(vtt, /^WEBVTT/);
  assert.deepEqual(
    subtitles.parseSubtitles(vtt).map((c) => c.from),
    [1123, 3000],
  );
  assert.equal(subtitles.shiftSubtitles(cues, 500)[0].from, 1623);
  assert.throws(() => subtitles.shiftSubtitles(cues, -2000), /起止/);
  assert.throws(
    () => subtitles.parseSubtitles("1\ninvalid --> broken\nx"),
    /有效|无效/,
  );
});
test("时间戳覆盖秒、毫秒、时区、闰日与夏令时非法时刻", () => {
  assert.equal(
    time.timestampResult("0", "seconds", "Asia/Shanghai").date,
    "1970-01-01 08:00:00.000 +08:00",
  );
  assert.equal(
    time.dateToTimestamp("2026-10-13T08:00:00", "Asia/Shanghai").utc,
    "2026-10-13T00:00:00.000Z",
  );
  assert.equal(
    time.timestampResult("1.123", "seconds", "UTC").milliseconds,
    1123,
  );
  assert.throws(
    () => time.dateToTimestamp("2026-02-29T12:00:00", "UTC"),
    /不存在/,
  );
  assert.throws(
    () => time.dateToTimestamp("2026-03-08T02:30:00", "America/New_York"),
    /夏令时/,
  );
  assert.throws(() => time.timestampResult("0", "seconds", "Not/AZone"));
});
test("RGBA 通道打包支持自定义来源、亮度、常量与通道反转", () => {
  const pixel = new Uint8ClampedArray([10, 20, 30, 40]);
  const result = texture.packTextureChannels(1, 1, [
    { pixels: pixel, channel: 2, invert: false, constant: 0 },
    { pixels: pixel, channel: 0, invert: true, constant: 0 },
    { pixels: null, channel: 1, invert: false, constant: 100 },
    { pixels: null, channel: 3, invert: false, constant: 255 },
  ]);
  assert.deepEqual([...result], [30, 245, 100, 255]);
  assert.throws(() => texture.packTextureChannels(0, 1, []), /尺寸/);
});
test("法线图平面输出、方向反转、循环边界及尺寸均正确", () => {
  const plane = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]);
  assert.deepEqual(
    [...texture.heightToNormal(plane, 2, 1, 3, false, false)],
    [128, 128, 255, 255, 128, 128, 255, 255],
  );
  const slope = new Uint8ClampedArray([
    0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  const a = texture.heightToNormal(slope, 3, 1, 3, false, false, false),
    b = texture.heightToNormal(slope, 3, 1, 3, true, false, false);
  assert.ok(a[4] < 128);
  assert.ok(b[4] > 128);
  assert.equal(a[6], b[6]);
});
test("音频采样真实裁剪、拼接、淡入淡出并拒绝无效区间", () => {
  const clip = {
    channels: [new Float32Array([1, 1, 1, 1, 1, 1, 1, 1])],
    sampleRate: 4,
    start: 0,
    end: 2,
    fadeIn: 0.5,
    fadeOut: 0.5,
  };
  const output = audio.composeAudio([
    clip,
    { ...clip, start: 1, end: 2, fadeIn: 0, fadeOut: 0 },
  ]);
  assert.equal(output.length, 12);
  assert.equal(output.channels[0][0], 0);
  assert.equal(output.channels[0][7], 0);
  assert.equal(output.channels[0][8], 1);
  assert.throws(() => audio.composeAudio([{ ...clip, start: 3 }]), /无效/);
  assert.throws(() => audio.composeAudio([{ ...clip, fadeIn: 4 }]), /无效/);
});
test(
  "OCR 使用本地中英文模型实际识别生成的中英文图片",
  { timeout: 60000 },
  async () => {
    const sharp = (await import("sharp")).default,
      { createWorker } = await import("tesseract.js");
    const input = await sharp({
      text: {
        text: "多功能工具箱\nHELLO WORLD 123",
        font: "Noto Sans SC 64",
        fontfile: fileURLToPath(
          new URL("../public/fonts/noto-sans-sc/regular.otf", import.meta.url),
        ),
        rgba: true,
      },
    })
      .flatten({ background: "#ffffff" })
      .extend({
        top: 24,
        bottom: 24,
        left: 24,
        right: 24,
        background: "#ffffff",
      })
      .png()
      .toBuffer();
    const worker = await createWorker("eng+chi_sim", 1, {
      langPath: fileURLToPath(
        new URL("../public/ocr/7.0.0/data/", import.meta.url),
      ),
      cacheMethod: "none",
      gzip: false,
    });
    try {
      const { data } = await worker.recognize(input);
      assert.match(data.text, /HELLO\s+WORLD\s+123/i);
      assert.match(data.text.replaceAll(" ", ""), /多功能工具箱/);
    } finally {
      await worker.terminate();
    }
  },
);
test("全部新工具路由、分类与站点地图已接入，没有网易云入口", async () => {
  const grid = await readFile(
      new URL("../app/components/tool-search-grid.tsx", import.meta.url),
      "utf8",
    ),
    sitemap = await readFile(
      new URL("../public/sitemap.xml", import.meta.url),
      "utf8",
    );
  for (const path of [
    "pdf-pages",
    "text-diff",
    "batch-rename",
    "image-ocr",
    "json-formatter",
    "markdown-editor",
    "zip",
    "subtitle-editor",
    "audio-editor",
    "image-exif",
    "timestamp",
    "unicode-inspector",
    "seamless-texture",
    "channel-packer",
    "panorama",
    "height-to-normal",
  ]) {
    assert.ok(grid.includes(`href: "/${path}"`));
    assert.ok(sitemap.includes(`/${path}</loc>`));
    await readFile(new URL(`../app/${path}/page.tsx`, import.meta.url), "utf8");
  }
  assert.doesNotMatch(grid, /网易云|其他服务|wyapi\.toubiec\.cn/);
});
