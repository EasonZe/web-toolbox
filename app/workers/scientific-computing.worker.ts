import { calculateScience } from "../lib/scientific-computing";
import type { ScienceRequest, ScienceWorkerResponse } from "../lib/scientific-types";

self.onmessage = ({ data }: MessageEvent<ScienceRequest>) => {
  let response: ScienceWorkerResponse;
  try { response = { result: calculateScience(data) }; }
  catch (error) { response = { error: error instanceof Error ? error.message : "计算失败，请检查输入。" }; }
  self.postMessage(response);
};
