"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- The ESLint/Vite consumers require a synchronous CommonJS export.
const tinyglobby = require("tinyglobby");

// Only the path-matching API used by ESLint and Vite is supported. Fail loudly
// if a future dependency requests task, stream, stat, or object-mode behavior.
const supportedOptions = new Set([
  "absolute", "braceExpansion", "caseSensitiveMatch", "cwd", "deep", "dot",
  "extglob", "followSymbolicLinks", "fs", "globstar", "ignore",
  "onlyDirectories", "onlyFiles",
]);

function validatePatterns(patterns) {
  const values = typeof patterns === "string" ? [patterns] : patterns;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new TypeError("Glob patterns must be a string or an array of strings.");
  }
  for (const pattern of values) {
    if (pattern.length > 65536) throw new RangeError("Glob pattern is too long.");
    let depth = 0;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === "\\") { i++; continue; }
      if ("{([".includes(pattern[i])) {
        if (++depth > 64) throw new RangeError("Glob pattern nesting exceeds 64 levels.");
      } else if ("})]".includes(pattern[i])) {
        depth = Math.max(0, depth - 1);
      }
    }
  }
  return values;
}

function optionsForGlob(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Glob options must be an object.");
  }
  for (const name of Object.keys(options)) {
    if (!supportedOptions.has(name)) {
      throw new TypeError(`Unsupported fast-glob option: ${name}`);
    }
  }
  if (options.ignore !== undefined) validatePatterns(options.ignore);
  // fast-glob matches the directory itself; tinyglobby normally expands it.
  return { ...options, expandDirectories: false };
}

async function glob(patterns, options) {
  return normalizePaths(await tinyglobby.glob(validatePatterns(patterns), optionsForGlob(options)));
}

function globSync(patterns, options) {
  return normalizePaths(tinyglobby.globSync(validatePatterns(patterns), optionsForGlob(options)));
}

function normalizePaths(paths) {
  // tinyglobby marks directories with a trailing slash; fast-glob doesn't.
  return paths.map((path) => path.length > 1 && path.endsWith("/") && !/^[a-z]:\/$/i.test(path) ? path.slice(0, -1) : path);
}

Object.assign(glob, {
  glob, sync: globSync, globSync,
  escapePath: tinyglobby.escapePath,
  convertPathToPattern: tinyglobby.convertPathToPattern,
  isDynamicPattern(pattern, options) {
    validatePatterns(pattern);
    return tinyglobby.isDynamicPattern(pattern, optionsForGlob(options));
  },
});

module.exports = glob;
