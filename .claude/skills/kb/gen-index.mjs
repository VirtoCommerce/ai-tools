#!/usr/bin/env node
/**
 * skills/kb/gen-index.mjs — the generated retrieval index (D4), one schema per root.
 *
 * `knowledge-index.json` maps every entry id to its file, its line range and the typed
 * frontmatter fields, plus a `citedBy` count harvested from the regression suites. It
 * is GENERATED, NEVER HAND-EDITED: `--check` regenerates in memory and byte-compares,
 * exactly the `tokens:sync` / `tokens:check` ratchet this repo already uses for design
 * tokens. A hand-edited index is a lie that no other gate can catch.
 *
 * `citedBy` reads the `Business_Rule` and `Edge_Case_Refs` cells of
 * `regression/suites/**.csv` — the same two columns and the same scan intent as
 * `scripts/knowledge/lint-bl.ts` / `lint-ecl.ts`, reimplemented here with a zero-dep
 * CSV reader because this module also runs inside a brain repo's CI where the parent
 * repo's `csv-parse` dependency does not exist.
 *
 * Three things the citation scan reports, and why each is separate:
 *   citedBy      — how many suite cases point at an entry (a P0 invariant nothing
 *                  cites is a coverage hole; an entry many cases cite must never be
 *                  renumbered).
 *   dangling     — a cell cites an id NO root defines: false traceability, the
 *                  BLC-002 class.
 *   unparsable   — a CSV the scan could not read. Reported LOUDLY rather than skipped,
 *                  because its citations are absent from the map in BOTH directions,
 *                  which would otherwise read as "clean" (the BLC-005 lesson).
 *
 * Usage:
 *   node gen-index.mjs --root <dir> [--suites <dir>] [--check] [--json] [--quiet]
 *   npm run kb:index -- --root .knowledge/platform --suites regression/suites
 *   npm run kb:index:check -- --root .knowledge/platform --suites regression/suites
 *
 * Exit code: 0 on success; 1 on `--check` drift or an invalid entry; 2 on a bad root.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEntry } from "./entry.mjs";
import { LAYOUT, p, readBrain } from "./kb-paths.mjs";

export const INDEX_SCHEMA_VERSION = 1;

/** Matches an entry id inside a free-text citation cell. */
const CITATION_TOKEN_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:\.\d+)?[A-Z]?\b/g;
/** Forward-references to knowledge not promoted yet are not dangling citations. */
const FORWARD_REF_PREFIX = "PROPOSED-";

/** Posix-style relative path, so an index generated on Windows equals one from CI. */
const posix = (from, to) => relative(from, to).split(sep).join("/");

/* ------------------------------------------------------------------ corpus IO */

