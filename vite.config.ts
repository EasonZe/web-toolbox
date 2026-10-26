import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import packageJson from "./package.json";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function workerEnvironment(): Plugin {
  return {
    name: "toolbox:worker-environment",
    enforce: "pre",
    transform(code, id) {
      const path = id.replaceAll("\\", "/").split("?")[0];
      if (!["/pdfmake/build/pdfmake.js", "/debug/src/browser.js"].some((suffix) => path.endsWith(suffix))) return;
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
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
