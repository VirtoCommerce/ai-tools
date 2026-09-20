/**
 * remap-bl-citations.ts — the missing WRITE half of the BL citation contract.
 *
 * WHY THIS EXISTS. `Business_Rule` cells pin `BL-*` ids into test cases, and `lint-bl.ts`
 * reads them back (BLC-002 detects a citation whose invariant does not exist). But until
 * now NOTHING in the repo could WRITE that column on an existing row: `promote-cases.ts`
 * touches `Automation_Status`/`References` only, and `append-test-cases-to-suite.ts` /
 * `scaffold-rows.ts` author NEW rows. `/qa-review-oracles` Step 4 routes citation remaps to
 * `/qa-review-tests --fix`, whose own non-fixable list says "Missing BL-* / ECL-* refs →
 * requires domain analysis". So the documented handoff pointed at a capability that did not
 * exist, and BLC-002 accumulated (50 dangling ids across ~142 citing cases when this was
 * written) because it is Medium and fails no build.
 *
 * WHAT IT DOES NOT DO. It does not decide ADD-vs-REMAP, invent an invariant, or assign a
 * severity tag. Those are `/qa-review-oracles` judgment calls. This is the mechanical arm
 * only: once a human has decided, it applies that decision across every citing case,
 * deterministically and reversibly.
 *
 * MODES
 *   --from BL-X --to BL-Y     REMAP. An existing invariant already covers it.
 *                             REFUSES if BL-Y is absent from the oracle — the one thing
 *                             worse than a dangling citation is a remap that creates another.
 *   --propose BL-X            FORWARD-REFERENCE. BL-X is a legitimate ADD candidate awaiting
 *                             triangulation, so rewrite the citation to `PROPOSED-BL-X`,
 *                             which lint-bl.ts already exempts from BLC-002 by design.
 *                             This converts FALSE TRACEABILITY (a case claiming to verify a
 *                             rule that does not exist) into a DECLARED forward-reference.
 *                             Nothing is fabricated and no coverage claim is created.
 *                             REFUSES if BL-X does exist — then it is not dangling.
 *   --drop BL-X --reason "…"  REMOVE the citation. For a ref that is simply wrong. The reason
 *                             is mandatory and is echoed in the report, never written to CSV.
 *
 * SAFETY
 *   - Dry by default; `--apply` writes.
 *   - Touches the `Business_Rule` cell and nothing else — verified cell-by-cell after write.
 *   - Preserves each file's own line endings (075-loyalty.csv is LF-only; the rest are CRLF).
 *   - Preserves each file's UTF-8 BOM (13 of 143 suites carry one) — see BOM note below.
 *   - Never renumbers, never edits another column, never creates a row.
 *   - NEVER skips a suite silently. A file this tool cannot read, or whose header it does
 *     not recognise, is REPORTED as `unreadable`, never folded into a zero count.
 *
 * THE BOM INCIDENT (2026-09-19) — why the two rules above are load-bearing.
 *   `fs.readFileSync(f, "utf8")` does NOT strip a UTF-8 BOM, so the first header cell parsed
 *   as `"﻿ID"` and `h.indexOf("ID")` returned -1. The `if (ci < 0 || ii < 0) continue;`
 *   guard then dropped all 13 BOM-carrying suites — SILENTLY. `bl:lint` (which parses through
 *   `parseSuite`, taught `bom: true` after the same class of bug cost it 3 false BLC-004
 *   findings) reported BL-CFG-003 cited by 4 cases in 072e; this tool reported
 *   "0 case(s) in 0 file(s)" for the identical id. Two tools, one corpus, opposite answers —
 *   and the one that said zero said it with no caveat, so the citations were left baselined
 *   as un-burnable debt. A zero from a tool that cannot say which files it failed to read is
 *   not a measurement.
 *
 * USAGE
 *   npm run bl:remap -- --propose BL-L10N-001
 *   npm run bl:remap -- --from BL-CR-002 --to BL-CR-001 --apply
 *   npm run bl:remap -- --drop BL-FOO-001 --reason "domain retired" --apply
 *   npm run bl:remap -- --list                 # every dangling id + its citing cases
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ORACLE = ".claude/knowledge/oracles/business-logic.md";
const SUITES = "regression/suites";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const val = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

/* ── CSV, line-ending AND quoting preserving ─────────────────────────────── */
/**
 * `quoted[i][j]` records whether cell j of row i was written with quotes in the SOURCE.
 *
 * Without it, `ser` re-quotes minimally and strips the quotes from every cell that does not
 * strictly need them — which is most of them, since the corpus quotes every cell. Measured
 * 2026-09-19 on 072e: changing 14 `Business_Rule` cells rewrote **111 of 111 lines** and
 * dropped the file by 1,140 bytes, all of it quoting churn in columns this tool promises never
 * to touch. The post-write verification did not catch it and could not: it compares PARSED
 * values, which were identical — the right check for correctness, the wrong one for churn.
 *
 * Churn is not cosmetic here. A suite CSV has exactly ONE author for the duration of a change
 * and a conflict in one is never resolved with git (`.claude/rules/regression.md`), so a
 * whole-file diff for a 14-cell edit is the difference between a reviewable change and an
 * unmergeable one.
 */
