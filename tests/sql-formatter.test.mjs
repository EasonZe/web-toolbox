import assert from "node:assert/strict";
import test from "node:test";
import { format } from "sql-formatter";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
import { workerClientHarness } from "./helpers/worker-client-harness.mjs";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
const { formatSql } = loadLocalModule("app/lib/sql-format.ts");
const { sqlDialects } = loadLocalModule("app/lib/sql-format-options.ts");
const options = { dialect: "sql", indent: 2, keywordCase: "upper" };

test("SQL 使用真实引擎格式化并保留中文标识符、字符串、注释及多语句", () => {
  const input = "select \"名称\", 'select <script>alert(1)</script> 中文' as label from tools where id = 7; -- 原始注释\nselect 2;";
  const result = formatSql(input, options);
  assert.equal(result.output, format(input, { language: "sql", tabWidth: 2, keywordCase: "upper", linesBetweenQueries: 1 }));
  assert.equal(result.changed, true);
  for (const marker of ['"名称"', "'select <script>alert(1)</script> 中文'", "-- 原始注释"]) assert.ok(result.output.includes(marker), marker);
  assert.equal(formatSql(result.output, options).changed, false);
});
test("SQL 所有公开方言可处理简单查询，缩进与大小写选项确实生效", () => {
  assert.equal(sqlDialects.length, 20);
  for (const [dialect] of sqlDialects) assert.match(formatSql("select a from tools;", { ...options, dialect }).output, /SELECT\n  a/);
  assert.match(formatSql("select a from tools;", { ...options, indent: 4 }).output, /SELECT\n    a/);
  assert.match(formatSql("SELECT a FROM tools;", { ...options, keywordCase: "lower" }).output, /^select/);
  assert.match(formatSql("sElEcT a FrOm tools;", { ...options, keywordCase: "preserve" }).output, /^sElEcT/);
});
test("SQL 方言特有引号和参数不会被替换或执行", () => {
  const samples = [
    ["mysql", "select `MixedCase` from `table` where id = ?;", "?"],
    ["postgresql", "select $$中文 'quoted'$$, $1, data::jsonb from t;", "$$中文 'quoted'$$"],
    ["transactsql", "select [MixedCase] from [table] where id = @id;", "@id"],
    ["sqlite", "select :id, \"MixedCase\" from t;", ":id"],
  ];
  for (const [dialect, source, marker] of samples) assert.ok(formatSql(source, { ...options, dialect }).output.includes(marker));
});
test("SQL 不冒充完整语法校验，保留格式化禁用区，不隐式替换输入", () => {
  // The upstream formatter intentionally does not inspect disabled regions.
  const source = "/* sql-formatter-disable */\nNOT DATABASE SQL 🙂\n/* sql-formatter-enable */\nselect 1;";
  assert.ok(formatSql(source, options).output.includes("NOT DATABASE SQL 🙂"));
  assert.match(formatSql("select absent_column from absent_table;", options).output, /absent_column/);
});
test("SQL 解析失败保留引擎行列和有限上下文，修正方言可重试", () => {
  assert.throws(() => formatSql("select (", options), /格式化失败.*line 1 column 9/);
  assert.throws(() => formatSql("select @id from t;", options), /方言/);
  assert.ok(formatSql("select @id from t;", { ...options, dialect: "transactsql" }).output.includes("@id"));
  try { formatSql(`select (\n${"x".repeat(5000)}`, options); assert.fail("must reject"); }
  catch (cause) { assert.ok(cause.message.length < 2200); }
});
test("SQL 拒绝空文本、超额输入及无效参数，不截断到看似成功", () => {
  for (const value of ["", " \n", null, 4]) assert.throws(() => formatSql(value, options), /请输入/);
  assert.throws(() => formatSql("a".repeat(5_000_001), options), /500 万/);
  for (const bad of [null, { ...options, dialect: "__proto__" }, { ...options, indent: 3 }, { ...options, keywordCase: "title" }]) assert.throws(() => formatSql("select 1;", bad), /参数无效/);
});
test("SQL Worker 成功、取消、30秒超时均终止实例，迟到响应无效", async () => {
  const client = workerClientHarness("app/lib/file-worker-client.ts");
  const run = (signal) => client.exports.runFileWorker({ action: "sql-format", text: "select 1;", options }, signal);
  const done = run(new AbortController().signal), first = client.workers.at(-1);
  first.emit({ result: { output: "SELECT\n  1;", changed: true } }); assert.equal((await done).changed, true); assert.equal(first.terminations, 1); assert.equal(client.timers.size, 0);
  const controller = new AbortController(), canceled = run(controller.signal), second = client.workers.at(-1), late = second.onmessage;
  controller.abort(); await assert.rejects(canceled, /abort/i); late({ data: { result: "late" } }); assert.equal(second.terminations, 1); assert.equal(client.timers.size, 0);
  const timeout = run(new AbortController().signal), last = client.workers.at(-1);
  const timer = [...client.timers.values()][0]; assert.equal(timer.delay, 30000); timer.callback(); await assert.rejects(timeout, /超时/); assert.equal(last.terminations, 1); assert.equal(client.timers.size, 0);
});
test("SQL 实际任务Hook卸载取消后台解析，不接受迟到结果", async () => {
  const client = workerClientHarness("app/lib/file-worker-client.ts");
  const app = mountComponent("app/components/local-workbench.tsx", "useLocalTask", (id) => id === "./file-drop-zone" ? { FileDropZone: "upload" } : id === "../lib/local-files" ? { fileSize: String } : undefined);
  const task = app.render(); app.flushEffects();
  const pending = task.run((signal) => client.exports.runFileWorker({ action: "sql-format", text: "select 1;", options }, signal)), worker = client.workers[0], late = worker.onmessage;
  app.unmount(); assert.equal(await pending, undefined); assert.equal(worker.terminations, 1); assert.equal(client.timers.size, 0); late({ data: { result: { output: "late" } } }); assert.equal(worker.terminations, 1);
});

