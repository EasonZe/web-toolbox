"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Legacy ESLint plugins require a callable CommonJS entry.
const engine = require("minimatch-engine");

// Old consumers call require("minimatch") directly; current consumers read its
// named functions and Minimatch class. All matching delegates to the patched
// upstream engine; no old parser or regular-expression implementation is kept.
function compatible(api) {
  const matcher = typeof api === "function" ? api : api.minimatch;
  const match = Object.assign(function minimatch(path, pattern, options) {
    return matcher(path, pattern, options);
  }, api);
  match.minimatch = match;
  match.defaults = (options) => compatible(api.defaults(options));
  return match;
}

module.exports = compatible(engine);
