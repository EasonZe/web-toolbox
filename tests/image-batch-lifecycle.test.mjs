import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

function fixture(kind, { manualImages = false, manualBitmaps = false } = {}) {
  let sequence = 0;
  const resources = new Map(), created = [], revoked = [], images = [], bitmaps = [], bitmapRequests = [], encodes = [], canvases = [];
  class FixtureImage {
    naturalWidth = 2;
    naturalHeight = 2;
    onload = null;
    onerror = null;
    constructor() { images.push(this); }
    get src() { return this.url ?? ""; }
    set src(value) {
      this.url = value;
      if (!manualImages && value) queueMicrotask(() => { if (this.url === value) this.onload?.(); });
    }
    removeAttribute(name) { if (name === "src") this.url = ""; }
  }
  const app = mountComponent(`app/components/${kind}.tsx`, kind === "image-compressor" ? "ImageCompressor" : "ImageConverter", (id) => {
    if (id === "./file-drop-zone") return { FileDropZone: "drop-zone" };
    if (id === "./tool-handoff") return { ResultContinue: "result-continue", ToolHandoffInput: "handoff-input" };
    if (id.startsWith("../lib/")) return loadLocalModule(`app/lib/${id.slice(7)}.ts`);
  }, {
    Image: FixtureImage,
    crypto: { randomUUID: () => `item-${++sequence}` },
    URL: {
      createObjectURL(blob) { const url = `blob:fixture-${++sequence}`; resources.set(url, blob); created.push({ url, blob }); return url; },
      revokeObjectURL(url) { resources.delete(url); revoked.push(url); },
    },
    createImageBitmap: async (file) => {
      const bitmap = { file, width: 2, height: 2, closed: 0, close() { this.closed++; } };
      bitmaps.push(bitmap);
      if (manualBitmaps) return new Promise((resolve) => bitmapRequests.push(() => resolve(bitmap)));
      return bitmap;
    },
    document: {
      createElement(tag) {
        if (tag !== "canvas") return { click() {}, remove() {} };
        const canvas = {
          width: 300, height: 150,
          getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData() {} }),
          toBlob(callback, type) { encodes.push({ canvas, callback, type, settled: false }); },
        };
        canvases.push(canvas); return canvas;
      },
      body: { append() {} },
    },
    window: { setTimeout, clearTimeout },
  });
  let root;
  function render() { root = app.render(); app.flushEffects(); root = app.render(); return root; }
  const element = (predicate) => find(render(), predicate);
  const runButton = () => element((node) => node.props?.className === (kind === "image-compressor" ? "convert-button image-compressor-run" : "convert-button image-converter-download"));
  const clearButton = () => element((node) => node.props?.className === (kind === "image-compressor" ? "image-compressor-clear" : "image-converter-clear"));
  const stopButton = () => element((node) => node.type === "button" && flattenText(node).includes("停止处理"));
  function finishNext(blob) {
    const pending = encodes.find((entry) => !entry.settled);
    assert.ok(pending, "an image encode should be pending");
    pending.settled = true;
    pending.callback(blob === undefined ? new Blob(["encoded"], { type: pending.type }) : blob);
  }
  async function drain(run) {
    let done = false;
    const completion = Promise.resolve(run).finally(() => { done = true; });
    for (let turn = 0; turn < 30 && !done; turn++) {
      for (const pending of encodes.filter((entry) => !entry.settled)) {
        pending.settled = true; pending.callback(new Blob(["encoded"], { type: pending.type }));
      }
      await tick();
    }
    assert.ok(done, "the controlled batch should settle without hanging");
    await completion;
  }
  render();
  return {
    ...app, kind, resources, created, revoked, images, bitmaps, bitmapRequests, encodes, canvases,
    render, element, runButton, clearButton, stopButton, finishNext, drain,
    add(files) { return element((node) => node.type === "drop-zone").props.onFiles(files); },
    start() { return runButton().props.onClick(); },
    list() { return element((node) => node.props?.className === (kind === "image-compressor" ? "image-compressor-list" : "image-converter-list")); },
    done() { return element((node) => node.type === "result-continue")?.props.count ?? 0; },
  };
}

