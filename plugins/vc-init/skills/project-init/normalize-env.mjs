#!/usr/bin/env node
/**
 * skills/project-init/normalize-env.mjs
 *
 * NORMALIZE + VALIDATE the `.env.<env>` file the operator just filled by hand
 * (VCST-5582 B). `scaffold-env.mjs` writes a commented TEMPLATE and the interview
 * resumes on the operator's "done" — with, until now, NO validation pass at all. So a
 * URL pasted with a trailing `/`, wrapped in quotes, or padded with spaces stayed in
 * the file, and every consumer coped differently:
 *
 *   - verify-access.mjs stripped the trailing slash only IN MEMORY (so the readiness
 *     table looked fine while the file stayed wrong),
 *   - discover-repos.mjs / probe-lib.mjs / qa-fix-routing/ado.mjs / gen-profile.mjs
 *     each normalized ad-hoc or not at all,
 *   - every runtime `${BACK_URL}/api/...` template produced `//api/...`.
 *
 * Net effect: access checks failed for a reason the operator could not see. This script
 * fixes the FILE once, in place, and prints exactly what it changed — so there is one
 * canonical form and every consumer reads the same thing.
 *
 * The rules are NOT restated here: `scaffold-env.mjs` `CATALOG` is the single source of
 * truth for each key's `type` ("url" / "ado-slug") and requiredness (no `def` ⇒ the
 * operator must fill it). Adding a key there is enough; this script picks it up.
 *
 * ALWAYS normalizes (quotes / whitespace / trailing slashes) and reports:
 *   ERROR (exit 1) — a required key still empty (an unfilled placeholder); a "url" key
 *                    with no http(s):// scheme; an "ado-slug" that is still a path.
 *   WARN  (exit 0) — a path component on a URL declared `warnOnPath` (FRONT_URL /
 *                    BACK_URL); almost always a paste mistake, but not fatal.
 *
 * Usage:
 *   node skills/project-init/normalize-env.mjs --env opus_qa            # fix in place
 *   node skills/project-init/normalize-env.mjs --env opus_qa --check    # report only
 *   node skills/project-init/normalize-env.mjs --file ./.env.opus_qa    # explicit path
 *
 * Flags: --env <name> (or --file <path>), --check (never write), --json, --quiet.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { CATALOG } from "./scaffold-env.mjs";
import { resolveOutPath } from "./lib/paths.mjs";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

/** key → meta, from scaffold-env's CATALOG (types + requiredness live there, not here). */
const META = new Map(CATALOG);

/** Strip surrounding whitespace and ONE matching pair of quotes. Applies to every key. */
function unquote(raw) {
  let v = String(raw ?? "").trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Normalize + validate ONE key/value pair against its CATALOG meta. PURE — the whole
 * rule set lives here so it is unit-testable without touching a file.
 *   → { value, errors: string[], warnings: string[] }
 */
export function normalizeValue(key, rawValue, meta = META.get(key) || {}) {
  const errors = [];
  const warnings = [];
  let value = unquote(rawValue);

  // An unfilled placeholder is a HARD failure — the whole point of the "done" gate. Keys
  // shipped with a `def` (ENV_RISK, ADMIN) arrive pre-filled, so an empty one there is
  // also a deletion the operator did not mean.
  if (value === "") {
    if (!meta.optional) errors.push(`${key} is still empty — the placeholder was never filled in`);
    return { value, errors, warnings };
  }

  if (meta.type === "url") {
    // ALL trailing slashes, not just one: `https://host//` is as broken as `https://host/`.
    value = value.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(value)) {
      errors.push(`${key}="${value}" has no http(s):// scheme — write the full URL, e.g. https://host.example.com`);
      return { value, errors, warnings };
    }
    let u;
    try { u = new URL(value); } catch { errors.push(`${key}="${value}" is not a parseable URL`); return { value, errors, warnings }; }
    if (meta.warnOnPath && u.pathname && u.pathname !== "/") {
      warnings.push(`${key}="${value}" carries a path ("${u.pathname}") — this must be the ORIGIN only (scheme + host [+ port]); a pasted deep link breaks every \${${key}}/... template`);
    }
    if (u.search || u.hash) {
      warnings.push(`${key}="${value}" carries a query/fragment — strip it unless it is genuinely part of the base URL`);
    }
  } else if (meta.type === "ado-slug") {
    // Accept a pasted dev.azure.com URL and reduce it to the bare slug; reject anything
    // still path-shaped (a slug with a slash silently breaks every ADO REST path).
    value = value.replace(/^https?:\/\/dev\.azure\.com\//i, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/\/+$/, "");
    if (/[/\\]/.test(value)) {
      errors.push(`${key}="${value}" still looks like a path — use the bare Azure DevOps ${key === "ADO_ORG" ? "organization" : "project"} name`);
    }
  }

  return { value, errors, warnings };
}

/**
 * Normalize a whole dotenv TEXT. Comments, blank lines, ordering, and unknown keys are
 * preserved byte-for-byte; only a known CATALOG key's VALUE can change.
 *   → { text, changes: [{key, from, to}], errors, warnings }
 */
export function normalizeEnvText(text) {
  const changes = [];
  const errors = [];
  const warnings = [];
  const lines = String(text ?? "").split("\n");
  const out = lines.map((line) => {
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(line);
    if (!m) return line; // comment / blank / continuation — untouched
    const [, indent, key, , rawValue] = m;
    if (!META.has(key)) return line; // not ours (an operator's own extra var) — untouched
    const res = normalizeValue(key, rawValue);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
    const before = String(rawValue ?? "");
    if (res.value !== before) changes.push({ key, from: before, to: res.value });
    return `${indent}${key}=${res.value}`;
  });
  return { text: out.join("\n"), changes, errors, warnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = args.file
    ? String(args.file)
    : args.env
      ? resolveOutPath(undefined, `.env.${args.env}`)
      : null;
  if (!path) { console.error("[normalize-env] missing --env <name> (or --file <path>)."); process.exit(1); }
  if (!existsSync(path)) { console.error(`[normalize-env] ${path} does not exist — run scaffold-env.mjs first.`); process.exit(1); }

  const original = readFileSync(path, "utf-8");
  const { text, changes, errors, warnings } = normalizeEnvText(original);
  const wrote = !args.check && text !== original;
  if (wrote) writeFileSync(path, text);

  if (args.json) {
    console.log(JSON.stringify({ path, changes, errors, warnings, wrote, ok: errors.length === 0 }, null, 2));
  } else if (!args.quiet) {
    console.log(`[normalize-env] ${path}`);
    if (changes.length) {
      // Line-by-line, so the operator SEES what was corrected rather than trusting a silent fix.
      for (const c of changes) console.log(`[normalize-env] fixed ${c.key}: "${c.from}" → "${c.to}"`);
      console.log(`[normalize-env] ${wrote ? "rewrote" : "would rewrite (--check)"} ${changes.length} value(s)`);
    } else {
      console.log("[normalize-env] nothing to normalize — all values already canonical");
    }
    for (const w of warnings) console.log(`[normalize-env] WARN  ${w}`);
    for (const e of errors) console.error(`[normalize-env] ERROR ${e}`);
  }

  if (errors.length) {
    if (!args.json && !args.quiet) {
      console.error(`[normalize-env] NOT READY — fix the ${errors.length} error(s) above in ${path}, then re-run.`);
    }
    process.exit(1);
  }
}

// CLI only — the pure helpers above are imported by the unit tests (repo-standard main-guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
