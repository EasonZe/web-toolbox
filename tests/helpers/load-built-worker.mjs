import { register } from "node:module";

// Node-only SSR assertions, NOT a workerd emulator. Vinext optionally reads
// Reflect.get(cloudflareWorkers, "tracing"); an empty namespace disables tracing.
// No env/bindings/platform APIs are invented. A future named import such as
// `import { env } from "cloudflare:workers"` must fail at module linking.
const loader = new URL(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return { url: "data:text/javascript,export%20%7B%7D%3B", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
`)}`);
let registered = false;

export async function loadBuiltWorker(url = new URL("../../dist/server/index.js", import.meta.url)) {
  if (!registered) {
    register(loader, import.meta.url);
    registered = true;
  }
  // Keep the caller's URL query intact for existing module-isolation cases.
  return (await import(url.href ?? String(url))).default;
}
