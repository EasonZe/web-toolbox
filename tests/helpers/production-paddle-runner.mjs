import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

// Node Worker adapter for emitted CPU-WASM code, not a real browser. Resolve
// only the tool's same-origin ORT module URLs and asset reads to built files.
const root = new URL("../../dist/client/", import.meta.url), origin = "https://ocr-worker.test";
const prefix = `${origin}/ocr/paddle/0.4.2/ort/`;
register(new URL(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(${JSON.stringify(prefix)}) && /^[a-z0-9.-]+\\.mjs$/.test(specifier.slice(${prefix.length}))) return {url:new URL(specifier.slice(${origin.length + 1}), ${JSON.stringify(root.href)}).href,shortCircuit:true};
    return nextResolve(specifier, context);
  }
`)}`), import.meta.url);
globalThis.self = globalThis;
globalThis.location = new URL(`${origin}/_next/static/workers/paddle-ocr.worker.js`);
globalThis.postMessage = (data) => parentPort.postMessage(data);
globalThis.importScripts = () => { throw new Error("Module worker must not import classic scripts"); };
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin || !/^\/ocr\/paddle\/0\.4\.2\/(?:models\/PP-OCRv5_mobile_(?:det|rec)\.tar|ort\/ort-wasm-simd-threaded\.wasm)$/.test(url.pathname)) throw new Error(`Production OCR escaped local asset allowlist: ${url}`);
  parentPort.postMessage({ diagnostic: `local asset ${url.pathname}` });
  return new Response(await readFile(new URL(url.pathname.slice(1), root)), { headers: { "content-type": url.pathname.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" } });
};
// The generated worker is the browser target. Do not accidentally take a
// Node-only fs backend and mistake it for the code shipped to the browser.
globalThis.process = undefined;
try { await import(workerData.entry); await globalThis.onmessage({ data: workerData.image }); }
catch (cause) { parentPort.postMessage({ error: cause.stack || cause.message }); }