export type Parsed = { rows: string[][]; quoted: boolean[][] };
export function parse(s: string): Parsed {
  const rows: string[][] = [], quoted: boolean[][] = [];
  let f = "", r: string[] = [], rq: boolean[] = [], q = false, wasQuoted = false;
  const endField = () => { r.push(f); rq.push(wasQuoted); f = ""; wasQuoted = false; };
  const endRow = () => { endField(); rows.push(r); quoted.push(rq); r = []; rq = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') { q = true; wasQuoted = true; }
      else if (c === ",") endField();
      else if (c === "\r" && s[i + 1] === "\n") { endRow(); i++; }
      else if (c === "\n") endRow();
      else f += c;
    }
  }
  if (f.length || r.length) endRow();
  return { rows, quoted };
}
const needsQuote = (v: string) => /[",\r\n]/.test(v);
export const ser = (p: Parsed, nl: string) =>
  p.rows.map((r, i) => r.map((v, j) =>
    (p.quoted[i]?.[j] || needsQuote(v)) ? '"' + v.replace(/"/g, '""') + '"' : v).join(",")).join(nl);

/**
 * Read a suite, separating its UTF-8 BOM from its content.
 *
 * The BOM must come OFF before parsing (or it glues itself to the first header cell and
 * every `header.indexOf(…)` on column 0 returns -1) and go back ON before writing (these
 * files carry it; this tool is not the place to decide they shouldn't).
 */
export function readSuite(file: string): { text: string; bom: string } {
  const raw = fs.readFileSync(file, "utf8");
  return raw.charCodeAt(0) === 0xfeff ? { text: raw.slice(1), bom: "﻿" } : { text: raw, bom: "" };
}

/**
 * Suites this run did not scan, in two classes that must never be printed as one.
 *
 *   `legacy`     — the 11-column legacy header (`Expected Result`, no `Business_Rule`).
 *                  A KNOWN corpus class (`regression-lanes.md` §274 UNROUTABLE), so it carries
 *                  no BL citation by construction. Counted, named on request, exit 0.
 *   `unreadable` — anything else: unparsable, or a `Business_Rule` column with no `ID` column.
 *                  A real anomaly. Named every time, exit 1.
 *
 * They are split because a warning that fires on every run is a warning nobody reads, and the
 * one finding that matters would then arrive wearing the same colour as eleven that don't.
 */
const legacy: string[] = [];
const unreadable: { file: string; why: string }[] = [];

function reportSkips(): void {
  if (legacy.length) console.log(`(${legacy.length} legacy-header suite(s) carry no Business_Rule column — nothing to cite there${flag("--verbose") ? ": " + legacy.map((f) => path.basename(f)).join(", ") : "; --verbose to name them"})`);
  if (!unreadable.length) return;
  console.error(`\n⚠ ${unreadable.length} suite(s) NOT scanned — the counts above exclude them:`);
  for (const u of unreadable) console.error(`    ${path.relative(process.cwd(), u.file)} — ${u.why}`);
  console.error("  A citation living only in one of these is invisible to this tool. Fix the file, then re-run.");
}

/** Classify a header: returns the two column indexes, or records the skip and returns null. */
function columns(file: string, h: string[]): { ci: number; ii: number } | null {
  const ci = h.indexOf("Business_Rule"), ii = h.indexOf("ID");
  if (ci >= 0 && ii >= 0) return { ci, ii };
  if (ci < 0 && ii >= 0) { legacy.push(file); return null; }
  unreadable.push({ file, why: ci < 0 ? `header has neither Business_Rule nor ID (got: ${h.slice(0, 5).join(", ")}…)` : `has Business_Rule but no ID column (got: ${h.slice(0, 5).join(", ")}…)` });
  return null;
}

function walkCsv(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkCsv(full, out);
    else if (name.toLowerCase().endsWith(".csv")) out.push(full);
  }
  return out;
}

/** Ids that actually exist as `### BL-…` headings in the oracle. */
function oracleIds(): Set<string> {
  const md = fs.readFileSync(ORACLE, "utf8");
  const s = new Set<string>();
  for (const m of md.matchAll(/^###\s+(BL-[A-Z0-9]+-\d+)\s*:/gm)) s.add(m[1]);
  return s;
}

/** Cited ids per file/case, excluding PROPOSED- forward-references (same rule as lint-bl.ts). */
const BL_TOKEN = /\bBL-[A-Z0-9]+-\d+\b/g;
function citedIn(cell: string): string[] {
  const out: string[] = [];
  for (const m of cell.matchAll(BL_TOKEN)) {
    const at = m.index ?? 0;
    if (cell.slice(Math.max(0, at - 9), at).toUpperCase().endsWith("PROPOSED-")) continue;
    out.push(m[0]);
  }
  return out;
}

/* ── main ────────────────────────────────────────────────────────────────── */
// Guarded so scripts/unit can import the pure derivations above without the CLI
// scanning the corpus and calling process.exit() on import (lint-bl.ts does the same).
const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
const ids = oracleIds();
const files = walkCsv(SUITES);
const APPLY = flag("--apply");

if (flag("--list")) {
  const byId = new Map<string, string[]>();
  for (const file of files) {
    let rows: string[][];
    try { rows = parse(readSuite(file).text).rows; } catch (e) { unreadable.push({ file, why: `unparsable (${(e as Error).message})` }); continue; }
    const cols = columns(file, rows[0] ?? []);
    if (!cols) continue;
    const { ci, ii } = cols;
    for (const r of rows.slice(1)) {
      if (r.length <= ci) continue;
      for (const ref of citedIn(r[ci] ?? "")) {
        if (ids.has(ref)) continue;
        (byId.get(ref) ?? byId.set(ref, []).get(ref)!).push(`${path.basename(file)}:${r[ii]}`);
      }
    }
  }
  const sorted = [...byId.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`dangling BL ids: ${sorted.length} · citing cases: ${sorted.reduce((n, [, v]) => n + v.length, 0)}`);
  for (const [id, cases] of sorted) console.log(`  ${id.padEnd(16)}${String(cases.length).padStart(4)}  ${cases.slice(0, 4).join(", ")}${cases.length > 4 ? ", …" : ""}`);
  reportSkips();
  process.exit(unreadable.length ? 1 : 0);
}

const from = val("--from"), to = val("--to"), propose = val("--propose"), drop = val("--drop");
const modes = [from && to ? "remap" : null, propose ? "propose" : null, drop ? "drop" : null].filter(Boolean);
if (modes.length !== 1) {
  console.error("ABORT: pass exactly one of  --from X --to Y | --propose X | --drop X --reason '…'  (or --list)");
  process.exit(2);
}

let target = "", replacement: string | null = "";
if (modes[0] === "remap") {
  target = from!;
  if (!ids.has(to!)) { console.error(`ABORT: --to ${to} does not exist in the oracle. A remap must never create a new dangling citation.`); process.exit(2); }
  replacement = to!;
} else if (modes[0] === "propose") {
  target = propose!;
  if (ids.has(target)) { console.error(`ABORT: ${target} EXISTS in the oracle — it is not dangling, so a forward-reference would be wrong.`); process.exit(2); }
  replacement = `PROPOSED-${target}`;
} else {
  target = drop!;
  if (!val("--reason")) { console.error("ABORT: --drop requires --reason (recorded in the report, never written to the CSV)."); process.exit(2); }
  replacement = null;
}

let touchedFiles = 0, touchedCases = 0;
for (const file of files) {
  let raw: string, bom: string;
  try { ({ text: raw, bom } = readSuite(file)); } catch (e) { unreadable.push({ file, why: `unreadable (${(e as Error).message})` }); continue; }
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const trailing = raw.endsWith(nl) ? nl : "";
  const parsed = parse(raw);
  const rows = parsed.rows;
  const before = JSON.stringify(rows);
  const h = rows[0] ?? [];
  const cols = columns(file, h);
  if (!cols) continue;
  const { ci, ii } = cols;

  const hits: string[] = [];
  for (const r of rows.slice(1)) {
    if (r.length <= ci) continue;
    const cell = r[ci] ?? "";
    if (!citedIn(cell).includes(target)) continue;
    const next = replacement === null
      ? cell.replace(new RegExp(`\\s*,?\\s*\\b${target}\\b`, "g"), "").replace(/^\s*,\s*/, "").trim()
      : cell.replace(new RegExp(`\\b${target}\\b`, "g"), replacement);
    r[ci] = next;
    hits.push(r[ii]);
  }
  if (!hits.length) continue;
  touchedFiles++; touchedCases += hits.length;
  console.log(`  ${path.basename(file).padEnd(46)}${String(hits.length).padStart(3)}  ${hits.slice(0, 6).join(", ")}${hits.length > 6 ? ", …" : ""}`);

  if (APPLY) {
    fs.writeFileSync(file, bom + ser(parsed, nl) + trailing);
    // verify: only Business_Rule cells moved
    const after = parse(readSuite(file).text).rows;
    const b = JSON.parse(before) as string[][];
    for (let i = 0; i < b.length; i++)
      for (let j = 0; j < b[i].length; j++)
        if (b[i][j] !== after[i][j] && j !== ci) {
          console.error(`ABORT: unintended change in ${file} row ${i} col ${h[j]} — restore from git and investigate.`);
          process.exit(1);
        }
  }
}

const verb = modes[0] === "remap" ? `${target} → ${replacement}` : modes[0] === "propose" ? `${target} → ${replacement} (forward-reference)` : `${target} removed (${val("--reason")})`;
console.log(`\n${verb}`);
console.log(`${touchedCases} case(s) in ${touchedFiles} file(s)${APPLY ? " — WRITTEN" : " — dry run, nothing written (add --apply)"}`);
if (APPLY) console.log("re-gate with: npm run bl:lint && npm run suites:lint && npm run td:validate");
reportSkips();
if (unreadable.length) process.exit(1);
}
