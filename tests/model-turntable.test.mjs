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

test("3D模型文件校验、分辨率与导出文件名正确", async () => {
  const { modelExtension, validateModelFile, parseModelResolution, turntableOutputName } = await load("../app/lib/model-turntable.ts");
  assert.equal(modelExtension("scene.GLB"), "glb");
  assert.equal(modelExtension("mesh.usdz"), "");
  assert.equal(validateModelFile({ name: "model.obj", size: 2048 }), "");
  assert.match(validateModelFile({ name: "model.zip", size: 2048 }), /仅支持/);
  assert.deepEqual(parseModelResolution("1280x720"), { width: 1280, height: 720 });
  assert.throws(() => parseModelResolution("9999x720"), /超出范围/);
  assert.equal(turntableOutputName("demo.glb", "video/webm;codecs=vp9"), "demo-turntable.webm");
  assert.equal(turntableOutputName("demo.fbx", "video/mp4"), "demo-turntable.mp4");
});

test("3D工具使用 Three.js 成熟加载器并在本地导出动画", async () => {
  const source = await read("../app/components/model-turntable.tsx");
  for (const value of ["three/addons/controls/OrbitControls.js", "GLTFLoader", "OBJLoader", "STLLoader", "FBXLoader", "captureStream", "MediaRecorder", "fixWebmDuration", "toBlob", "requestFullscreen"]) assert.ok(source.includes(value), value);
  for (const value of ["GLB", "GLTF", "OBJ", "STL", "FBX", "360°转台动画", "导出PNG截图", "文件只在本地处理"]) assert.ok(source.includes(value), value);
  const home = await read("../app/components/tool-search-grid.tsx");
  assert.ok(home.includes("/model-turntable"));
  assert.ok(home.includes("TbRotate360"));
});
