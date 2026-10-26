import assert from "node:assert/strict";
import test from "node:test";
import { allElements, loadHookComponent } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
function mount(path, name) {
  const task = { result: null, error: "", busy: false, reset() { this.result = null; this.error = ""; }, run(work) { this.reset(); this.pending = (async () => { try { this.result = await work(new AbortController().signal); } catch (cause) { this.error = cause.message; } })(); return this.pending; } }, calls = [];
  const component = loadHookComponent(`app/components/${path}.tsx`, name, (id) => {
    if (id === "./local-workbench") return { useLocalTask: () => task, LocalDownload: "download", TaskFeedback: "feedback", useBlobUrl: (blob) => blob ? "blob:generated-preview" : "" };
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./text-utility-parts") return { TextUtilityResult: "text-result" };
    if (id === "./design-color-input") return { DesignColorInput: "color-input" };
    if (id === "../lib/gradient-generator") return { ...loadLocalModule("app/lib/gradient-generator.ts"), exportGradientPng: async (options, width, height) => { calls.push({ options, width, height }); return new Blob(["png"]); } };
    for (const name of ["cidr-calculator", "url-parser", "design-generator-options", "resource-limits"]) if (id === `../lib/${name}`) return loadLocalModule(`app/lib/${name}.ts`);
  });
  return { task, calls, render: () => component.render() };
}
function button(tree, label) { const found = allElements(tree, (n) => n.type === "button" && (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children) === label)[0]; assert.ok(found, label); return found; }
function input(tree, label) { const node = allElements(tree, (n) => n.type === "label" && Array.isArray(n.props.children) && n.props.children[0] === label)[0]; assert.ok(node, label); return allElements(node, (n) => n.type === "input" || n.type === "textarea")[0]; }
function range(tree, label) { const node = allElements(tree, (n) => n.type === "label" && n.props.children?.[0]?.props?.children?.[0] === label)[0]; assert.ok(node, label); return allElements(node, (n) => n.type === "input")[0]; }
const output = (tree) => allElements(tree, (n) => n.type === "text-result")[0]?.props.text;

test("子网 UI 使用当前查询地址，修改输入清理旧结果，非法地址显示错误", () => {
  const app = mount("cidr-calculator", "CidrCalculator"); input(app.render(), "检查某个 IP（可选）").props.onChange({ target: { value: "192.168.2.1" } });
  button(app.render(), "计算子网").props.onClick(); assert.match(output(app.render()), /是否在子网内：否/);
  input(app.render(), "IP 地址 / CIDR").props.onChange({ target: { value: "bad" } }); assert.equal(output(app.render()), undefined);
  button(app.render(), "计算子网").props.onClick(); assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
  button(app.render(), "2001:db8::1/64").props.onClick(); assert.equal(input(app.render(), "检查某个 IP（可选）").props.value, ""); button(app.render(), "计算子网").props.onClick(); assert.match(output(app.render()), /18446744073709551616/);
});
test("URL UI 编辑指定重复参数、显式去追踪和清凭据，源输入修改清除旧结果", () => {
  const app = mount("url-parser", "UrlParser"); input(app.render(), "URL").props.onChange({ target: { value: "https://u:p@example.com/?q=a%20b&tag=one&tag=two&utm_source=app" } });
  button(app.render(), "解析 URL").props.onClick(); assert.match(output(app.render()), /q=a%20b/);
  allElements(app.render(), (n) => n.props?.["aria-label"] === "参数 3 值")[0].props.onChange({ target: { value: "updated" } });
  assert.deepEqual(new URL(output(app.render())).searchParams.getAll("tag"), ["one", "updated"]);
  button(app.render(), "移除常见追踪参数").props.onClick(); assert.equal(new URL(output(app.render())).searchParams.has("utm_source"), false);
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); assert.equal(new URL(output(app.render())).username, "");
  button(app.render(), "添加参数").props.onClick(); assert.equal(allElements(app.render(), (n) => n.type === "fieldset").length, 4);
  input(app.render(), "URL").props.onChange({ target: { value: "javascript:alert(1)" } }); assert.equal(output(app.render()), undefined); button(app.render(), "解析 URL").props.onClick(); assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
});
test("渐变 UI 色标与尺寸传给导出，改动清理 PNG，非法尺寸禁用导出", async () => {
  const app = mount("gradient-generator", "GradientGenerator"); button(app.render(), "添加色标").props.onClick(); assert.equal(allElements(app.render(), (n) => n.type === "fieldset").length, 3);
  allElements(app.render(), (n) => n.type === "color-input" && n.props.label === "色标 2 颜色")[0].props.onChange("#FF0000");
  input(app.render(), "输出宽度（px）").props.onChange({ target: { value: "640" } }); button(app.render(), "生成 PNG").props.onClick(); await app.task.pending;
  assert.equal(app.calls[0].width, 640); assert.equal(app.calls[0].height, 720); assert.equal(app.calls[0].options.stops[1].color, "#FF0000");
  range(app.render(), "角度").props.onChange({ target: { value: "90" } }); assert.equal(app.task.result, null); assert.match(output(app.render()), /linear-gradient\(90deg/);
  input(app.render(), "输出宽度（px）").props.onChange({ target: { value: "0" } }); assert.equal(button(app.render(), "生成 PNG").props.disabled, true); assert.equal(allElements(app.render(), (n) => n.type === "download").length, 0);
});
test("阴影 UI 多层、排序、内阴影和背景按当前设置生成，错误颜色不保留旧输出", () => {
  const app = mount("shadow-generator", "ShadowGenerator"); range(app.render(), "水平偏移").props.onChange({ target: { value: "10" } });
  button(app.render(), "复制为新层").props.onClick(); range(app.render(), "水平偏移").props.onChange({ target: { value: "-20" } });
  allElements(app.render(), (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); button(app.render(), "上移一层").props.onClick(); assert.match(output(app.render()), /box-shadow: inset -20px/);
  assert.equal(button(app.render(), "阴影 1").props["aria-pressed"], true);
  allElements(app.render(), (n) => n.type === "color-input" && n.props.label === "卡片颜色")[0].props.onChange("invalid"); assert.equal(output(app.render()), undefined); assert.equal(allElements(app.render(), (n) => n.props?.role === "alert").length, 1);
});
