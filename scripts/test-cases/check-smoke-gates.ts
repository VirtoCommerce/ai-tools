/**
 * Drift guard for the smoke GO/NO-GO checklists.
 *
 * `/qa-smoke` designates the checklists — not the CSVs — as the verdict gate:
 * a run is GO only when every checklist item is ticked. That makes an unmapped
 * test case invisible to the verdict. On 2026-07-27 suite 042 had grown to
 * SMK-034 while `SMOKE-CHECKLIST.md` still declared `SMK-001 – SMK-033`, so two
 * **Critical** cases had no gate item at all — including SMK-034, the saved-card
 * *revenue-path guard*, in a §Payment section holding exactly one item under a
 * rule reading "any payment item fails → NO-GO". A saved-card payment
 * regression could therefore ship while the gate read GO.
 *
 * Nothing in the repo referenced the checklists, so that drift was silent. This
 * is the missing ratchet, in the same shape as the repo's other drift guards
 * (`td:validate`, `scope:validate`, `tokens:check` — see `.claude/rules/test-data.md`
 * §GOLDEN RULE step 3): re-derive the mapping from the CSVs and fail on mismatch.
 *
 * Usage:
 *   npx tsx scripts/test-cases/check-smoke-gates.ts [--json]
 *
 * Exit code: 0 when no error-severity finding, 1 otherwise.
 */
import { readdirSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseSuite } from "./append-test-cases-to-suite.js";

type Severity = "error" | "warning";
interface Finding {
  rule: string;
  severity: Severity;
  checklist: string;
  message: string;
}

/**
 * Coverage policy. This is a deliberate editorial choice with no external source
 * of truth, so it is declared here rather than derived:
 *
 *   PRIMARY gate — `/qa-smoke` reads it as THE verdict gate, so every executable
 *   case must have an item; an unmapped case is an error.
 *   PARITY gate — a cross-cutting lens over the same suite (UI-vs-backend
 *   agreement). It legitimately covers a subset, so uncovered cases are a
 *   warning. Dangling refs and internal-count drift are errors either way.
 */
const PARITY_MARKER = "CROSS-LAYER";

const CASE_ID_RE = /\b(SMK|BSM)-(\d+)\b/g;
const CHECKBOX_RE = /^\s*-\s*\[[ xX]?\]/;
const SECTION_RE = /^##\s+(\d+)\.\s*(.+?)\s*$/;
/** Summary row: `| 6 | Cart & Quantity Stepper | 3 | SMK-008, … |` */
const SUMMARY_ROW_RE = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/;
/**
 * GO/NO-GO totals. Two phrasings are in use and mean different things:
 *   "All 33 items checked"                     → total checkbox count
 *   "All 83 cases checked (85 boxes — …)"      → distinct cases covered, AND boxes
 * A cross-referenced case appears in two sections, so cases ≤ boxes.
 */
const STATED_ITEMS_RE = /All\s+(\d+)\s+items/i;
const STATED_CASES_RE = /All\s+(\d+)\s+cases/i;
const STATED_BOXES_RE = /\((\d+)\s+boxes/i;
/** Declared source span, e.g. "(SMK-001 – SMK-033)". Accepts hyphen or en dash. */
const DECLARED_SPAN_RE = /\((?:SMK|BSM)-(\d+)\s*[–—-]\s*(?:SMK|BSM)-(\d+)\)/;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Recursively collect files matching a predicate. */
function walk(dir: string, pick: (name: string) => boolean, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pick, out);
    else if (pick(e.name)) out.push(p);
  }
  return out;
}

/** Expand "BSM-002–004, 016–021, 025" into a concrete ID set. */
function expandIdList(text: string, fallbackPrefix: string): Set<string> {
  const ids = new Set<string>();
  // Split on commas; each part is a single id or a range, with an optional prefix.
  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = part.match(/^(?:(SMK|BSM)-)?(\d+)\s*(?:[–—-]\s*(?:(?:SMK|BSM)-)?(\d+))?$/);
    if (!m) continue;
    const prefix = m[1] ?? fallbackPrefix;
    const width = m[2].length;
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    for (let n = from; n <= to; n++) ids.add(`${prefix}-${String(n).padStart(width, "0")}`);
  }
  return ids;
}

