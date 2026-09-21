import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("repository metadata identifies the MIT-licensed public project", async () => {
  const [manifestText, license, readme] = await Promise.all([
    read("package.json"),
    read("LICENSE"),
    read("README.md"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "web-toolbox");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.repository.url, "git+https://github.com/EasonZe/web-toolbox.git");
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Eason/);
  assert.match(readme, /github\.com\/EasonZe\/web-toolbox/);
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
  assert.match(security, /erk21635@gmail\.com/);
  assert.match(conduct, /行为准则/);
  assert.match(workflow, /npm run check/);
  for (const worker of ["eason-douyin-api", "eason-bilibili-api", "eason-kuaishou-api"]) {
    assert.match(`${architecture}\n${deployment}`, new RegExp(worker));
  }
  assert.match(notices, /MPL-2\.0/);
  assert.match(notices, /Apache-2\.0/);
});
