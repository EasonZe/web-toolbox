import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createCanvas } from "@napi-rs/canvas";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";

const { createModelObjectURLScope } = loadLocalModule("app/lib/model-object-urls.ts");
const drain = () => new Promise(setImmediate);
async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("模型测试未在预期时间内完成");
    await drain();
  }
}

test("同步解析结束立即恢复原生 API，关闭时撤销本模型 URL，重复关闭安全", async () => {
  const original = URL.createObjectURL, scope = createModelObjectURLScope();
  const url = scope.capture(() => URL.createObjectURL(new Blob(["image"])));
  try {
    assert.equal(URL.createObjectURL, original);
    assert.equal(await (await fetch(url)).text(), "image");
    scope.release();
    scope.release();
    await assert.rejects(fetch(url));
    assert.throws(() => scope.capture(() => URL.createObjectURL(new Blob())), /已关闭/);
  } finally { scope.release(); }
});

test("解析中途异常会释放已创建 URL 并恢复 API，各模型不会互相释放贴图", async () => {
  const original = URL.createObjectURL, failed = createModelObjectURLScope();
  let broken;
  assert.throws(() => failed.capture(() => { broken = URL.createObjectURL(new Blob(["broken"])); throw new Error("bad fbx"); }), /bad fbx/);
  assert.equal(URL.createObjectURL, original);
  await assert.rejects(fetch(broken));
  const first = createModelObjectURLScope(), second = createModelObjectURLScope();
  const a = first.capture(() => URL.createObjectURL(new Blob(["first"]))), b = second.capture(() => URL.createObjectURL(new Blob(["second"])));
  try {
    first.release();
    await assert.rejects(fetch(a));
    assert.equal(await (await fetch(b)).text(), "second");
  } finally { first.release(); second.release(); }
  await assert.rejects(fetch(b));
});

// Exercise the installed FBXLoader's unchanged binary-image creation method.
// Only expose its private parser in an in-memory test module; no vendor edits.
const loaderURL = import.meta.resolve("three/addons/loaders/FBXLoader.js");
const source = readFileSync(new URL(loaderURL), "utf8");
const exposed = source.replace(/from\s+['"]([^'"]+)['"]/g, (whole, id) => {
  if (id === "three") return `from ${JSON.stringify(import.meta.resolve("three"))}`;
  if (id.startsWith(".")) return `from ${JSON.stringify(new URL(id, loaderURL).href)}`;
  return whole;
}).replace(/export\s*\{\s*FBXLoader\s*\};/, "export { FBXLoader, FBXTreeParser };");
const { FBXTreeParser } = await import(`data:text/javascript;base64,${Buffer.from(exposed).toString("base64")}`);
function binaryImage() {
  return new FBXTreeParser().parseImage({ RelativeFilename: "embedded.png", Content: new Uint8Array(createCanvas(1, 1).toBuffer("image/png")).buffer });
}

test("真实 FBX 内嵌图片即使未绑定材质也会被记录和释放", async () => {
  const oldWindow = globalThis.window, scope = createModelObjectURLScope();
  globalThis.window = { URL };
  try {
    const url = scope.capture(binaryImage);
    assert.equal((await fetch(url)).status, 200);
    scope.release();
    await assert.rejects(fetch(url));
  } finally {
    scope.release();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

function modelHarness({ fail = false, delayed = false } = {}) {
  const state = { urls: [], running: false, disposed: 0, parsing: 0, loaderStarted: false }, original = URL.createObjectURL;
  const container = { clientWidth: 320, clientHeight: 280, append() {} };
  class Renderer {
    domElement = { remove() {} };
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(callback) { state.running = !!callback; }
    render() {}
    dispose() { state.disposed++; }
    forceContextLoss() {}
  }
  class Controls {
    target = new THREE.Vector3();
    update() {}
    dispose() {}
  }
  class Observer { observe() {} disconnect() {} }
  class Loader {
    parse() {
      state.parsing++;
      const url = binaryImage();
      state.urls.push(url);
      if (fail) throw new Error("broken fbx");
      return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture({ src: url }) }));
    }
  }
  let resolveModule;
  const loaderModule = { FBXLoader: Loader }, pending = new Promise((resolve) => { resolveModule = resolve; });
  const component = loadHookComponent("app/components/unity-model-preview.tsx", "UnityModelPreview", (id) => {
    if (id === "three") return { ...THREE, WebGLRenderer: Renderer };
    if (id === "three/addons/controls/OrbitControls.js") return { OrbitControls: Controls };
    if (id === "three/addons/loaders/FBXLoader.js") { state.loaderStarted = true; return delayed ? pending : loaderModule; }
    if (id === "../lib/model-object-urls") return { createModelObjectURLScope };
  }, { window: { devicePixelRatio: 1, URL }, ResizeObserver: Observer });
  const view = component.render({ blob: new Blob(["model"]), name: "avatar.fbx" });
  allElements(view, (item) => item.props?.["aria-label"] === "模型三维预览")[0].props.ref.current = container;
  const [unmount] = component.runEffects();
  return { component, state, unmount, original, resume: () => resolveModule(loaderModule) };
}

test("真实模型组件关闭与解析失败均释放 FBX 贴图和渲染资源", async () => {
  const oldWindow = globalThis.window;
  globalThis.window = { URL };
  try {
    for (const fail of [false, true]) {
      const ui = modelHarness({ fail });
      try {
        await waitFor(() => ui.state.urls.length === 1 && (fail ? !!ui.component.slots[1] : ui.state.running));
        assert.equal(URL.createObjectURL, ui.original);
        if (!fail) assert.equal((await fetch(ui.state.urls[0])).status, 200);
        else {
          assert.match(ui.component.slots[1], /broken fbx/);
          await assert.rejects(fetch(ui.state.urls[0]), "解析失败应立即释放 URL，不等待用户关闭");
        }
        ui.unmount();
        ui.unmount();
        assert.equal(ui.state.running, false);
        assert.equal(ui.state.disposed, 1);
        await assert.rejects(fetch(ui.state.urls[0]));
      } finally { ui.unmount(); }
    }
  } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
});

test("异步加载 FBX 解析器期间关闭预览，不再解析模型或创建贴图 URL", async () => {
  const ui = modelHarness({ delayed: true });
  try {
    await waitFor(() => ui.state.loaderStarted);
    ui.unmount();
    ui.resume();
    for (let i = 0; i < 5; i++) await drain();
    assert.equal(ui.state.parsing, 0);
    assert.equal(ui.state.urls.length, 0);
    assert.equal(ui.state.disposed, 1);
    assert.equal(URL.createObjectURL, ui.original);
  } finally { ui.resume(); ui.unmount(); }
});