function checkChecklist(path: string): Finding[] {
  const f: Finding[] = [];
  const name = basename(path);
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const push = (rule: string, severity: Severity, message: string) =>
    f.push({ rule, severity, checklist: name, message });

  // --- sibling suite CSVs are the source of truth for what actually executes ---
  const siblings = readdirSync(dirname(path)).filter((n) => n.endsWith(".csv"));
  const caseIds = new Set<string>();
  let prefix = "SMK";
  for (const csv of siblings) {
    let rows: any[];
    try { rows = parseSuite(readFileSync(join(dirname(path), csv), "utf8")).rows as any[]; } catch { continue; }
    for (const r of rows) {
      const id = String(r.ID ?? "").trim();
      if (/^(SMK|BSM)-\d+$/.test(id)) { caseIds.add(id); prefix = id.split("-")[0]; }
    }
  }
  if (caseIds.size === 0) {
    push("SG-000", "error", `no sibling suite CSV with SMK-/BSM- case IDs found next to this checklist`);
    return f;
  }

  // --- parse the checklist ---
  const itemsBySection = new Map<number, number>();
  const declaredBySection = new Map<number, { count: number; area: string }>();
  const refsInItems = new Set<string>();
  const allRefs = new Set<string>();
  let section = 0;
  let totalItems = 0;
  let inSummary = false;

  for (const ln of lines) {
    const sec = ln.match(SECTION_RE);
    if (sec) { section = Number(sec[1]); inSummary = false; continue; }
    if (/^##\s+Summary/i.test(ln)) { inSummary = true; continue; }
    if (/^##\s/.test(ln)) { inSummary = false; }

    if (inSummary) {
      const row = ln.match(SUMMARY_ROW_RE);
      if (row) declaredBySection.set(Number(row[1]), { count: Number(row[3]), area: row[2] });
    }
    if (CHECKBOX_RE.test(ln)) {
      totalItems++;
      itemsBySection.set(section, (itemsBySection.get(section) ?? 0) + 1);
      for (const m of ln.matchAll(CASE_ID_RE)) refsInItems.add(`${m[1]}-${m[2]}`);
    }
    for (const m of ln.matchAll(CASE_ID_RE)) allRefs.add(`${m[1]}-${m[2]}`);
  }

  // --- documented exclusions (parsed from the checklist's own header) ---
  const exclusionClause = text.match(/excluded\*{0,2}\s*\(([^)]*)\)/i);
  const excluded = exclusionClause ? expandIdList(exclusionClause[1], prefix) : new Set<string>();

  // SG-001 — a ref pointing at a case that does not exist.
  for (const ref of allRefs) {
    if (!caseIds.has(ref)) push("SG-001", "error", `references ${ref}, which no sibling suite CSV defines`);
  }

  // SG-002 — Summary table's per-section item count vs the real checkbox count.
  for (const [sec, declared] of declaredBySection) {
    const actual = itemsBySection.get(sec) ?? 0;
    if (actual !== declared.count) {
      push("SG-002", "error",
        `Summary row ${sec} ("${declared.area}") declares ${declared.count} item(s) but §${sec} has ${actual}`);
    }
  }
  for (const [sec, actual] of itemsBySection) {
    if (sec > 0 && !declaredBySection.has(sec)) {
      push("SG-002", "error", `§${sec} has ${actual} item(s) but no Summary row`);
    }
  }

  // SG-003 — GO/NO-GO stated totals vs the real ones.
  const statedItems = text.match(STATED_ITEMS_RE);
  if (statedItems && Number(statedItems[1]) !== totalItems) {
    push("SG-003", "error", `GO/NO-GO says "All ${statedItems[1]} items" but the checklist has ${totalItems}`);
  }
  const statedCases = text.match(STATED_CASES_RE);
  if (statedCases && Number(statedCases[1]) !== refsInItems.size) {
    push("SG-003", "error",
      `GO/NO-GO says "All ${statedCases[1]} cases" but the items cover ${refsInItems.size} distinct case(s)`);
  }
  const statedBoxes = text.match(STATED_BOXES_RE);
  if (statedBoxes && Number(statedBoxes[1]) !== totalItems) {
    push("SG-003", "error", `GO/NO-GO says "(${statedBoxes[1]} boxes" but the checklist has ${totalItems}`);
  }

  // SG-004 — declared source span vs the suite's real last case.
  const span = text.match(DECLARED_SPAN_RE);
  if (span) {
    const maxCase = Math.max(...[...caseIds].map((id) => Number(id.split("-")[1])));
    if (Number(span[2]) !== maxCase) {
      push("SG-004", "error",
        `header declares the source span ends at ${prefix}-${span[2]} but the suite's last case is ${prefix}-${String(maxCase).padStart(span[2].length, "0")}`);
    }
  }

  // SG-005 — an executable case with no gate item. THE bug this guard exists for.
  const isParity = name.toUpperCase().includes(PARITY_MARKER);
  const uncovered = [...caseIds].filter((id) => !refsInItems.has(id) && !excluded.has(id)).sort();
  if (uncovered.length) {
    push("SG-005", isParity ? "warning" : "error",
      `${uncovered.length} case(s) have no checklist item${isParity ? " (parity gate — subset is allowed)" : ""}: ${uncovered.join(", ")}`);
  }

  return f;
}

// ---------------------------------------------------------------------------

const checklists = walk(join(repoRoot, "regression", "suites"), (n) => /CHECKLIST.*\.md$/i.test(n)).sort();
const findings = checklists.flatMap(checkChecklist);
const errors = findings.filter((x) => x.severity === "error");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ checklists: checklists.length, findings }, null, 2));
} else {
  console.log(`\nSmoke gate parity — ${checklists.length} checklist(s) checked\n`);
  for (const path of checklists) {
    const name = basename(path);
    const mine = findings.filter((x) => x.checklist === name);
    if (!mine.length) { console.log(`  OK   ${name}`); continue; }
    console.log(`  ${mine.some((x) => x.severity === "error") ? "FAIL" : "WARN"} ${name}`);
    for (const x of mine) console.log(`         [${x.rule}/${x.severity}] ${x.message}`);
  }
  console.log(
    `\n${errors.length} error(s), ${findings.length - errors.length} warning(s).` +
    (errors.length ? `\nThe checklist is the /qa-smoke verdict gate — an unmapped case cannot fail the run.\n` : "\n"),
  );
}

process.exit(errors.length ? 1 : 0);
