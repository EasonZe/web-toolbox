export type VideoLinkConfig = {
  domains: string[];
  canonicalizeBilibili?: boolean;
};

function isAllowedHost(hostname: string, domains: string[]) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function cleanCandidate(candidate: string) {
  return candidate.replace(/[),.;!?，。；！）》】]+$/g, "");
}

export function extractSource(value: string, config: VideoLinkConfig) {
  const trimmed = value.trim();

  if (
    config.canonicalizeBilibili &&
    /^BV[0-9A-Za-z]{10,20}$/i.test(trimmed)
  ) {
    return `https://www.bilibili.com/video/${trimmed}/`;
  }

  const matches = trimmed.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    try {
      const parsed = new URL(cleanCandidate(match));
      if (!isAllowedHost(parsed.hostname, config.domains)) continue;

      if (config.canonicalizeBilibili) {
        const bvid = parsed.pathname.match(/\/video\/(BV[0-9A-Za-z]{10,20})/i);
        if (bvid) {
          const canonical = new URL(
            `https://www.bilibili.com/video/${bvid[1]}/`,
          );
          const page = parsed.searchParams.get("p");
          if (page && /^\d+$/.test(page) && Number(page) > 1) {
            canonical.searchParams.set("p", page);
          }
          return canonical.toString();
        }
      }

      return parsed.toString();
    } catch {
      // Keep looking for another valid link in the pasted share text.
    }
  }

  return "";
}

export function buildApiUrl(prefix: string, source: string) {
  return /[?#&]/.test(source)
    ? `${prefix}${encodeURIComponent(source)}`
    : `${prefix}${source}`;
}
