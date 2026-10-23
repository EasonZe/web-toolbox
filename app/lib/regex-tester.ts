import { toolLimits } from "./resource-limits";
export type RegexRequest = { pattern: string; flags: string; text: string };
export type RegexMatch = { start: number; end: number; groups: (string | null)[]; named: Record<string, string | null> };
export type RegexResult = { matches: RegexMatch[]; limited: boolean };

// Called only inside a terminable Worker. Never run untrusted regexes on the UI thread.
export function evaluateRegex({ pattern, flags, text }: RegexRequest): RegexResult {
  if (pattern.length > toolLimits.regex.patternChars || text.length > toolLimits.regex.textChars) throw new Error("表达式或文本超过处理范围。");
  if (!/^[gimsuy]*$/.test(flags) || new Set(flags).size !== flags.length) throw new Error("标志只能使用不重复的 g、i、m、s、u、y。");
  const regex = new RegExp(pattern, flags), matches: RegexMatch[] = [];
  const preview = (value: string | undefined) => value === undefined ? null : value.length > 500 ? `${value.slice(0, 500)}…（已截短）` : value;
  for (;;) {
    const match = regex.exec(text);
    if (!match) return { matches, limited: false };
    if (matches.length === toolLimits.regex.matches) return { matches, limited: true };
    matches.push({ start: match.index, end: match.index + match[0].length, groups: match.slice(1, 101).map(preview), named: Object.fromEntries(Object.entries(match.groups ?? {}).slice(0, 100).map(([key, value]) => [key, preview(value)])) });
    if (!regex.global && !regex.sticky) return { matches, limited: false };
    if (!match[0].length) {
      const point = text.codePointAt(regex.lastIndex);
      regex.lastIndex += regex.unicode && point !== undefined && point > 0xffff ? 2 : 1;
    }
  }
}
