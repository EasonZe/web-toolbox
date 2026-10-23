import { evaluateRegex, type RegexRequest } from "../lib/regex-tester";
self.onmessage = ({ data }: MessageEvent<RegexRequest>) => {
  try { self.postMessage({ result: evaluateRegex(data) }); }
  catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "表达式执行失败。" }); }
};
