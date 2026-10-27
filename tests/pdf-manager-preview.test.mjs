import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
const { createPdfPreviewSession } = loadLocalModule("app/lib/pdf-preview-session.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = (text) => ({ blob: new Blob([text]), width: 100, height: 200 });
const nodeImage = (tree) => allElements(tree, (node) => node.type === "img")[0];
function setup() {
  let loads = 0; const destroys = [], renders = [];
  const app = mountComponent("app/components/pdf-page-manager.tsx", "PdfPreview", (id) => {
    if (id === "./local-workbench") return { useBlobUrl: (blob) => blob ? `blob:${blob.size}` : "" };
    if (id === "../lib/pdf-preview-session") return { createPdfPreviewSession: (file) => createPdfPreviewSession(file, async () => ({
      loadPdf: async () => { const id = ++loads; return { id, loadingTask: { async destroy() { destroys.push(id); } } }; },
      renderPdfPage: (pdf, page, signal, scale) => new Promise((resolve, reject) => renders.push({ pdf, page, signal, scale, resolve, reject })),
    })) };
    if (id.startsWith(".")) return {};
  });
  return { ...app, renders, destroys, loads: () => loads };
}

test("页面管理三次切页复用文档，零基页码、0.7 倍缩略与旋转不变", async () => {
  const app = setup(), file = new File(["pdf"], "a.pdf");
  for (let page = 0; page < 3; page++) {
    app.render({ file, page, rotation: 90 }); app.flushEffects(); await tick();
    assert.equal(app.renders[page].page, page + 1); assert.equal(app.renders[page].scale, 0.7);
    app.renders[page].resolve(image(`page-${page}`)); await tick();
    const tree = app.render({ file, page, rotation: 90 }); assert.equal(tree.props.className, "pdf-page-preview");
    assert.equal(nodeImage(tree).props.alt, `第 ${page + 1} 页预览`); assert.equal(nodeImage(tree).props.style.transform, "rotate(90deg)");
  }
  app.render({ file, page: 2, rotation: 180 }); app.flushEffects(); await tick(); assert.equal(app.renders.length, 3);
  assert.equal(app.loads(), 1); assert.deepEqual(app.destroys, []); app.unmount(); await tick(); assert.deepEqual(app.destroys, [1]);
});

test("页面管理快速切页取消旧绘制，换文件销毁旧文档，迟到结果不能覆盖", async () => {
  const app = setup(), file = new File(["pdf"], "a.pdf");
  app.render({ file, page: 0, rotation: 0 }); app.flushEffects(); await tick();
  app.render({ file, page: 1, rotation: 0 }); app.flushEffects(); await tick(); assert.equal(app.renders[0].signal.aborted, true);
  app.renders[1].resolve(image("new")); await tick(); app.renders[0].resolve(image("old old")); await tick();
  assert.equal(nodeImage(app.render({ file, page: 1, rotation: 0 })).props.src, "blob:3");
  const next = new File(["next"], "b.pdf"); assert.equal(nodeImage(app.render({ file: next, page: 0, rotation: 0 })), undefined); app.flushEffects(); await tick();
  assert.deepEqual(app.destroys, [1]); assert.equal(app.loads(), 2); assert.equal(app.renders[2].page, 1);
  app.unmount(); app.renders[2].resolve(image("after exit")); await tick(); assert.equal(app.renders[2].signal.aborted, true); assert.deepEqual(app.destroys, [1, 2]);
});

test("页面管理错误显示后其他页可恢复，清空输入隐藏旧结果和错误", async () => {
  const app = setup(), file = new File(["pdf"], "a.pdf");
  app.render({ file, page: 0, rotation: 0 }); app.flushEffects(); await tick(); app.renders[0].reject(new Error("page failed")); await tick();
  let tree = app.render({ file, page: 0, rotation: 0 }); assert.equal(allElements(tree, (node) => node.type === "p")[0].props.children, "page failed");
  app.render({ file, page: 1, rotation: 270 }); app.flushEffects(); await tick(); app.renders[1].resolve(image("recovered")); await tick();
  tree = app.render({ file, page: 1, rotation: 270 }); assert.equal(nodeImage(tree).props.style.transform, "rotate(270deg)"); assert.equal(app.loads(), 1);
  tree = app.render({ file: undefined, page: 0, rotation: 0 }); app.flushEffects(); await tick(); assert.equal(nodeImage(tree), undefined); assert.deepEqual(app.destroys, [1]); app.unmount();
});