function flattenText(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  return flattenText(node.props?.children);
}

const picture = (name = "image.png") => new File(["a somewhat larger original image"], name, { type: "image/png", lastModified: 1 });

test("图片压缩卸载后不处理剩余文件，也不创建失去所有者的结果 URL", async () => {
  const ui = fixture("image-compressor");
  ui.add([picture("a.png"), picture("b.png")]); ui.render();
  const run = ui.start(); await tick();
  assert.equal(ui.encodes.length, 1);
  ui.unmount();
  const createdBeforeCompletion = ui.created.length;
  await ui.drain(run);
  assert.equal(ui.encodes.length, 1, "the remaining input must not start after unmount");
  assert.equal(ui.created.length, createdBeforeCompletion, "a discarded native encode must not allocate a result URL");
  assert.equal(ui.resources.size, 0, "all preview URLs must have been released");
});

test("图片转换卸载会取消未完成导入，不回填文件或残留预览 URL", async () => {
  const ui = fixture("image-converter", { manualImages: true });
  const importing = ui.add([picture("late.png")]);
  const image = ui.images[0], lateLoad = image.onload;
  ui.unmount(); lateLoad?.(); await importing;
  assert.equal(ui.resources.size, 0, "the not-yet-registered import preview must be released");
  assert.equal(ui.element((node) => node.props?.title === "late.png"), undefined, "late import completion must not populate a disposed component");
});

test("图片转换重叠导入不会绕过去重并追加同一批文件", async () => {
  const ui = fixture("image-converter", { manualImages: true });
  const file = picture("same.png"), first = ui.add([file]);
  assert.equal(ui.element((node) => node.type === "drop-zone").props.disabled, true, "the import control should expose the active import lock");
  const second = ui.add([file]);
  for (const image of ui.images) image.onload?.();
  await Promise.all([first, second]);
  assert.equal(ui.list().props.children.length, 1);
  ui.unmount();
});

test("图片转换导入中清空立即失效旧批次，迟到成功和错误都不能回填", async () => {
  const ui = fixture("image-converter", { manualImages: true });
  const first = ui.add([picture("existing.png")]); ui.images.at(-1).onload(); await first; ui.render();
  const incoming = ui.add([picture("late.png")]), image = ui.images.at(-1);
  const lateLoad = image.onload, lateError = image.onerror;
  assert.equal(ui.clearButton().props.disabled, false, "clear remains available during import");
  ui.clearButton().props.onClick();
  lateLoad?.(); lateError?.(); await incoming;
  assert.equal(ui.list(), undefined);
  assert.equal(ui.resources.size, 0);
  assert.doesNotMatch(flattenText(ui.render()), /无法读取图片|late\.png/);
  ui.unmount();
});

test("图片转换清空后开始的新导入不受旧 Image 错误影响", async () => {
  const ui = fixture("image-converter", { manualImages: true });
  const existing = ui.add([picture("existing.png")]); ui.images.at(-1).onload(); await existing; ui.render();
  const old = ui.add([picture("old.png")]), lateError = ui.images.at(-1).onerror;
  ui.clearButton().props.onClick();
  const current = ui.add([picture("current.png")]); ui.images.at(-1).onload(); await current;
  lateError?.(); await old;
  assert.ok(ui.element((node) => node.props?.title === "current.png"));
  assert.equal(ui.element((node) => node.props?.title === "old.png"), undefined);
  assert.doesNotMatch(flattenText(ui.render()), /已跳过|无法读取图片/);
  assert.equal(ui.resources.size, 1);
  ui.unmount();
});

