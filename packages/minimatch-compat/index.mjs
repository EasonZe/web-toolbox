import match from "./index.cjs";

export default match;
export const { minimatch, Minimatch, GLOBSTAR, braceExpand, escape, unescape, filter, defaults, match: matchList, sep } = match;
export { matchList as match };
