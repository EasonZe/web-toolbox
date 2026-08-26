import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(
  new URL("../app/api/ip/route.ts", import.meta.url),
  "utf8",
);
const componentSource = await readFile(
  new URL("../app/components/ip-lookup.tsx", import.meta.url),
  "utf8",
);

test("IP API validates input and protects upstream requests", () => {
  assert.match(routeSource, /isIP\(suppliedIp\)/);
  assert.match(routeSource, /cf-connecting-ip/);
  assert.match(routeSource, /x-forwarded-for/);
  assert.match(routeSource, /AbortController/);
  assert.match(routeSource, /setTimeout\(\(\) => controller\.abort\(\), 5000\)/);
  assert.match(routeSource, /Cache-Control": "no-store"/);
  assert.match(routeSource, /ipwho\.is/);
  assert.match(routeSource, /api\.ipquery\.io/);
  assert.match(routeSource, /lookupWithIpWhois\(targetIp\)[\s\S]*lookupWithIpQuery\(targetIp\)/);
  assert.match(routeSource, /Intl\.DisplayNames\(\["zh-CN"\]/);
  assert.match(routeSource, /localizedIpType/);
  assert.match(routeSource, /CHINA_REGION_NAMES/);
  assert.match(routeSource, /CHINA_CITY_NAMES/);
  assert.match(routeSource, /中国移动/);
});

test("IP lookup exposes current and manual queries with refresh and copy support", () => {
  assert.match(componentSource, /window\.setTimeout\(\(\) => void lookup\(\), 0\)/);
  assert.match(componentSource, /\/api\/ip\?ip=/);
  assert.match(componentSource, /navigator\.clipboard\.writeText/);
  assert.match(componentSource, /FiRefreshCw/);
  assert.match(componentSource, /refreshResult/);
  assert.match(componentSource, /刷新查询结果/);
  assert.match(componentSource, /查询我的公网 IP/);
  assert.match(componentSource, /emptyResultLabels\.map/);
});
