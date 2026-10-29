import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CI 在干净安装前启用项目声明的 npm，避免旧版本错误解析安全覆盖项", async () => {
  const manifest = JSON.parse(await read("package.json"));
  const workflow = parse(await read(".github/workflows/ci.yml"));
  const steps = workflow.jobs.quality.steps;
  const setupIndex = steps.findIndex((step) => step.run === `npm install --global ${manifest.packageManager}`);
  const installIndex = steps.findIndex((step) => step.run === "npm ci");
  assert.ok(setupIndex >= 0, "CI 必须使用 packageManager 指定的精确版本");
  assert.ok(installIndex > setupIndex, "必须先启用 npm 再执行 npm ci");
  assert.ok(steps.some((step) => step.run === "npm audit --audit-level=low"), "保留安全审计");
  assert.ok(steps.some((step) => step.run === "npm run check"), "保留完整质量检查");
});

test("本地运行与部署文档统一说明受支持的 npm 安装命令", async () => {
  const { packageManager } = JSON.parse(await read("package.json"));
  for (const path of ["README.md", "README.zh-TW.md", "README.en.md", "docs/deployment.md"]) {
    assert.ok((await read(path)).includes(`npm install --global ${packageManager}`), path);
  }
});
