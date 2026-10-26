import assert from "node:assert/strict";
import test from "node:test";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
function task() { return { result: null, busy: false, error: "", reset() { this.result = null; this.error = ""; }, setError(error) { this.error = error; }, cancel() {}, run(work) { this.reset(); this.pending = (async () => { try { this.result = await work(new AbortController().signal, () => {}); } catch (cause) { this.error = cause.message; } })(); return this.pending; } }; }
function mount(path, name) {
  const tasks = [task(), task(), task()], calls = []; let cursor = 0;
  const component = loadHookComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => tasks[cursor++], TaskFeedback: "feedback", LocalUpload: "upload", LocalDownload: "download", useBlobUrl: (blob) => blob ? "blob:unit-test" : "" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityResult: "text-result" };
    if (id === "../lib/practical-tool-options") return loadLocalModule("app/lib/practical-tool-options.ts");
    if (id === "../lib/local-files") return { fileSize: (size) => `${size} B` };
    if (id === "../lib/raster-preview") return { readRasterPreview: async (file) => ({ file, width: 4, height: 3, thumbnail: new Blob() }) };
    if (id === "../lib/file-worker-client") return { runFileWorker: async (request) => { calls.push(request); if (request.action === "cron-preview") return { fields: [], text: "preview" }; if (request.action === "file-identify") return []; return { width: 4, height: 3, differences: 0, ratio: 0, blob: new Blob(), preview: new Blob() }; } };
    if (id === "../lib/video-trimming") return { inspectTrimVideo: async () => ({ duration: 20, start: 0, width: 1920, height: 1080, hasAudio: true, canDecode: true }), trimVideo: async (file, options) => { calls.push({ file, options }); return { blob: new Blob(), duration: options.end - options.start, extension: options.format }; } };
  });
  return { tasks, calls, slots: component.slots, render() { cursor = 0; return component.render(); } };
}
function button(tree, label) { const found = allElements(tree, (n) => n.type === "button" && n.props.children === label)[0]; assert.ok(found, label); return found; }
function input(tree, label) { const node = allElements(tree, (n) => n.type === "label" && Array.isArray(n.props.children) && n.props.children[0] === label)[0]; assert.ok(node, label); return allElements(node, (n) => n.type === "input")[0]; }

test("Cron UI 传递当前表达式、时区与数量，修改后不展示旧结果", async () => {
  const app = mount("cron-preview", "CronPreviewTool");
  button(app.render(), "每 5 分钟").props.onClick(); input(app.render(), "IANA 时区").props.onChange({ target: { value: "UTC" } }); input(app.render(), "预览数量").props.onChange({ target: { value: "4" } });
  button(app.render(), "计算后续时间").props.onClick(); await app.tasks[0].pending;
  assert.deepEqual({ ...app.calls[0].options }, { expression: "*/5 * * * *", timezone: "UTC", from: "", count: 4 });
  assert.equal(allElements(app.render(), (n) => n.type === "text-result").length, 1);
  input(app.render(), "Cron 表达式").props.onChange({ target: { value: "invalid" } }); assert.equal(app.tasks[0].result, null);
});

test("文件识别 UI 将批次原文件交给 Worker，不把上传 MIME 当成识别结果", async () => {
  const app = mount("file-identification", "FileIdentificationTool"), files = [new File(["a"], "one.png"), new File(["b"], "two.exe")];
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles(files);
  assert.equal(app.calls[0].action, "file-identify"); assert.equal(app.calls[0].files, files); assert.equal(allElements(app.render(), (n) => n.type === "download").length, 1);
  app.tasks[0].result = null; assert.equal(allElements(app.render(), (n) => n.type === "download").length, 0);
});

test("图片对比 UI 双图参数传递、尺寸不一致禁用、改选项清理旧差异", async () => {
  const app = mount("image-difference", "ImageDifferenceTool"), left = new File(["a"], "a.png"), right = new File(["b"], "b.png");
  app.tasks[0].result = { file: left, width: 4, height: 3, thumbnail: new Blob() }; app.tasks[1].result = { file: right, width: 4, height: 3, thumbnail: new Blob() };
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "range")[0].props.onChange({ target: { value: "0.25" } });
  button(app.render(), "开始对比").props.onClick(); await app.tasks[2].pending;
  assert.equal(app.calls[0].left, left); assert.equal(app.calls[0].right, right); assert.equal(app.calls[0].options.threshold, 0.25);
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); assert.equal(app.tasks[2].result, null);
  app.tasks[1].result.width = 5; assert.equal(button(app.render(), "开始对比").props.disabled, true); assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
});

test("视频 UI 导入时设置时长、定位标记、输出选项与非零起点保护", async () => {
  const app = mount("video-trimmer", "VideoTrimmer"), file = new File(["video"], "a.mp4");
  await allElements(app.render(), (n) => n.type === "upload")[0].props.onFiles([file]);
  assert.equal(input(app.render(), "结束时间（秒）").props.value, 20);
  const ref = allElements(app.render(), (n) => n.type === "video")[0].props.ref; let paused = 0; ref.current = { currentTime: 2.5, pause() { paused++; } };
  button(app.render(), "当前画面设为开始").props.onClick(); input(app.render(), "结束时间（秒）").props.onChange({ target: { value: "8.5" } });
  allElements(app.render(), (n) => n.type === "select" && n.props.value === "mp4")[0].props.onChange({ target: { value: "webm" } });
  button(app.render(), "裁剪并导出").props.onClick(); await app.tasks[1].pending;
  assert.equal(paused, 1); assert.equal(app.calls[0].file, file); assert.equal(app.calls[0].options.start, 2.5); assert.equal(app.calls[0].options.end, 8.5); assert.equal(app.calls[0].options.format, "webm");
  input(app.render(), "结束时间（秒）").props.onChange({ target: { value: "9" } }); assert.equal(app.tasks[1].result, null);
  app.tasks[0].result.info.start = 5; assert.equal(button(app.render(), "当前画面设为开始").props.disabled, true);
});
