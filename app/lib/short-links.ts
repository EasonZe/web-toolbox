/** Only accept links belonging to the deployment that answered the request. */
export function isShortLinkUrl(value: unknown, origin: string) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password &&
      /^\/s\/[A-Za-z0-9_-]{8,32}$/.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}
