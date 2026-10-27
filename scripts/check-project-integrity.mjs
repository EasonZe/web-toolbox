import { fileURLToPath } from "node:url";
import { auditProject } from "./project-integrity.mjs";

try {
  const result = await auditProject(fileURLToPath(new URL("../", import.meta.url)));
  const failures = [...result.dependencies.failures, ...result.catalog.failures];
  if (failures.length) { console.error(`项目一致性检查未通过：\n${failures.map((message) => `- ${message}`).join("\n")}`); process.exitCode = 1; }
  else console.log(`项目一致性检查通过：${result.dependencies.checked} 项实际依赖、${result.catalog.checked} 个工具、${result.catalog.sitemapUrls} 条站点地图 URL。`);
} catch (error) { console.error(`无法完成项目一致性检查：${error.message}`); process.exitCode = 1; }
