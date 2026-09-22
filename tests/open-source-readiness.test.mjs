import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("repository metadata identifies the MIT-licensed public project", async () => {
  const [manifestText, license, readme, traditionalReadme, englishReadme] = await Promise.all([
    read("package.json"),
    read("LICENSE"),
    read("README.md"),
    read("README.zh-TW.md"),
    read("README.en.md"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "web-toolbox");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.repository.url, "git+https://github.com/EasonZe/web-toolbox.git");
  assert.match(license, /^MIT License/);
  assert.equal(manifest.author.name, "EasonZe");
  assert.equal(manifest.author.email, "qwas_qweasd@163.com");
  assert.match(license, /Copyright \(c\) 2026 EasonZe/);
  assert.match(readme, /github\.com\/EasonZe\/web-toolbox/);
  assert.match(readme, /<h1 align="center">多功能工具箱<\/h1>/);
  assert.match(readme, /public\/images\/toolbox-logo\.png/);
  assert.match(readme, /README\.zh-TW\.md/);
  assert.match(readme, /README\.en\.md/);
  assert.match(readme, /img\.shields\.io\/github\/stars\/EasonZe\/web-toolbox/);
  assert.match(readme, /Node\.js-22%2B/);
  assert.match(readme, /Cloudflare-Workers/);
  assert.match(traditionalReadme, /繁體中文/);
  assert.match(traditionalReadme, /github\/stars\/EasonZe\/web-toolbox/);
  assert.match(englishReadme, /Web Toolbox/);
  assert.match(englishReadme, /github\/stars\/EasonZe\/web-toolbox/);
});

test("community, CI and deployment documentation are present", async () => {
  const [contributing, security, conduct, workflow, architecture, deployment, notices] =
    await Promise.all([
      read("CONTRIBUTING.md"),
      read("SECURITY.md"),
      read("CODE_OF_CONDUCT.md"),
      read(".github/workflows/ci.yml"),
      read("docs/architecture.md"),
      read("docs/deployment.md"),
      read("THIRD_PARTY_NOTICES.md"),
    ]);

  assert.match(contributing, /npm run check/);
  assert.match(security, /qwas_qweasd@163\.com/);
  assert.match(conduct, /行为准则/);
  assert.match(workflow, /npm run check/);
  for (const worker of ["eason-daoyin-api", "eason-bilibili-api", "eason-kuaishou-api"]) {
    assert.match(`${architecture}\n${deployment}`, new RegExp(worker));
  }
  assert.doesNotMatch(`${architecture}\n${deployment}`, /api\.bugpk\.com|api\.qster\.top/);
  assert.match(architecture, /源码位于 `workers\/eason-daoyin-api\/`/);
  assert.match(architecture, /源码位于 `workers\/eason-kuaishou-api\/`/);
  assert.match(notices, /MPL-2\.0/);
  assert.match(notices, /Apache-2\.0/);
});