const content = (node) => node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(content).join("") : content(node.props?.children);
test("SQL 页面改参、改文和清空会取消旧任务并清除过期结果", async () => {
  let task, resolveResult; const calls = [];
  task = { result: null, busy: false, reset() { this.controller?.abort(); this.result = null; this.busy = false; }, async run(work) { this.reset(); const controller = this.controller = new AbortController(); this.busy = true; const result = await work(controller.signal); if (!controller.signal.aborted) { this.result = result; this.busy = false; } } };
  const app = mountComponent("app/components/sql-formatter.tsx", "SqlFormatter", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask: () => task, TaskFeedback: "feedback" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "input-editor", TextUtilityResult: "result-editor" };
    if (id === "../lib/resource-limits") return loadLocalModule("app/lib/resource-limits.ts");
    if (id === "../lib/sql-format-options") return { sqlDialects };
    if (id === "../lib/file-worker-client") return { runFileWorker(request, signal) { calls.push({ request, signal }); return new Promise((resolve) => { resolveResult = resolve; }); } };
  });
  const button = (label) => allElements(app.render(), (n) => n.type === "button" && content(n) === label)[0];
  const pending = button("格式化 SQL").props.onClick();
  const dialect = allElements(app.render(), (n) => n.type === "select" && n.props.value === "sql")[0]; dialect.props.onChange({ target: { value: "mysql" } });
  assert.equal(calls[0].signal.aborted, true); resolveResult({ output: "old", changed: true }); await pending; assert.equal(task.result, null);
  const next = button("格式化 SQL").props.onClick(); assert.equal(calls[1].request.options.dialect, "mysql");
  allElements(app.render(), (n) => n.type === "input-editor")[0].props.onChange("select 2;"); assert.equal(calls[1].signal.aborted, true); resolveResult({ output: "old2", changed: true }); await next;
  const final = button("格式化 SQL").props.onClick(); resolveResult({ output: "SELECT\n  2;", changed: true }); await final; assert.equal(task.result.output, "SELECT\n  2;");
  button("清空").props.onClick(); assert.equal(task.result, null); assert.equal(button("格式化 SQL").props.disabled, true); app.unmount();
});

test("SQL 清空卸载实际文本输入与任务Hook，迟到文件读取不回写，新导入仍可使用", async () => {
  const workbenchResolve = (id) => id === "./file-drop-zone" ? { FileDropZone: "drop" } : id === "../lib/local-files" ? { fileSize: String } : undefined;
  const formatting = mountComponent("app/components/local-workbench.tsx", "useLocalTask", workbenchResolve);
  const tasks = [], reads = [];
  const parent = mountComponent("app/components/sql-formatter.tsx", "SqlFormatter", (id) => {
    if (id === "./utility-shell") return { UtilityShell: "shell" };
    if (id === "./local-workbench") return { useLocalTask() { const task = formatting.render(); formatting.flushEffects(); return task; }, TaskFeedback: "feedback" };
    if (id === "./text-utility-parts") return { TextUtilityInput: "input-editor", TextUtilityResult: "result-editor" };
    if (id === "../lib/resource-limits") return loadLocalModule("app/lib/resource-limits.ts");
    if (id === "../lib/sql-format-options") return { sqlDialects };
    if (id === "../lib/file-worker-client") return { runFileWorker() { assert.fail("本回归只导入文件，不启动格式化"); } };
  });
  function editor() { return allElements(parent.render(), (node) => node.type === "input-editor")[0]; }
  function mountInput(node) {
    const uploadTask = mountComponent("app/components/local-workbench.tsx", "useLocalTask", workbenchResolve);
    const input = mountComponent("app/components/text-utility-parts.tsx", "TextUtilityInput", (id) => {
      if (id === "../lib/local-files") return { readTextFile: () => new Promise((resolve) => reads.push(resolve)) };
      if (id === "./local-workbench") return { useLocalTask() { const task = uploadTask.render(); uploadTask.flushEffects(); tasks.push(task); return task; }, LocalUpload: "upload", TaskFeedback: "feedback" };
    });
    const tree = input.render(node.props); input.flushEffects();
    return { upload: allElements(tree, (element) => element.type === "upload")[0], unmount() { input.unmount(); uploadTask.unmount(); } };
  }
  const before = editor(), oldInput = mountInput(before);
  const oldImport = oldInput.upload.props.onFiles([new File(["select old;"], "old.sql")]);
  const oldController = tasks.at(-1);
  assert.equal(oldController.result, null);
  allElements(parent.render(), (node) => node.type === "button" && content(node) === "清空")[0].props.onClick();
  const cleared = editor(); assert.equal(cleared.props.text, ""); assert.notEqual(cleared.key, before.key);
  // React unmounts the old keyed child and its nested task hook before mounting its replacement.
  oldInput.unmount(); await oldImport;
  reads[0]("select old;"); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(editor().props.text, "");
  assert.equal(allElements(parent.render(), (node) => node.type === "button" && content(node) === "格式化 SQL")[0].props.disabled, true);
  const freshInput = mountInput(editor()), freshImport = freshInput.upload.props.onFiles([new File(["select fresh;"], "fresh.sql")]);
  reads[1]("select fresh;"); await freshImport;
  assert.equal(editor().props.text, "select fresh;");
  freshInput.unmount(); parent.unmount(); formatting.unmount();
});
