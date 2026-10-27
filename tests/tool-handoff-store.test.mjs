import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { readToolCatalog } from "../scripts/project-integrity.mjs";
const handoff = loadLocalModule("app/lib/tool-handoff.ts"), { toolLimits } = loadLocalModule("app/lib/resource-limits.ts");
const pdf = () => new File(["%PDF-1.7"], "result.pdf", { type: "application/pdf" });
const image = () => new File(["png"], "result.png", { type: "image/png" });
function memoryStore() {
  let now = 0, sequence = 0; const timers = new Map();
  const store = handoff.createToolHandoffStore({ now: () => now, schedule: (callback, delay) => { timers.set(++sequence, { callback, delay }); return sequence; }, cancel: (id) => timers.delete(id) });
  return { store, timers, advance: (ms) => now += ms };
}

test("暂存仅保留文件引用与稳定快照，不读取文件内容；确认一次后释放", () => {
  const { store, timers } = memoryStore(), files = [image(), image()]; let notifications = 0;
  for (const file of files) { file.arrayBuffer = () => assert.fail("no whole-file read"); file.slice = () => assert.fail("no eager preview"); }
  const unsubscribe = store.subscribe(() => notifications++), packet = store.offer("/images-to-pdf", files, " 图片压缩 ");
  assert.equal(packet.source, "图片压缩"); assert.equal(packet.files[0], files[0]); assert.equal(packet.files[1], files[1]); assert.equal(store.snapshot(), packet);
  files.pop(); assert.equal(packet.files.length, 2); assert.equal(Object.isFrozen(packet.files), true);
  assert.equal(store.peek("/pdf-cropper", packet.id), null); assert.equal(store.snapshot(), packet); assert.equal(store.peek("/images-to-pdf", packet.id), packet);
  assert.equal([...timers.values()][0].delay, 300000); assert.equal(store.discard(packet.id), true); assert.equal(store.discard(packet.id), false); assert.equal(store.snapshot(), null); assert.equal(timers.size, 0);
  assert.equal(notifications, 2); unsubscribe(); store.offer("/pdf-cropper", [pdf()], "合并"); store.clear(); assert.equal(notifications, 2);
});

test("只有一个待接收批次，旧计时器、旧确认与旧取消不能清除新批次", () => {
  const { store, timers } = memoryStore(), first = store.offer("/pdf-cropper", [pdf()], "first"), oldTimer = [...timers.values()][0];
  const second = store.offer("/pdf-page-numbers", [pdf()], "second"); assert.equal(timers.size, 1);
  oldTimer.callback(); assert.equal(store.discard(first.id), false); assert.equal(store.peek("/pdf-cropper", first.id), null); assert.equal(store.snapshot(), second);
  store.clear(); assert.equal(timers.size, 0); assert.equal(store.snapshot(), null);
});

test("五分钟到期释放，后台定时器延迟时接收前仍拒绝过期文件", () => {
  for (const delayed of [false, true]) {
    const { store, timers, advance } = memoryStore(), packet = store.offer("/pdf-cropper", [pdf()], "source");
    advance(handoff.handoffLifetimeMs); assert.equal(store.snapshot(), null); if (!delayed) [...timers.values()][0].callback();
    assert.equal(store.peek("/pdf-cropper", packet.id), null); assert.equal(store.snapshot(), null); assert.equal(timers.size, 0);
  }
});

test("仅固定工具接收匹配格式，拒绝 ZIP 伪装、空文件、超量与容量超限", () => {
  const { store } = memoryStore(), valid = store.offer("/pdf-cropper", [pdf()], "kept");
  for (const [target, files] of [
    ["https://example.test/", [pdf()]], ["/missing", [pdf()]], ["/pdf-cropper", []], ["/pdf-cropper", [pdf(), pdf()]],
    ["/pdf-cropper", [image()]], ["/image-text", [image(), image()]], ["/images-to-pdf", [new File(["zip"], "batch.zip", { type: "application/zip" })]],
    ["/images-to-pdf", [new File([], "empty.png", { type: "image/png" })]], ["/image-compressor", [new File(["svg"], "a.svg", { type: "image/svg+xml" })]],
    ["/images-to-pdf", Array(201).fill(image())], ["/pdf-cropper", [{ size: 1, name: "fake.pdf", type: "application/pdf" }]],
  ]) { assert.throws(() => store.offer(target, files, "source")); assert.equal(store.snapshot(), valid); }
  const largePdf = pdf(); Object.defineProperty(largePdf, "size", { value: toolLimits.document.fileBytes + 1 }); assert.throws(() => store.offer("/pdf-cropper", [largePdf], "source"), /容量/);
  const largeImage = image(); Object.defineProperty(largeImage, "size", { value: toolLimits.image.fileBytes + 1 }); assert.throws(() => store.offer("/images-to-pdf", [largeImage], "source"), /大小/);
  const negative = image(); Object.defineProperty(negative, "size", { value: -1 }); assert.throws(() => store.offer("/images-to-pdf", [negative], "source"));
  assert.throws(() => store.offer("/pdf-cropper", [pdf()], "")); store.clear();
});

test("结果文件保留字节、格式及顺序，名称不携带本地路径或控制字符", async () => {
  const bytes = new Uint8Array([0, 1, 255, 33]), result = handoff.resultFile(new Blob([bytes], { type: "image/png" }), "C:\\private\\图片\u0000.png");
  assert.equal(result.name, "图片_.png"); assert.equal(result.type, "image/png"); assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.ok(handoff.resultFile(new Blob(["pdf"]), `${"中".repeat(300)}.pdf`, "application/pdf").name.endsWith(".pdf"));
});

test("浏览器页隐藏清空传递，服务端不创建文件存储、不暴露用户快照", () => {
  assert.equal(handoff.handoffSnapshot(), null); assert.equal(handoff.handoffServerSnapshot(), null); assert.throws(() => handoff.offerHandoff("/pdf-cropper", [pdf()], "source"), /浏览器/);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window"), events = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener: (name, work) => events.set(name, work) } });
  try {
    const packet = handoff.offerHandoff("/pdf-cropper", [pdf()], "source"); assert.equal(handoff.handoffSnapshot(), packet); assert.equal(handoff.handoffServerSnapshot(), null);
    events.get("pagehide")(); assert.equal(handoff.handoffSnapshot(), null); assert.equal(handoff.discardHandoff(packet.id), false);
  } finally { events.get("pagehide")?.(); if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else delete globalThis.window; }
});

test("五个目标均为已注册页面，内存传递不使用网络、持久化或文件 URL", async () => {
  const catalog = readToolCatalog(await readFile(new URL("../app/components/tool-search-grid.tsx", import.meta.url), "utf8"));
  for (const target of Object.keys(handoff.handoffTargets)) assert.ok(catalog.tools.some((tool) => tool.href === target), target);
  const source = await readFile(new URL("../app/lib/tool-handoff.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|indexedDB|localStorage|sessionStorage|createObjectURL)\b/);
});
