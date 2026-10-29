import { parentPort, workerData } from "node:worker_threads";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";

// Native Node Canvas/Worker platform adapter for the exact emitted browser module.
// This exercises deployed JavaScript, not browser layout, browser codecs or device memory.
const canvases = [], bitmaps = [];
globalThis.ImageData = ImageData;
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    const canvas = createCanvas(width, height);
    canvas.convertToBlob = async ({ type }) => new Blob([canvas.toBuffer(type)], { type });
    canvases.push(canvas); return canvas;
  }
};
globalThis.createImageBitmap = async (file) => {
  const image = await loadImage(Buffer.from(await file.arrayBuffer())), state = { closes: 0 };
  image.close = () => { state.closes++; }; bitmaps.push(state); return image;
};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "desktop" } });
globalThis.fetch = () => { throw new Error("Photo effects must not request network resources"); };
globalThis.self = globalThis;
globalThis.postMessage = (message) => parentPort.postMessage({ ...message, adapterResources: { canvases: canvases.length, bitmaps: bitmaps.length, released: canvases.every((canvas) => canvas.width === 1 && canvas.height === 1) && bitmaps.every((bitmap) => bitmap.closes === 1) } });

try {
  await import(workerData.entry);
  parentPort.on("message", async ({ request, filename, device }) => {
    if (device) Object.defineProperty(globalThis, "navigator", { configurable: true, value: device });
    // Node currently clones File as Blob, unlike a browser module worker. Restore only
    // name/type metadata; all original bytes still cross the real structured-clone channel.
    if (request?.file instanceof Blob && typeof filename === "string") request.file = new File([request.file], filename, { type: request.file.type });
    try { await globalThis.onmessage({ data: request }); }
    catch (cause) { parentPort.postMessage({ fatal: cause.stack ?? cause.message }); }
  });
  parentPort.postMessage({ ready: true });
} catch (cause) { parentPort.postMessage({ fatal: cause.stack ?? cause.message }); }
