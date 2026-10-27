import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
const { createPdfPreviewSession } = loadLocalModule("app/lib/pdf-preview-session.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const image = (label) => ({ blob: new Blob([label]), width: 100, height: 200 });
function engine() {
  let loads = 0, destroys = 0;
  const renders = [], document = { loadingTask: { async destroy() { destroys++; } } };
  const api = { async loadPdf() { loads++; return document; }, renderPdfPage(pdf, page, signal) { const value = deferred(); renders.push({ ...value, pdf, page, signal }); return value.promise; } };
  return { api, renders, document, loads: () => loads, destroys: () => destroys };
}

test("预览会话连续三次切页只解析一次，不提前销毁，退出幂等释放", async () => {
  const fake = engine(); let imports = 0;
  const session = createPdfPreviewSession(new Blob(["pdf"]), async () => { imports++; return fake.api; });
  for (let page = 1; page <= 3; page++) {
    const pending = session.render(page, new AbortController().signal); await tick();
    fake.renders.at(-1).resolve(image(`page-${page}`)); assert.equal((await pending).width, 100);
  }
  assert.equal(imports, 1); assert.equal(fake.loads(), 1); assert.equal(fake.renders.length, 3); assert.equal(fake.destroys(), 0);
  await Promise.all([session.dispose(), session.dispose()]); assert.equal(fake.destroys(), 1);
  await assert.rejects(session.render(1, new AbortController().signal), { name: "AbortError" });
});

test("新页取消旧页但复用正在加载的文档，忽略不遵守取消的迟到渲染", async () => {
  const fake = engine(), loading = deferred(); let loads = 0;
  fake.api.loadPdf = async () => { loads++; return loading.promise; };
  const session = createPdfPreviewSession(new Blob(), async () => fake.api);
  const first = session.render(1, new AbortController().signal).catch((error) => error); await tick();
  const second = session.render(2, new AbortController().signal); loading.resolve(fake.document); await tick();
  assert.equal((await first).name, "AbortError"); assert.equal(loads, 1); assert.equal(fake.renders.length, 1); assert.equal(fake.renders[0].page, 2);
  const third = session.render(3, new AbortController().signal); const outcome = second.catch((error) => error); await tick();
  assert.equal(fake.renders[0].signal.aborted, true);
  fake.renders[1].resolve(image("new")); await third; fake.renders[0].resolve(image("late")); assert.equal((await outcome).name, "AbortError");
  await session.dispose(); assert.equal(fake.destroys(), 1);
});

test("退出发生在引擎导入前不解析文件，加载完成后退出也只释放一次", async () => {
  const fake = engine(), importing = deferred(), session = createPdfPreviewSession(new Blob(), () => importing.promise);
  const pending = session.render(1, new AbortController().signal).catch((error) => error), disposed = session.dispose();
  importing.resolve(fake.api); await disposed; assert.equal((await pending).name, "AbortError"); assert.equal(fake.loads(), 0);
  const loading = deferred(); fake.api.loadPdf = () => loading.promise;
  const next = createPdfPreviewSession(new Blob(), async () => fake.api), outcome = next.render(1, new AbortController().signal).catch((error) => error); await tick();
  const finishing = next.dispose(); loading.resolve(fake.document); await finishing; await next.dispose();
  assert.equal((await outcome).name, "AbortError"); assert.equal(fake.destroys(), 1); assert.equal(fake.renders.length, 0);
});

test("外部取消、加载失败和页面失败不泄漏未处理拒绝，其他页仍可继续", async () => {
  const fake = engine(), session = createPdfPreviewSession(new Blob(), async () => fake.api), controller = new AbortController();
  const pending = session.render(1, controller.signal).catch((error) => error); await tick(); controller.abort();
  assert.equal(fake.renders[0].signal.aborted, true); fake.renders[0].reject(new Error("canceled render")); assert.match((await pending).message, /canceled/);
  const failed = session.render(2, new AbortController().signal).catch((error) => error); await tick(); fake.renders[1].reject(new Error("bad page")); assert.match((await failed).message, /bad page/);
  const recovered = session.render(3, new AbortController().signal); await tick(); fake.renders[2].resolve(image("ok")); await recovered;
  assert.equal(fake.loads(), 1); await session.dispose();
  const broken = createPdfPreviewSession(new Blob(), async () => { throw new Error("cannot import engine"); });
  await assert.rejects(broken.render(1, new AbortController().signal), /cannot import/); await broken.dispose();
  const aborted = new AbortController(); aborted.abort(); const unused = createPdfPreviewSession(new Blob(), async () => { assert.fail("must not import"); });
  await assert.rejects(unused.render(1, aborted.signal), { name: "AbortError" }); await unused.dispose();
});

function preview() {
  const fake = engine(), sessions = [];
  const app = mountComponent("app/components/pdf-local-preview.tsx", "PdfLocalPreview", (id) => {
    if (id === "./local-workbench") return { useBlobUrl: (blob) => blob ? `blob:${blob.size}` : "" };
    if (id === "../lib/pdf-preview-session") return { createPdfPreviewSession: (file) => { const session = createPdfPreviewSession(file, async () => fake.api); sessions.push(session); return session; } };
  });
  return { ...app, fake, sessions };
}

test("预览 UI 切页保留已完成图像、标明旧页，不显示错误裁切框；换文件不露旧图", async () => {
  const app = preview(), file = new Blob(["one"]), margins = { top: 5, right: 5, bottom: 5, left: 5 };
  app.render({ file, page: 1, margins }); app.flushEffects(); await tick(); app.fake.renders[0].resolve(image("first")); await tick();
  let tree = app.render({ file, page: 1, margins }); assert.equal(allElements(tree, (n) => n.type === "img")[0].props.alt, "第 1 页预览"); assert.equal(allElements(tree, (n) => n.props?.className === "pdf-crop-guide").length, 1);
  tree = app.render({ file, page: 2, margins }); app.flushEffects(); await tick();
  assert.equal(tree.props["aria-busy"], true); assert.equal(allElements(tree, (n) => n.type === "img")[0].props.alt, "第 1 页预览");
  assert.equal(allElements(tree, (n) => n.props?.className === "pdf-crop-guide").length, 0); assert.equal(allElements(tree, (n) => n.props?.role === "status").length, 1);
  app.fake.renders[1].reject(new Error("page failed")); await tick(); tree = app.render({ file, page: 2, margins });
  assert.equal(tree.props["aria-busy"], false); assert.equal(allElements(tree, (n) => n.props?.role === "alert")[0].props.children, "page failed"); assert.equal(allElements(tree, (n) => n.type === "img").length, 1);
  tree = app.render({ file: new Blob(["two"]), page: 1, margins }); assert.equal(allElements(tree, (n) => n.type === "img").length, 0); assert.equal(allElements(tree, (n) => n.props?.role === "alert").length, 0);
  app.flushEffects(); await tick(); app.unmount(); await tick(); assert.equal(app.fake.destroys(), 2);
});
