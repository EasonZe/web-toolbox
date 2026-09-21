export type ToolViewMode = "groups" | "table" | "minimal" | "cards";

export const toolViewStorageKey = "eason-toolbox-tool-view";
export const favoritesStorageKey = "eason-toolbox-favorites";
export const toolViewChangeEvent = "eason-toolbox-tool-view-change";
export const openFavoritesEvent = "eason-toolbox-open-favorites";
export const replayToolAnimationEvent = "eason-toolbox-replay-tool-animation";

export function isToolViewMode(value: string | null): value is ToolViewMode {
  return value === "groups" || value === "table" || value === "minimal" || value === "cards";
}

export function parseFavoriteHrefs(value: string | null) {
  if (!value) return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(value);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}
