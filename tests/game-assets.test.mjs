import assert from "node:assert/strict";
import test from "node:test";
import { packTar } from "modern-tar";
import { gzipSync, unzipSync } from "fflate";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const unity = loadLocalModule("app/lib/unity-package.ts");


const guidA = "a".repeat(32), guidB = "b".repeat(32);
const text = (value) => new TextEncoder().encode(value);
async function packageFile(entries) {
  const tar = await packTar(entries.map(([name, body, type = "file"]) => ({ header: { name, type, size: typeof body === "string" ? text(body).length : body.length }, body })));
  return new File([gzipSync(tar)], "sample.unitypackage");
}
test("Unity 包乱序条目还原中文目录、图片原字节和 GUID，导出保留 .meta", async () => {
  const png = createCanvas(3, 2).toBuffer("image/png");
  const file = await packageFile([
    [`${guidA}/asset`, png], [`${guidB}/asset.meta`, "folderAsset: yes\nguid: bbb\n"],
    [`${guidA}/pathname`, "Assets/图片/猫.png\n"], [`${guidB}/pathname`, "Assets/图片"],
    [`${guidA}/asset.meta`, `guid: ${guidA}\n`], [`${guidA}/preview.png`, png],
  ]);
  const result = await unity.readUnityPackage(file);
  assert.equal(result.assets.length, 2);
  const image = result.assets.find((asset) => asset.kind === "图片");
  assert.equal(image.guid, guidA);
  assert.equal(image.path, "Assets/图片/猫.png");
  assert.deepEqual(new Uint8Array(await image.asset.arrayBuffer()), new Uint8Array(png));
  const exported = unzipSync(new Uint8Array(await (await unity.exportUnityAssets(result.assets, true)).arrayBuffer()));
  assert.deepEqual(exported["Assets/图片/猫.png"], new Uint8Array(png));
  assert.equal(new TextDecoder().decode(exported["Assets/图片/猫.png.meta"]), `guid: ${guidA}\n`);
  assert.ok(exported["Assets/图片.meta"]);
  const plain = unzipSync(new Uint8Array(await (await unity.exportUnityAssets([image], false)).arrayBuffer()));
  assert.deepEqual(Object.keys(plain), ["Assets/图片/猫.png"]);
});
test("Unity 包拒绝非 gzip、运行时包、损坏 TAR 校验和与截断数据", async () => {
  await assert.rejects(unity.readUnityPackage(new Blob(["UnityFS\0"])), /AssetBundle/);
  await assert.rejects(unity.readUnityPackage(new Blob(["not a package"])), /有效/);
  const tar = await packTar([{ header: { name: `${guidA}/asset`, size: 4 }, body: "test" }]);
  tar[0] ^= 1;
  await assert.rejects(unity.readUnityPackage(new Blob([gzipSync(tar)])), /checksum|校验/i);
  const file = await packageFile([[`${guidA}/pathname`, "Assets/a.txt"], [`${guidA}/asset`, "hello"]]);
  await assert.rejects(unity.readUnityPackage(file.slice(0, file.size - 12)));
});
test("Unity VPM 安装器目录缺少 folderAsset 标记仍能预览和完整导出", async () => {
  const directory = "Assets/com.anatawa12.vpm-package-auto-installer";
  // Match the public VPAI folder metadata: format, GUID and creation time only.
  const folderMeta = `fileFormatVersion: 2\nguid: ${guidA}\ntimeCreated: 1652316538\n`;
  const fileMeta = `fileFormatVersion: 2\nguid: ${guidB}\nPluginImporter:\n  externalObjects: {}\n`;
  const file = await packageFile([
    [`${guidA}/pathname`, directory], [`${guidA}/asset.meta`, folderMeta],
    [`${guidB}/pathname`, `${directory}/installer.dll`], [`${guidB}/asset`, new Uint8Array([77, 90, 0, 1])], [`${guidB}/asset.meta`, fileMeta],
  ]);
  const { assets } = await unity.readUnityPackage(file);
  assert.equal(assets.find((asset) => asset.path === directory).kind, "文件夹");
  const zip = unzipSync(new Uint8Array(await (await unity.exportUnityAssets(assets, true)).arrayBuffer()));
  assert.ok(zip[`${directory}/`]);
  assert.equal(new TextDecoder().decode(zip[`${directory}.meta`]), folderMeta);
  assert.deepEqual([...zip[`${directory}/installer.dll`]], [77, 90, 0, 1]);
  assert.equal(new TextDecoder().decode(zip[`${directory}/installer.dll.meta`]), fileMeta);
});
test("Unity 兼容旧版空目录、无元数据父目录与零字节目录条目", async () => {
  for (const [meta, body, withChild] of [
    [`fileFormatVersion: 2\r\nguid: ${guidA}\r\nDefaultImporter:\r\n  userData: \r\n`, undefined, false],
    [undefined, undefined, true],
    [undefined, new Uint8Array(), true],
    ["folderAsset: true # directory\n", undefined, false],
  ]) {
    const entries = [[`${guidA}/pathname`, "Assets/folder.with.dots"]];
    if (meta !== undefined) entries.push([`${guidA}/asset.meta`, meta]);
    if (body !== undefined) entries.push([`${guidA}/asset`, body]);
    if (withChild) entries.push([`${guidB}/pathname`, "Assets/folder.with.dots/a.txt"], [`${guidB}/asset`, "data"]);
    const { assets } = await unity.readUnityPackage(await packageFile(entries));
    assert.equal(assets.find((asset) => asset.guid === guidA).kind, "文件夹");
  }
});
test("Unity 缺失真实文件仍报错，不把文件导入器、显式文件或路径冲突当目录", async () => {
  for (const meta of [
    `fileFormatVersion: 2\nguid: ${guidA}\nMonoImporter:\n`,
    `fileFormatVersion: 2\nguid: ${guidA}\nfolderAsset: no\n`,
    `fileFormatVersion: 2\nguid: ${guidB}\n`,
  ]) await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/a.cs"], [`${guidA}/asset.meta`, meta]])), /缺少文件/);
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/file"], [`${guidA}/asset`, "not a directory"], [`${guidB}/pathname`, "Assets/file/child.txt"], [`${guidB}/asset`, "data"]])), /路径冲突/);
  const { assets } = await unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/empty.txt"], [`${guidA}/asset`, new Uint8Array()]]));
  assert.equal(assets[0].kind, "文本");
  assert.equal(assets[0].asset.size, 0);
});
test("Unity 包拒绝路径穿越、重复条目、重复路径与缺失资源内容", async () => {
  for (const path of ["../escape.txt", "/root.txt", "C:/file", "Assets/../a", "Assets\\a", "Assets/CON.txt", "Assets/a "]) assert.throws(() => unity.unityPath(path), /不安全/);
  assert.equal(unity.unityPath("Assets/你好.txt"), "Assets/你好.txt");
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/a.txt"], [`${guidA}/pathname`, "Assets/b.txt"]])), /重复/);
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "../x"], [`${guidA}/asset`, "x"]])), /不安全/);
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/a.txt"]])), /缺少文件/);
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/asset`, "x"]])), /pathname/);
  await assert.rejects(unity.readUnityPackage(await packageFile([[`${guidA}/pathname`, "Assets/a.txt"], [`${guidA}/asset`, "x"], [`${guidB}/pathname`, "Assets/A.txt"], [`${guidB}/asset`, "y"]])), /路径重复/);
  const link = await packTar([{ header: { name: `${guidA}/asset`, type: "symlink", linkname: "/etc/passwd", size: 0 } }]);
  await assert.rejects(unity.readUnityPackage(new Blob([gzipSync(link)])), /链接/);
});

test("资源 Worker 保留 Unity 读取与提取，拒绝已移除或未知的操作", async () => {
  const messages = [], scope = { exports: {}, self: { postMessage(message) { messages.push(message); } }, require(name) {
    assert.equal(name, "../lib/unity-package");
    return unity;
  } };
  const source = readFileSync(new URL("../app/workers/game-assets.worker.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  const file = await packageFile([[`${guidA}/pathname`, "Assets/readme.txt"], [`${guidA}/asset`, "hello"]]);
  await scope.self.onmessage({ data: { action: "unity-read", file } });
  const parsed = messages.at(-1).result;
  assert.equal(parsed.assets[0].path, "Assets/readme.txt");
  await scope.self.onmessage({ data: { action: "unity-export", assets: parsed.assets, includeMeta: false } });
  assert.ok(unzipSync(new Uint8Array(await messages.at(-1).result.arrayBuffer()))["Assets/readme.txt"]);
  for (const action of ["sprite-pack", "sprite-slice", "unknown"]) {
    await scope.self.onmessage({ data: { action } });
    assert.match(messages.at(-1).error, /不支持/);
  }
});
