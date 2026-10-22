import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";

const preview = loadLocalModule("app/lib/unity-preview.ts");

test("中文和 emoji 大文本截断保留 UTF-8 边界，未截断内容不变", async () => {
  const chinese = await preview.readUnityTextPreview(new Blob(["中".repeat(400_000)]));
  assert.equal(chinese.truncated, true);
  assert.equal(chinese.value, "中".repeat(Math.floor(1048576 / 3)));
  for (const prefix of ["", "a", "ab", "abc"]) {
    const value = `${prefix}😀中文后续内容`;
    for (let limit = 1; limit <= 11; limit++) {
      const result = await preview.readUnityTextPreview(new Blob([value]), limit);
      assert.equal(result.truncated, true);
      assert.ok(value.startsWith(result.value));
      assert.doesNotMatch(result.value, /二进制|\uFFFD/);
      assert.ok(new TextEncoder().encode(result.value).length <= limit);
    }
  }
  assert.deepEqual(await preview.readUnityTextPreview(new Blob(["\uFEFF中文😀\n完整内容"])), { value: "中文😀\n完整内容", truncated: false });
});

test("预览仍拒绝非法 UTF-8、真实不完整文件和含 NUL 的文本，允许空文件", async () => {
  for (const blob of [new Blob([new Uint8Array([0xff, 0x61, 0x62])]), new Blob([new Uint8Array([0xf0, 0x9f])]), new Blob(["a\0b"])]) {
    assert.match((await preview.readUnityTextPreview(blob)).value, /二进制资源或非 UTF-8/);
  }
  assert.match((await preview.readUnityTextPreview(new Blob([new Uint8Array([0xff, 0x61, 0x62, 0x63])]), 2)).value, /二进制资源或非 UTF-8/);
  assert.deepEqual(await preview.readUnityTextPreview(new Blob()), { value: "", truncated: false });
});

test("资源与 .meta 下载始终配对，长文件名保留扩展名和完整 Unicode 字符", () => {
  for (const [name, extension] of [[`${"a".repeat(176)}.png`, ".png"], [`${"材质😀".repeat(70)}.mat`, ".mat"], ["image.png", ".png"], [".gitignore", ""], ["without-extension", ""], ["read.me.fbx", ".fbx"]]) {
    const names = preview.unityDownloadNames(`Assets/${name}`);
    assert.equal(names.meta, `${names.resource}.meta`);
    assert.notEqual(names.meta, names.resource);
    assert.ok([...names.resource].length <= 175);
    assert.ok([...names.meta].length <= 180);
    assert.equal(names.resource.endsWith(extension), true);
    assert.doesNotMatch(names.resource, /\uFFFD/);
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(names.resource)), names.resource);
  }
  assert.deepEqual(preview.unityDownloadNames("Assets/猫.png"), { resource: "猫.png", meta: "猫.png.meta" });
});

function assetPreview() {
  return loadHookComponent("app/components/unity-package-preview.tsx", "AssetPreview", (id) => {
    if (id === "next/dynamic") return { default: () => () => null };
    if (id === "./local-workbench") return { useBlobUrl: () => "", LocalDownload() {} };
    if (id === "../lib/unity-preview") return preview;
    if (id === "../lib/local-files") return loadLocalModule("app/lib/local-files.ts");
    if (id.startsWith(".")) return {};
  });
}

test("真实预览组件使用修复后的文本读取和配对下载，卸载后忽略迟到结果", async () => {
  const text = "中".repeat(400_000), blob = new Blob([text]);
  const component = assetPreview();
  component.render({ asset: { guid: "text", path: "Assets/description.txt", kind: "文本", size: blob.size, asset: blob } });
  component.runEffects();
  await new Promise(setImmediate);
  assert.ok(text.startsWith(component.slots[0].value));
  assert.equal(component.slots[0].truncated, true);
  assert.doesNotMatch(component.slots[0].value, /二进制/);
  const cancelled = assetPreview();
  cancelled.render({ asset: { guid: "late", path: "Assets/late.txt", kind: "文本", size: blob.size, asset: blob } });
  cancelled.runEffects()[0]();
  await new Promise(setImmediate);
  assert.equal(cancelled.slots[0], null);
  const name = `${"a".repeat(176)}.png`;
  const view = assetPreview().render({ asset: { guid: "image", path: `Assets/${name}`, kind: "图片", size: 1, asset: new Blob([1]), meta: new Blob(["guid: image"]) } });
  const resource = allElements(view, (item) => item.props?.title === "下载原资源")[0];
  const metadata = allElements(view, (item) => item.props?.title === "下载 .meta")[0];
  assert.ok(resource.props.name.endsWith(".png"));
  assert.equal(metadata.props.name, `${resource.props.name}.meta`);
});
