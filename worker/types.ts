export type FetcherBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};
