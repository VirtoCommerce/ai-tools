#!/usr/bin/env node
/**
 * snippet.mjs — print a browser measurement snippet, ready to paste into `browser_evaluate`.
 *
 *   node snippet.mjs <name> [arg …]
 *   node snippet.mjs --list
 *
 * The visual lane measures a page by evaluating read-only JavaScript in it. The generator for each snippet is a
 * function (or a constant) exported by `measure-layout.mjs` / `verify-design-spec.mjs`; this prints what the named
 * export returns or holds, on stdout and nothing else, so its output is the string to evaluate. Nothing here runs a
 * browser.
 *
 * <name> is one of:
 *   - a function whose name ends in `Snippet` (`spacingAuditSnippet`, `designTokenAuditSnippet`, …);
 *   - a string constant (`COLOR_MATH_JS`, `EFFECTIVE_BG_JS`, `FOUC_SNIPPET`, `focusIndicatorAudit`);
 *   - `LAYOUT_SNIPPETS.<key>` (`LAYOUT_SNIPPETS.overflowAudit`, …).
 *
 * An <arg> that starts with `[`, `{` or `"` is JSON (`'["a","b"]'`, `'{"surface":"cart"}'`, `'".vc-button"'`); any other
 * arg is the plain string it is — a `404` or a `null` stays a string, because every snippet parameter is a string, an
 * array or an object, and a coerced number would be interpolated into a selector that matches nothing. `@<file>` reads
 * JSON from a file — that is how a `DesignSpec` (`design-spec-extract.mjs` output) reaches `designTokenAuditSnippet`
 * and its siblings. Args are positional, in the function's own order; leave trailing ones out to take its defaults.
 *
 * Exit: 0 printed; 2 unknown or missing name, or fewer arguments than the snippet needs (stderr says which); 1 the
 * snippet could not be built.
 * Generated from the repository's TypeScript: this file is hand-written, the two modules it imports are not.
 */
import { readFileSync } from "node:fs";
import * as measure from "./measure-layout.mjs";
import * as verify from "./verify-design-spec.mjs";

/** name → { call } for a snippet built from arguments, { text } for one that is a constant. */
function catalog() {
  const entries = new Map();
  for (const mod of [measure, verify]) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function" && /Snippet$/.test(name)) entries.set(name, { call: value });
      else if (typeof value === "string") entries.set(name, { text: value });
    }
  }
  for (const [key, value] of Object.entries(measure.LAYOUT_SNIPPETS ?? {})) {
    if (typeof value === "string") entries.set(`LAYOUT_SNIPPETS.${key}`, { text: value });
  }
  return entries;
}

function parseArg(raw) {
  if (raw.startsWith("@")) return JSON.parse(readFileSync(raw.slice(1), "utf8"));
  return /^\s*[[{"]/.test(raw) ? JSON.parse(raw) : raw;
}

function main(argv) {
  const entries = catalog();
  const names = [...entries.keys()].sort();
  if (argv[0] === "--list") {
    process.stdout.write(names.join("\n") + "\n");
    return 0;
  }
  const [name, ...rest] = argv;
  const entry = name ? entries.get(name) : undefined;
  if (!entry) {
    console.error(`snippet: ${name ? `unknown snippet "${name}"` : "no snippet named"} — the names are:\n  ${names.join("\n  ")}`);
    return 2;
  }
  // `fn.length` counts the parameters before the first default: the ones the snippet cannot do without. A missing one
  // would print `querySelectorAll(undefined)`, and the classifier would then pass on 0 elements.
  if (entry.call && rest.length < entry.call.length) {
    console.error(`snippet: ${name} needs ${entry.call.length} argument${entry.call.length === 1 ? "" : "s"}, got ${rest.length}`);
    return 2;
  }
  let text;
  try {
    text = entry.call ? entry.call(...rest.map(parseArg)) : entry.text;
  } catch (e) {
    console.error(`snippet: ${name} could not be built from those arguments — ${e?.message ?? e}`);
    return 1;
  }
  process.stdout.write(text);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
