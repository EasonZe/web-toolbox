import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../app/components/image-compressor.tsx", import.meta.url),
  "utf8",
);

test("batch image compressor supports the requested formats and controls", () => {
  assert.match(source, /image\/jpeg/);
  assert.match(source, /image\/png/);
  assert.match(source, /image\/webp/);
  assert.match(source, /multiple/);
  assert.match(source, /onFiles=/);
  assert.match(source, /压缩质量/);
  assert.match(source, /type="range"/);
  assert.match(source, /开始压缩/);
});

test("batch image compressor handles local compression and downloads", () => {
  assert.match(source, /createImageBitmap/);
  assert.match(source, /canvas\.toBlob/);
  assert.match(source, /optimizePngPixels/);
  assert.match(source, /createZip/);
  assert.match(source, /compressed-images\.zip/);
  assert.match(source, /支持批量压缩JPG、PNG和WebP/);
  assert.doesNotMatch(source, /浏览器本地处理|不会上传/);
});

const qualitySource = await readFile(new URL("../app/lib/image-compression-quality.ts", import.meta.url), "utf8");
function compile(code) {
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const qualityExports = {};
vm.runInNewContext(compile(qualitySource), { exports: qualityExports });
const { normalizeCompressionQuality, pngColorTable } = qualityExports;

test("质量范围为1到100，保留每个整数档位并校正非法数值", () => {
  for (let value = 1; value <= 100; value++) assert.equal(normalizeCompressionQuality(value), value);
  assert.equal(normalizeCompressionQuality(0), 1);
  assert.equal(normalizeCompressionQuality(120), 100);
  assert.equal(normalizeCompressionQuality(72.6), 73);
  assert.equal(normalizeCompressionQuality(NaN), 80);
  assert.equal(normalizeCompressionQuality(Infinity), 80);
});

test("PNG的100档色彩映射互不相同，最高档保留原始色彩", () => {
  const tables = new Set();
  for (let quality = 1; quality <= 100; quality++) {
    const colors = [...pngColorTable(quality)];
    assert.equal(colors.length, 256);
    assert.equal(colors[0], 0);
    assert.equal(colors[255], 255);
    assert.ok(colors.every((v, index) => v >= 0 && v <= 255 && (!index || v >= colors[index - 1])));
    tables.add(colors.join(","));
  }
  assert.equal(tables.size, 100);
  assert.deepEqual([...pngColorTable(100)], Array.from({ length: 256 }, (_, index) => index));
});

function harness() {
  const slots = [];
  let cursor = 0;
  let root;
  const encodes = [];
  let objectCount = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn) { return fn(); },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(compile(source + "\nexport { compressImage, optimizePngPixels };"), {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "react-icons/fi") return {};
      if (name === "./file-drop-zone") return { FileDropZone: "drop-zone" };
      if (name === "../lib/image-compression-quality") return qualityExports;
      throw new Error(`Unexpected import: ${name}`);
    },
    URL: { revokeObjectURL() {}, createObjectURL() { return `blob:test-${objectCount++}`; } },
    crypto: { randomUUID() { return String(objectCount++); } },
    createImageBitmap: async () => ({ width: 2, height: 2, close() {} }),
    document: { createElement() { return {
      getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(16) }; }, putImageData() {} }; },
      toBlob(callback, type, quality) {
        encodes.push({ type, quality });
        callback(new Blob(["encoded"], { type }));
      },
    }; } },
  });
  function find(predicate, node = root) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children.flat(Infinity)) {
      if (child == null) continue;
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  function render() { cursor = 0; root = exports.default(); }
  render();
  const control = (id) => find((node) => node.props?.id === id);
  const press = (label) => find((node) => node.props?.["aria-label"] === label).props;
  return {
    get quality() { return control("image-quality-range").props.value; },
    get input() { return control("image-quality-number").props; },
    get range() { return control("image-quality-range").props; },
    setInput(value) { this.input.onChange({ target: { value } }); render(); },
    blur() { this.input.onBlur(); render(); },
    step(label) { if (!press(label).disabled) press(label).onClick(); render(); },
    slide(value) { this.range.onChange({ target: { value: String(value) } }); render(); },
    preset(value) { find((node) => node.type === "button" && node.props.children?.[0] === value).props.onClick(); render(); },
    add(files) { find((node) => node.type === "drop-zone").props.onFiles(files); render(); },
    async compress() { await find((node) => node.props?.className === "convert-button image-compressor-run").props.onClick(); render(); },
    get downloadDisabled() { return find((node) => node.props?.className === "open-button image-compressor-download-all").props.disabled; },
    encodes,
    optimizePngPixels: exports.optimizePngPixels,
  };
}

