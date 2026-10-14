import vm from "node:vm";
import { loadLocalModule } from "./load-local-module.mjs";
// Keep real shared policy/storage implementations when testing isolated UI mocks.
export function runToolTest(code, scope, options) {
  return vm.runInNewContext(code, { ...scope, require(id) {
    if (id.endsWith("/resource-limits")) return loadLocalModule("app/lib/resource-limits.ts");
    if (id.endsWith("/media-blob-target")) return loadLocalModule("app/lib/media-blob-target.ts");
    if (scope.require) return scope.require(id);
    throw new Error(`Unexpected test import: ${id}`);
  } }, options);
}
