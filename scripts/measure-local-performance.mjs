// Reproducible local microbenchmark; not a browser LCP or network-speed test.
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { loadLocalModule } from "../tests/helpers/load-local-module.mjs";

const pdf = loadLocalModule("app/lib/pdf-pages.ts");
const source = await PDFDocument.create();
for (let i = 0; i < 24; i++) source.addPage().drawText(`Page ${i + 1}: local PDF split benchmark`);
const bytes = await source.save();
const choices = Array.from({ length: 24 }, (_, page) => ({ source: 0, page, rotation: 0 }));
const originalLoad = PDFDocument.load;
const samples = [];
let loads = 0;
PDFDocument.load = function (...args) { loads++; return originalLoad.apply(this, args); };
try {
  for (let round = 0; round < 6; round++) {
    loads = 0;
    const start = performance.now();
    if (pdf.splitPdf) await pdf.splitPdf([bytes], choices);
    else for (const choice of choices) await pdf.buildPdf([bytes], [choice]);
    if (round) samples.push(performance.now() - start);
  }
} finally { PDFDocument.load = originalLoad; }

const root = new URL("../dist/client/_next/static/workers/", import.meta.url);
const worker = (await readdir(root)).find((name) => /^local-files\.worker-.*\.js$/.test(name));
const visited = new Set();
async function closure(url) {
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const code = await readFile(url, "utf8");
  for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)(["'`])(\.[^"'`]+\.js)\1/g)) {
    await closure(new URL(match[2], url));
  }
}
await closure(new URL(worker, root));
// Lazy text dependencies count toward a cold JSON/diff task, but PDF/ZIP do not.
const entry = await readFile(new URL(worker, root), "utf8");
for (const match of entry.matchAll(/import\((["'`])([^"'`]*text-inspection[^"'`]+\.js)\1\)/g)) {
  await closure(new URL(match[2], new URL(worker, root)));
}
if (entry.includes("text-inspection-")) assert.ok(visited.size >= 3, "统计必须包含文本引擎及静态依赖，不能只计 Worker 入口");
let raw = 0, gzip = 0;
for (const file of visited) { const data = await readFile(new URL(file)); raw += data.length; gzip += gzipSync(data).length; }
console.log(JSON.stringify({
  node: process.version,
  pdf: { pages: choices.length, inputBytes: bytes.length, warmup: 1, rounds: samples.length, sourceLoadsPerSplit: loads, medianMs: +samples.sort((a, b) => a - b)[2].toFixed(2) },
  textWorkerCold: { files: visited.size, bytes: raw, gzipBytes: gzip },
}, null, 2));
