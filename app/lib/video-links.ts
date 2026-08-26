export type VideoLinkConfig = {
  domains: string[];
  canonicalizeBilibili?: boolean;
  canonicalizeYoutube?: boolean;
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

const YOUTUBE_VIDEO_ID_PATTERN = /^[0-9A-Za-z_-]{11}$/;

export function extractYoutubeVideoId(value: string) {
  const trimmed = value.trim();
  if (YOUTUBE_VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  let candidate = "";

  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  ) {
    if (parsed.pathname === "/watch") {
      candidate = parsed.searchParams.get("v") || "";
    } else {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live", "v"].includes(segments[0])) {
        candidate = segments[1] || "";
      }
    }
  }

  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
}

function canonicalizeYoutube(value: string) {
  const videoId = extractYoutubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

export function extractSource(value: string, config: VideoLinkConfig) {
  const trimmed = value.trim();

  if (
    config.canonicalizeBilibili &&
    /^BV[0-9A-Za-z]{10,20}$/i.test(trimmed)
  ) {
    return `https://www.bilibili.com/video/${trimmed}/`;
  }

  if (config.canonicalizeYoutube) {
    const canonical = canonicalizeYoutube(trimmed);
    if (canonical) return canonical;
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

      if (config.canonicalizeYoutube) {
        const canonical = canonicalizeYoutube(parsed.toString());
        if (canonical) return canonical;
        continue;
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
