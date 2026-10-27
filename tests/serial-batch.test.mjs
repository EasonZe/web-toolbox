import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalModule } from "./helpers/load-local-module.mjs";
const { runSerialBatch } = loadLocalModule("app/lib/serial-batch.ts");
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("serial batch retains order with at most one active item and isolates item errors", async () => {
  const controller = new AbortController(), events = [];
  let active = 0, peak = 0;
  const result = await runSerialBatch({
    items: [1, 2, 3], signal: controller.signal,
    onStart: (item) => events.push(`start:${item}`),
    async process(item, signal) { assert.equal(signal, controller.signal); active++; peak = Math.max(peak, active); await tick(); active--; if (item === 2) throw new Error("bad image"); return item * 10; },
    onSuccess: (item, value) => events.push(`done:${item}:${value}`),
    onError: (item, error) => events.push(`error:${item}:${error.message}`),
  });
  assert.equal(peak, 1);
  assert.deepEqual(events, ["start:1", "done:1:10", "start:2", "error:2:bad image", "start:3", "done:3:30"]);
  assert.deepEqual({ ...result }, { succeeded: 2, failed: 1 });
});

test("abort waits for the current native operation but drops success and never starts later items", async () => {
  const controller = new AbortController(), pending = deferred(), events = [];
  const result = runSerialBatch({ items: [1, 2], signal: controller.signal,
    process: (item) => { events.push(item); return pending.promise; },
    onStart() {}, onSuccess() { events.push("commit"); }, onError() { events.push("error"); },
  });
  controller.abort();
  let settled = false; result.catch(() => { settled = true; });
  await tick(); assert.equal(settled, false);
  pending.resolve("late");
  await assert.rejects(result, { name: "AbortError" });
  assert.deepEqual(events, [1]);
});

test("aborted tasks suppress late failures and pre-aborted batches never start", async () => {
  const controller = new AbortController(), pending = deferred(), calls = [];
  const options = { items: [1, 2], signal: controller.signal, process: () => pending.promise, onStart: (item) => calls.push(item), onSuccess() { calls.push("success"); }, onError() { calls.push("error"); } };
  const result = runSerialBatch(options); controller.abort(); pending.reject(new Error("late failure"));
  await assert.rejects(result, { name: "AbortError" });
  await assert.rejects(runSerialBatch(options), { name: "AbortError" });
  assert.deepEqual(calls, [1]);
});

test("callback failure is terminal and source list mutation does not change the scheduled snapshot", async () => {
  const sources = [1, 2], starts = [], controller = new AbortController();
  await assert.rejects(runSerialBatch({ items: sources, signal: controller.signal,
    onStart: (item) => { starts.push(item); sources.push(3); }, process: async (item) => item,
    onSuccess: () => { throw new Error("commit failed"); }, onError: () => assert.fail("commit errors are not item errors"),
  }), /commit failed/);
  assert.deepEqual(starts, [1]);
  const seen = [];
  await runSerialBatch({ items: sources, signal: controller.signal, onStart: () => { sources.length = 0; }, process: async (item) => { seen.push(item); }, onSuccess() {}, onError() {} });
  assert.deepEqual(seen, [1, 2, 3]);
});