function listMarkdown(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) listMarkdown(full, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Read one knowledge root.
 * @param {string} root
 * @param {{layer?: "confirmed"|"drafts"}} [opts]
 * @returns {{root: string, brain: object|null, scope: string, entries: object[], invalid: object[]}}
 *          `entries` holds every PARSED entry — invalid ones too, so a broken file is
 *          visible rather than silently missing (and `invalid` names them).
 */
export function loadRoot(root, opts) {
  const layer = (opts && opts.layer) || "confirmed";
  const brain = readBrain(root);
  const dir = join(root, LAYOUT[layer]);
  const profile = layer === "drafts" ? "draft" : "entry";
  const entries = [];
  const invalid = [];
  for (const file of listMarkdown(dir)) {
    const rel = posix(root, file);
    const parsed = parseEntry(readFileSync(file, "utf8"), { file: rel, profile });
    if (!parsed.entry) {
      invalid.push({ file: rel, errors: parsed.errors });
      continue;
    }
    parsed.entry.absPath = file;
    parsed.entry.layer = layer;
    entries.push(parsed.entry);
    if (parsed.errors.length) invalid.push({ file: rel, errors: parsed.errors });
  }
  entries.sort((a, b) => String(a.id || a.fingerprint) < String(b.id || b.fingerprint) ? -1 : 1);
  return { root, brain, scope: (brain && brain.scope) || "", entries, invalid };
}

/* --------------------------------------------------------------- CSV citations */

/**
 * Minimal RFC-4180 reader: quoted fields, embedded commas/newlines, doubled quotes.
 * Zero-dep on purpose — see the module header.
 * @returns {string[][]} rows of raw cell values
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text).replace(/\r\n/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

const CITATION_COLUMNS = ["Business_Rule", "Edge_Case_Refs"];

/**
 * Harvest citations from every suite CSV under `suitesDir`.
 * @returns {{counts: Map<string, number>, cases: Map<string, string[]>, scanned: number, unparsable: object[]}}
 */
export function scanCitations(suitesDir) {
  const counts = new Map();
  const cases = new Map();
  const unparsable = [];
  let scanned = 0;
  if (!suitesDir || !existsSync(suitesDir)) return { counts, cases, scanned, unparsable };

  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".csv")) files.push(full);
    }
  };
  if (statSync(suitesDir).isDirectory()) walk(suitesDir); else files.push(suitesDir);

  for (const file of files) {
    let rows;
    try {
      rows = parseCsv(readFileSync(file, "utf8"));
    } catch (e) {
      unparsable.push({ file, reason: "read/parse failed: " + (e && e.message) });
      continue;
    }
    if (!rows.length) { unparsable.push({ file, reason: "empty file" }); continue; }
    const header = rows[0].map((h) => h.trim());
    const cols = CITATION_COLUMNS.map((c) => header.indexOf(c)).filter((i) => i >= 0);
    if (!cols.length) {
      unparsable.push({ file, reason: "no " + CITATION_COLUMNS.join("/") + " column — its citations are ABSENT from the map in both directions" });
      continue;
    }
    scanned++;
    const idCol = header.indexOf("ID");
    for (let r = 1; r < rows.length; r++) {
      const caseId = idCol >= 0 ? String(rows[r][idCol] || "").trim() : "row" + r;
      for (const c of cols) {
        const cell = String(rows[r][c] || "");
        for (const token of cell.match(CITATION_TOKEN_RE) || []) {
          if (token.startsWith(FORWARD_REF_PREFIX)) continue;
          counts.set(token, (counts.get(token) || 0) + 1);
          const list = cases.get(token) || [];
          if (!list.includes(caseId)) list.push(caseId);
          cases.set(token, list);
        }
      }
    }
  }
  return { counts, cases, scanned, unparsable };
}

/* ------------------------------------------------------------------- the index */

/**
 * Build the index object for one root. Pure — no filesystem writes, no timestamps, so
 * two runs over identical input produce an identical object (that is what makes
 * `--check` a drift gate rather than a clock).
 */
export function buildIndex(root, opts) {
  const suitesDir = opts && opts.suites;
  const loaded = loadRoot(root);
  const citations = scanCitations(suitesDir);

  const entries = {};
  const byKind = {};
  const byStatus = {};
  const byScope = {};
  for (const e of loaded.entries) {
    if (!e.id) continue;
    entries[e.id] = {
      file: e.file,
      startLine: e.startLine,
      endLine: e.endLine,
      title: String(e.title || ""),
      kind: String(e.kind || ""),
      scope: String(e.scope || ""),
      status: String(e.status || ""),
      appliesTo: String(e.appliesTo || ""),
      relation: String(e.relation || ""),
      tags: Array.isArray(e.tags) ? e.tags.slice().sort() : [],
      citedBy: citations.counts.get(e.id) || 0,
    };
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byScope[e.scope] = (byScope[e.scope] || 0) + 1;
  }

  const known = new Set(Object.keys(entries));
  const dangling = [];
  for (const [id, cnt] of Array.from(citations.counts.entries()).sort()) {
    if (!known.has(id)) dangling.push({ id, count: cnt, cases: (citations.cases.get(id) || []).slice().sort() });
  }

  const sorted = {};
  for (const id of Object.keys(entries).sort()) sorted[id] = entries[id];

  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generator: "skills/kb/gen-index.mjs",
    note: "GENERATED — never hand-edit. Regenerate with `kb:index`; `kb:index:check` fails on drift.",
    scope: loaded.scope,
    counts: {
      total: Object.keys(sorted).length,
      byScope: sortKeys(byScope),
      byKind: sortKeys(byKind),
      byStatus: sortKeys(byStatus),
    },
    citations: {
      suitesScanned: citations.scanned,
      // Relative to the suites root, NOT to process.cwd(): a cwd-dependent path here would
      // make the same corpus render two different indexes depending on where the command
      // was run from, and `--check` would report drift that does not exist.
      unparsable: citations.unparsable.map((u) => ({ file: suitesDir ? posix(suitesDir, u.file) : u.file, reason: u.reason })),
      dangling,
    },
    invalid: loaded.invalid,
    entries: sorted,
  };
}

function sortKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

/** Canonical on-disk form: 2-space JSON with a trailing newline. */
export const renderIndex = (index) => JSON.stringify(index, null, 2) + "\n";

/** Read a root's index from disk, or null. */
export function readIndex(root) {
  const file = p(root, "index");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/** Generate and write. @returns {{written: boolean, index: object, file: string}} */
export function writeIndex(root, opts) {
  const index = buildIndex(root, opts);
  const file = p(root, "index");
  const next = renderIndex(index);
  const prev = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (prev !== next) writeFileSync(file, next, "utf8");
  return { written: prev !== next, index, file };
}

/** Regenerate in memory and compare. @returns {{ok: boolean, reason: string, index: object}} */
export function checkIndex(root, opts) {
  const index = buildIndex(root, opts);
  const file = p(root, "index");
  if (!existsSync(file)) {
    return { ok: false, reason: "no " + LAYOUT.index + " at " + root + " — run `kb:index` (the index is generated, never committed by hand)", index };
  }
  const actual = readFileSync(file, "utf8");
  const expected = renderIndex(index);
  return actual === expected
    ? { ok: true, reason: "", index }
    : { ok: false, reason: LAYOUT.index + " is stale — a source entry changed without regenerating. Run `kb:index`.", index };
}

/* ----------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const args = { root: "", suites: "", check: false, json: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--json") args.json = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "--root") args.root = argv[++i] || "";
    else if (a.startsWith("--root=")) args.root = a.slice(7);
    else if (a === "--suites") args.suites = argv[++i] || "";
    else if (a.startsWith("--suites=")) args.suites = a.slice(9);
    else if (!a.startsWith("-") && !args.root) args.root = a;
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.root) {
    process.stderr.write("kb:index — usage: gen-index.mjs --root <dir> [--suites <dir>] [--check] [--json]\n");
    return 2;
  }
  if (!readBrain(args.root)) {
    process.stderr.write("kb:index — " + args.root + " is not a knowledge root (no " + LAYOUT.brain + ")\n");
    return 2;
  }

  const opts = { suites: args.suites };
  const result = args.check ? checkIndex(args.root, opts) : writeIndex(args.root, opts);
  const index = result.index;

  if (args.json) {
    process.stdout.write(JSON.stringify({ ok: args.check ? result.ok : true, reason: result.reason || "", index }, null, 2) + "\n");
  } else if (!args.quiet) {
    const c = index.counts;
    const lines = [
      "kb index " + (args.check ? "check" : "build") + " — " + args.root,
      "  entries: " + c.total + " (" + Object.entries(c.byStatus).map(([k, v]) => k + " " + v).join(", ") + ")",
      "  kinds:   " + Object.entries(c.byKind).map(([k, v]) => k + " " + v).join(", "),
      "  suites scanned: " + index.citations.suitesScanned,
    ];
    if (index.citations.dangling.length) {
      lines.push("  DANGLING citations (" + index.citations.dangling.length + " — false traceability):");
      for (const d of index.citations.dangling) lines.push("    " + d.id + " cited by " + d.cases.join(", "));
    }
    for (const u of index.citations.unparsable) lines.push("  UNPARSABLE suite: " + u.file + " — " + u.reason);
    for (const inv of index.invalid) lines.push("  INVALID entry: " + inv.file + " — " + inv.errors.map((e) => e.code).join(", "));
    if (args.check) lines.push(result.ok ? "  OK — index matches its sources" : "  DRIFT — " + result.reason);
    else lines.push(result.written ? "  written " + result.file : "  unchanged " + result.file);
    process.stdout.write(lines.join("\n") + "\n");
  }

  if (args.check && !result.ok) return 1;
  if (index.invalid.length) return 1;
  return 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