test("图片转换半批导入清空后立即开启新导入，旧批清理不回收新批 URL", async () => {
  const ui = fixture("image-converter", { manualImages: true });
  const old = ui.add([picture("old-a.png"), picture("old-b.png")]);
  ui.images.at(-1).onload(); await tick();
  assert.equal(ui.images.length, 2);
  const lateLoad = ui.images.at(-1).onload;
  ui.clearButton().props.onClick();
  const current = ui.add([picture("current.png")]), currentImage = ui.images.at(-1);
  lateLoad?.(); await old;
  assert.equal(ui.resources.size, 1, "cleanup of accepted old items cannot release a new pending preview");
  currentImage.onload(); await current;
  assert.equal(ui.list().props.children.length, 1);
  assert.ok(ui.element((node) => node.props?.title === "current.png"));
  ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
});

test("图片压缩在原生 bitmap 解码期间停止，等待解码收尾并关闭迟到 bitmap", async () => {
  const ui = fixture("image-compressor", { manualBitmaps: true });
  ui.add([picture("a.png"), picture("b.png")]); ui.render();
  const run = ui.start(); await tick();
  assert.equal(ui.bitmapRequests.length, 1);
  ui.stopButton().props.onClick();
  assert.equal(ui.runButton().props.disabled, true);
  ui.bitmapRequests[0](); await run;
  assert.equal(ui.bitmaps.length, 1);
  assert.equal(ui.bitmaps[0].closed, 1);
  assert.equal(ui.canvases.length, 0);
  assert.equal(ui.encodes.length, 0);
  assert.equal(ui.done(), 0);
  assert.equal(ui.runButton().props.disabled, false);
  ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
});

function childUpload(ui) {
  let child, key;
  function sync() {
    const node = ui.element((element) => element.type === "drop-zone");
    if (!child || !Object.is(key, node.key)) {
      child?.unmount(); key = node.key;
      child = mountComponent("app/components/file-drop-zone.tsx", "FileDropZone", (id) => id.startsWith("../lib/") ? loadLocalModule(`app/lib/${id.slice(7)}.ts`) : undefined);
    }
    child.render(node.props); child.flushEffects(); return child.render(node.props);
  }
  return { sync, unmount() { child?.unmount(); } };
}

for (const kind of ["image-compressor", "image-converter"]) {
  test(`${kind}清空同步使旧上传回调失效，新渲染回调仍可导入`, async () => {
    const ui = fixture(kind); await ui.add([picture("existing.png")]); ui.render();
    const staleDelivery = ui.element((node) => node.type === "drop-zone").props.onFiles;
    ui.clearButton().props.onClick();
    // Invoke the old callback before another parent render/child cleanup: the ref
    // guard, rather than only a React key change, must reject this stale delivery.
    await staleDelivery([picture("stale.png")]);
    assert.equal(ui.list(), undefined);
    assert.equal(ui.resources.size, 0);
    await ui.add([picture("fresh.png")]);
    assert.equal(ui.list().props.children.length, 1);
    assert.ok(ui.element((node) => node.props?.title === "fresh.png"));
    ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
  });

  test(`${kind}清空也使尚未进入父组件的上传读头预检失效`, async () => {
    const ui = fixture(kind); await ui.add([picture("existing.png")]); ui.render();
    const child = childUpload(ui); let release, sampled = false;
    const header = new Uint8Array(24); header.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(header.buffer); view.setUint32(16, 2); view.setUint32(20, 2);
    const file = picture("pending-header.png");
    Object.defineProperty(file, "slice", { value() { sampled = true; return { arrayBuffer: () => new Promise((resolve) => { release = () => resolve(header.buffer); }) }; } });
    find(child.sync(), (node) => node.type === "input").props.onChange({ currentTarget: { files: [file], value: "" } });
    await tick(); assert.equal(sampled, true);
    ui.clearButton().props.onClick(); child.sync();
    release(); await tick(); await tick();
    assert.equal(ui.list(), undefined, "a pre-clear file choice must not resurrect after asynchronous header inspection");
    child.unmount(); ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
  });
}

