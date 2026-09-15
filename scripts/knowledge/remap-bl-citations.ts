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
 *   - Never renumbers, never edits another column, never creates a row.
 *
 * USAGE
 *   npm run bl:remap -- --propose BL-L10N-001
 *   npm run bl:remap -- --from BL-CR-002 --to BL-CR-001 --apply
 *   npm run bl:remap -- --drop BL-FOO-001 --reason "domain retired" --apply
 *   npm run bl:remap -- --list                 # every dangling id + its citing cases
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ORACLE = ".claude/knowledge/oracles/business-logic.md";
const SUITES = "regression/suites";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const val = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

/* ── CSV, line-ending preserving ─────────────────────────────────────────── */
function parse(s: string): string[][] {
  const rows: string[][] = [];
  let f = "", r: string[] = [], q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { r.push(f); f = ""; }
      else if (c === "\r" && s[i + 1] === "\n") { r.push(f); f = ""; rows.push(r); r = []; i++; }
      else if (c === "\n") { r.push(f); f = ""; rows.push(r); r = []; }
      else f += c;
    }
  }
  if (f.length || r.length) { r.push(f); rows.push(r); }
  return rows;
}
const needsQuote = (v: string) => /[",\r\n]/.test(v);
const ser = (rows: string[][], nl: string) =>
  rows.map((r) => r.map((v) => (needsQuote(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(",")).join(nl);

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
const ids = oracleIds();
const files = walkCsv(SUITES);
const APPLY = flag("--apply");

if (flag("--list")) {
  const byId = new Map<string, string[]>();
  for (const file of files) {
    let rows: string[][];
    try { rows = parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const h = rows[0]; const ci = h.indexOf("Business_Rule"), ii = h.indexOf("ID");
    if (ci < 0 || ii < 0) continue;
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
  process.exit(0);
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
  const raw = fs.readFileSync(file, "utf8");
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const trailing = raw.endsWith(nl) ? nl : "";
  const rows = parse(raw);
  const before = JSON.stringify(rows);
  const h = rows[0]; const ci = h.indexOf("Business_Rule"), ii = h.indexOf("ID");
  if (ci < 0 || ii < 0) continue;

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
    fs.writeFileSync(file, ser(rows, nl) + trailing);
    // verify: only Business_Rule cells moved
    const after = parse(fs.readFileSync(file, "utf8"));
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
