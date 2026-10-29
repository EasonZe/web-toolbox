import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import packageJson from "./package.json";
import { readFile } from "node:fs/promises";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function browserOnlyWorkerAssets(): Plugin {
  return {
    name: "toolbox:browser-only-worker-assets", enforce: "pre",
    load: { order: "pre", async handler(id) {
      const path = id.replaceAll("\\", "/").split("?")[0];
      if (this.environment.name === "client" || !["/app/lib/paddle-ocr-client.ts", "/app/lib/id-photo-matte-client.ts"].some((suffix) => path.endsWith(suffix))) return;
      const code = await readFile(path, "utf8");
      // SSR renders controls, not their browser-only tasks. Vite otherwise builds
      // their WASM/worker graphs twice and Wrangler attaches them as server code.
      // Leave the client factories untouched; accidental SSR execution fails.
      const serverCode = code.replace(/new Worker\(new URL\("\.\.\/workers\/(?:paddle-ocr|id-photo-matte)\.worker\.ts", import\.meta\.url\), \{ type: "module" \}\)/g, '(() => { throw new Error("This image task runs only in the browser."); })()');
      return { code: serverCode, map: null };
    } },
    generateBundle: { order: "post", handler(_options, bundle) {
      if (this.environment.name === "client") return;
      // Vite shares its worker cache across environments and can emit client
      // assets again even after the server factories were replaced above.
      // These files have no server entry point; the client output retains them.
      for (const name of Object.keys(bundle)) {
        if (/(?:paddle-ocr\.worker-|id-photo-matte\.worker-|ort-wasm-simd-threaded.*\.wasm$|\/workers\/ort\.wasm\.bundle\.min-)/.test(name)) delete bundle[name];
      }
    } },
  };
}

function workerEnvironment(): Plugin {
  return {
    name: "toolbox:worker-environment",
    enforce: "pre",
    transform(code, id) {
      const path = id.replaceAll("\\", "/").split("?")[0];
      if (path.endsWith("/@paddleocr/paddleocr-js/dist/index.mjs")) {
        // This tool intentionally uses CPU WASM. Avoid pulling unrelated WebGPU /
        // Asyncify binaries above the host's single-asset limit into the build.
        const localCore = code.replaceAll('import("onnxruntime-web")', 'import("onnxruntime-web/wasm")').replace(/function createDefaultWorker\(\) \{[\s\S]*?\n\}/, 'function createDefaultWorker() { throw new Error("Use the toolbox-owned OCR worker."); }');
        return { code: localCore, map: null };
      }
      if (!["/pdfmake/build/pdfmake.js", "/debug/src/browser.js", "/@techstark/opencv-js/dist/opencv.js"].some((suffix) => path.endsWith(suffix))) return;
      // vinext folds bare `typeof window` to "object" in client builds.
      // Preserve pdfmake/debug runtime probes in Workers, which have no Window,
      // without mutating the main client environment or adding a fake Window.
      return { code: code.replace(/\btypeof window\b/g, "typeof globalThis.window"), map: null };
    },
  };
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
};

const buildDateParts = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
}).formatToParts(new Date());
const buildDate = ["year", "month", "day"]
  .map((type) => buildDateParts.find((part) => part.type === type)?.value)
  .join(".");

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    worker: { format: "es" as const, plugins: () => [workerEnvironment()] },
    plugins: [
      browserOnlyWorkerAssets(),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