test("质量输入、滑块、加减与快捷档位同步且可逐1%调节", () => {
  const ui = harness();
  assert.equal(ui.quality, 80);
  assert.equal(ui.range.min, "1");
  assert.equal(ui.range.max, "100");
  assert.equal(ui.range.step, "1");
  ui.setInput("73");
  assert.equal(ui.quality, 73);
  ui.step("提高质量1%");
  assert.equal(ui.quality, 74);
  assert.equal(ui.input.value, "74");
  ui.step("降低质量1%");
  assert.equal(ui.quality, 73);
  ui.slide(47);
  assert.equal(ui.input.value, "47");
  for (const value of [20, 40, 60, 80, 90, 100]) {
    ui.preset(value);
    assert.equal(ui.quality, value);
    assert.equal(ui.input.value, String(value));
  }
  ui.step("提高质量1%");
  assert.equal(ui.quality, 100);
  ui.slide(1);
  ui.step("降低质量1%");
  assert.equal(ui.quality, 1);
});

test("数值输入允许暂时清空，失焦时恢复或校正边界", () => {
  const ui = harness();
  ui.setInput("");
  assert.equal(ui.input.value, "");
  assert.equal(ui.input["aria-invalid"], true);
  assert.equal(ui.quality, 80);
  ui.blur();
  assert.equal(ui.input.value, "80");
  for (const [input, result] of [["101", 100], ["-10", 1], ["72.6", 73]]) {
    ui.setInput(input);
    assert.equal(ui.input["aria-invalid"], true);
    ui.blur();
    assert.equal(ui.quality, result);
    assert.equal(ui.input.value, String(result));
    assert.equal(ui.input["aria-invalid"], false);
  }
});

test("PNG优化保持透明度，100%不修改任何像素", () => {
  const ui = harness();
  for (const quality of [1, 37, 80, 99, 100]) {
    const data = new Uint8ClampedArray(Array.from({ length: 256 }, (_, value) => [value, value, value, value]).flat());
    const before = [...data];
    let writes = 0;
    ui.optimizePngPixels({
      getImageData: () => ({ data }),
      putImageData: () => { writes++; },
    }, 256, 1, quality);
    for (let index = 3; index < data.length; index += 4) assert.equal(data[index], before[index]);
    if (quality === 100) {
      assert.equal(writes, 0);
      assert.deepEqual([...data], before);
    } else {
      assert.equal(writes, 1);
      assert.notDeepEqual([...data], before);
    }
  }
});

test("精确质量传给编码器，批量结果正确绑定且调节后失效", async () => {
  const ui = harness();
  ui.add([
    new File(["a".repeat(100)], "sample.jpg", { type: "image/jpeg" }),
    new File(["b".repeat(100)], "sample.png", { type: "image/png" }),
    new File(["c".repeat(100)], "sample.webp", { type: "image/webp" }),
  ]);
  assert.equal(ui.downloadDisabled, true);
  for (const quality of [1, 73, 100]) {
    ui.slide(quality);
    assert.equal(ui.downloadDisabled, true, "新质量不可下载旧结果");
    await ui.compress();
    assert.equal(ui.downloadDisabled, false, "压缩完成后支持批量下载");
    assert.deepEqual(ui.encodes.slice(-3), [
      { type: "image/jpeg", quality: quality / 100 },
      { type: "image/png", quality: undefined },
      { type: "image/webp", quality: quality / 100 },
    ]);
    ui.slide(quality);
    assert.equal(ui.downloadDisabled, false, "重复选择相同质量保留结果");
  }
});
