export type FetcherBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type D1PreparedStatementBinding = {
  bind(...values: unknown[]): D1PreparedStatementBinding;
  first<T = Record<string, unknown>>(): Promise<T | null>;
};

export type D1DatabaseBinding = {
  prepare(query: string): D1PreparedStatementBinding;
};