for (const kind of ["image-compressor", "image-converter"]) {
  const label = kind === "image-compressor" ? "图片压缩" : "图片转换";

  test(`${label}成功或编码失败都主动清零画布，压缩 bitmap 恰好关闭一次`, async () => {
    for (const success of [true, false]) {
      const ui = fixture(kind); await ui.add([picture()]); ui.render();
      const run = ui.start(); await tick();
      assert.equal(ui.canvases.length, 1);
      assert.equal(ui.canvases[0].width, 2);
      ui.finishNext(success ? undefined : null); await run;
      assert.equal(ui.canvases[0].width, 0);
      assert.equal(ui.canvases[0].height, 0);
      assert.equal(ui.done(), success ? 1 : 0);
      for (const bitmap of ui.bitmaps) assert.equal(bitmap.closed, 1);
      ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
    }
  });

  test(`${label}同一事件轮次重复开始只启动一个批次`, async () => {
    const ui = fixture(kind); await ui.add([picture()]); ui.render();
    const start = ui.runButton().props.onClick, first = start(), second = start();
    await tick();
    const started = ui.encodes.length;
    await ui.drain(Promise.all([first, second]));
    assert.equal(started, 1, "the synchronous guard must work before React re-renders the disabled button");
    assert.equal(ui.encodes.length, 1);
    assert.equal(ui.done(), 1);
    ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
  });

  test(`${label}停止时等待原生编码收尾，保留成功项且恢复只处理未完成项`, async () => {
    const ui = fixture(kind); await ui.add([picture("a.png"), picture("b.png"), picture("c.png")]); ui.render();
    const run = ui.start(); await tick();
    assert.equal(ui.encodes.length, 1);
    ui.finishNext(); await tick();
    assert.equal(ui.done(), 1); assert.equal(ui.encodes.length, 2);
    const stop = ui.stopButton(); assert.ok(stop, "a running batch exposes an explicit stop action");
    stop.props.onClick();
    assert.equal(ui.runButton().props.disabled, true, "native toBlob must finish before another batch can start");
    const createdAtStop = ui.created.length;
    ui.finishNext(); await run;
    assert.equal(ui.encodes.length, 2, "the third file must remain queued after stop");
    assert.equal(ui.created.length, createdAtStop, "the cancelled encode cannot allocate a result URL");
    assert.equal(ui.done(), 1, "the already-completed first result stays available");
    assert.equal(ui.runButton().props.disabled, false);
    assert.doesNotMatch(flattenText(ui.render()), /正在压缩…|正在转换…/);
    const resumed = ui.start(); await ui.drain(resumed);
    assert.equal(ui.encodes.length, 4, "resume should process b and c, not repeat completed a");
    assert.equal(ui.done(), 3);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    for (const bitmap of ui.bitmaps) assert.equal(bitmap.closed, 1);
    ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
  });

  test(`${label}停止后的迟到编码失败不显示为新错误，也不启动后续文件`, async () => {
    const ui = fixture(kind); await ui.add([picture("a.png"), picture("b.png")]); ui.render();
    const run = ui.start(); await tick();
    const stop = ui.stopButton(); assert.ok(stop); stop.props.onClick();
    ui.finishNext(null); await run;
    assert.equal(ui.encodes.length, 1);
    assert.equal(ui.done(), 0);
    assert.doesNotMatch(flattenText(ui.render()), /未能生成|压缩失败|转换失败/);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    assert.equal(ui.runButton().props.disabled, false);
    const resumed = ui.start(); await ui.drain(resumed);
    assert.equal(ui.done(), 2);
    ui.render(); ui.unmount(); assert.equal(ui.resources.size, 0);
  });

  test(`${label}卸载后的迟到编码失败只清理资源而不启动下一项`, async () => {
    const ui = fixture(kind); await ui.add([picture("a.png"), picture("b.png")]); ui.render();
    const run = ui.start(); await tick(); ui.unmount();
    ui.finishNext(null); await ui.drain(run);
    assert.equal(ui.encodes.length, 1);
    assert.equal(ui.resources.size, 0);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
    for (const bitmap of ui.bitmaps) assert.equal(bitmap.closed, 1);
  });
}
