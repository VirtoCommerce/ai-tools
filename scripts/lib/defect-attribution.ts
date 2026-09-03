/**
 * Defect attribution — "which test case caught this bug?"
 *
 * This is the only thing that can FALSIFY the assertion-strength work. Every
 * other signal in this repo (assertion class, step cost, archetype coverage) is
 * a property of the case TEXT — a prediction that a case would catch something.
 * Attribution is the outcome.
 *
 * It could not be computed before: `history.json` is suite-granular and its
 * `bugs_found` field is populated in 0 of 109 rows, and ~22 of 128 bug reports
 * named a case at all — in prose, with no parser.
 *
 * THE BUG REPORT IS THE SOURCE OF TRUTH and `bugs_found` is DERIVED at read
 * time, never stored. Three reasons: a stored count goes stale the moment a bug
 * moves `open/` -> `fixed/` -> `closed/` or is reclassified; `history.json`
 * prunes at 90 days while bug reports are durable; and
 * `.claude/rules/test-data.md` §GOLDEN RULE forbids transcribing a value that
 * already has a source.
 *
 * THE PARSER IS DELIBERATELY CONSERVATIVE. It validates every extracted id
 * against the real corpus of case ids, because the prose it reads carries
 * `BL-AUTH-009` (an invariant), `VCST-5504` (a ticket) and `AC-2` (a clause) in
 * exactly the positions a case id appears. A parser that trusted shape alone
 * would manufacture attributions — worse than none, because it would make the
 * very metric that judges this change unfalsifiable.
 *
 * AN UNATTRIBUTED BUG IS RECORDED, NEVER DROPPED. A bug found by monitoring or
 * exploration with no covering case is real signal about where cases AREN'T;
 * silently discarding it would make the corpus look better the worse it gets.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

export type Lifecycle = "open" | "fixed" | "closed" | "rejected" | "unknown";
export type FoundSource = "regression" | "monitoring" | "exploratory" | "manual" | "unstated";

export interface Attribution {
  bugFile: string;
  lifecycle: Lifecycle;
  runId?: string;
  suiteIds: string[];
  /** Case ids that exist in the corpus. */
  caseIds: string[];
  /** Case-shaped tokens that do NOT exist — renamed, retired or a typo. Reported, never silently dropped. */
  unknownCaseIds: string[];
  source: FoundSource;
  attributed: boolean;
}

const RUN_ID_RE = /\b(REG-\d{4}-\d{2}-\d{2}-\d{4}[A-Za-z0-9-]*)\b/;
const SUITE_RE = /\bsuite\s+`?(\d{2,3}[a-z]?\d?)\b/gi;
/** A case id: an uppercase prefix chain then a number. */
const CASE_ID_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,4}[a-z]?)\b/g;
/** Tokens shaped like a case id that are known to be something else. */
const NOT_A_CASE_RE =
  /^(VCST|BL|ECL|E2E|REQ|GAP|AC|PR|WCAG|SC|ADR|DV|TC|GRD|TRI|DUP|UIP|DA|REG|SMOKE|MONITOR|COV|TLC|FIX)-/i;

const SOURCE_HINTS: ReadonlyArray<readonly [FoundSource, RegExp]> = [
  ["regression", /qa-regression|regression run|\bREG-\d{4}/i],
  ["monitoring", /qa-monitoring|MONITOR-\d|app ?insights/i],
  ["exploratory", /exploratory|\bSBTM\b|probe|charter/i],
  ["manual", /\bmanual\b|by hand|ad-?hoc/i],
];

/**
 * Expand the shorthand `PRF-GQL-066, 067, 068` into full ids.
 *
 * Only a number that FOLLOWS a full id inside the same parenthesised group is
 * expanded, so a bare number elsewhere in the prose (a suite number, a count, a
 * viewport) can never be promoted into a case id.
 */
export function expandShorthand(group: string): string[] {
  const out: string[] = [];
  let prefix: string | null = null;
  let width = 3;
  const tokens = group.split(/([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,4}[a-z]?)/);
  for (const t of tokens) {
    if (/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,4}[a-z]?$/.test(t)) {
      out.push(t);
      prefix = t.replace(/-\d{2,4}[a-z]?$/, "");
      width = (/-(\d{2,4})[a-z]?$/.exec(t)?.[1] ?? "").length || 3;
      continue;
    }
    if (!prefix) continue;
    for (const m of t.matchAll(/(?:^|,)\s*(\d{1,4})(?=\s*(?:,|$))/g)) {
      // Pad to the anchor id's width: `(PRF-GQL-066, 67)` means 067, and an
      // unpadded `PRF-GQL-67` would land in unknownCaseIds as false noise.
      out.push(`${prefix}-${m[1].padStart(width, "0")}`);
    }
  }
  return out;
}

/**
 * Parse the provenance lines of one bug report body.
 *
 * Reads `**Found by:**` and `**Case:**` / `**Cases:**` — both are live
 * conventions in the corpus and a report may carry either or both.
 */
export function parseFoundBy(
  body: string,
  knownCaseIds: ReadonlySet<string>,
): Omit<Attribution, "bugFile" | "lifecycle"> {
  const provenance = body
    .split(/\r?\n/)
    .slice(0, 40)
    .filter((l) => /^\s*\*\*(Found by|Cases?)\s*:?\*\*/i.test(l))
    .join("   ");

  const suiteIds = [...provenance.matchAll(SUITE_RE)].map((m) => m[1]);
  const runId = RUN_ID_RE.exec(provenance)?.[1];

  // Strip the run id before scanning for case ids: `REG-2026-07-30-1040` is
  // itself case-SHAPED, and leaving it in reported the run as a missing case.
  const scannable = runId ? provenance.split(runId).join(" ") : provenance;

  const candidates = new Set<string>();
  for (const m of scannable.matchAll(CASE_ID_RE)) candidates.add(m[1]);
  for (const g of scannable.matchAll(/\(([^)]*)\)/g)) {
    for (const id of expandShorthand(g[1])) candidates.add(id);
  }

  const caseIds: string[] = [];
  const unknownCaseIds: string[] = [];
  for (const c of candidates) {
    if (knownCaseIds.has(c)) caseIds.push(c);
    else if (!NOT_A_CASE_RE.test(c)) unknownCaseIds.push(c);
  }

  let source: FoundSource = "unstated";
  if (provenance.trim()) {
    for (const [name, re] of SOURCE_HINTS) {
      if (re.test(provenance)) {
        source = name;
        break;
      }
    }
  }

  return {
    runId,
    suiteIds: [...new Set(suiteIds)],
    caseIds: caseIds.sort(),
    unknownCaseIds: unknownCaseIds.sort(),
    source,
    attributed: caseIds.length > 0,
  };
}

/**
 * Exact match on the directory NAME, not `endsWith` on the path.
 *
 * `endsWith` dropped and mis-labelled in both directions: `reports/bugs/reopened`
 * ends in "ened", so it fell to `unknown` and every bug inside was skipped —
 * directly contradicting this file's own "AN UNATTRIBUTED BUG IS RECORDED,
 * NEVER DROPPED". And in the other direction `unfixed`/`not-fixed` would have
 * read as `fixed`, `auto-closed` as `closed`, `reopen` as `open`.
 */
const LIFECYCLE_DIRS: ReadonlyMap<string, Lifecycle> = new Map([
  ["open", "open"], ["fixed", "fixed"], ["closed", "closed"], ["rejected", "rejected"],
]);
/** Directories that legitimately hold no bug reports, so their absence is not a warning. */
const NON_REPORT_DIRS = new Set(["screenshots", "attachments", "evidence", "assets"]);

function lifecycleOf(dirName: string): Lifecycle {
  return LIFECYCLE_DIRS.get(dirName.trim().toLowerCase()) ?? "unknown";
}

/** Every `PREFIX-NNN` id present in the suite corpus, for validation. */
export function loadKnownCaseIds(suitesRoot: string): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith(".csv")) {
        // Line-start scan, immune to inner-field quoting — the same technique
        // the appender uses, because several suites are not strictly parsable.
        for (const line of readFileSync(full, "utf-8").split(/\r?\n/)) {
          const m = /^\s*"?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,4}[a-z]?)"?\s*,/.exec(line);
          if (m) ids.add(m[1]);
        }
      }
    }
  };
  walk(suitesRoot);
  return ids;
}

/** Parse every bug report under `bugsRoot`. */
export function collectAttributions(bugsRoot: string, knownCaseIds: ReadonlySet<string>): Attribution[] {
  const out: Attribution[] = [];
  if (!existsSync(bugsRoot)) return out;
  for (const sub of readdirSync(bugsRoot)) {
    const dir = join(bugsRoot, sub);
    if (!statSync(dir).isDirectory()) continue;
    const lifecycle = lifecycleOf(sub);
    if (lifecycle === "unknown") {
      // A directory we do not recognise may hold real reports. Say so rather
      // than silently excluding it from the denominator.
      if (!NON_REPORT_DIRS.has(sub.trim().toLowerCase())) {
        const countMd = (d: string): number =>
          readdirSync(d).reduce((n, f) => {
            const full = join(d, f);
            if (statSync(full).isDirectory())
              return NON_REPORT_DIRS.has(f.trim().toLowerCase()) ? n : n + countMd(full);
            return f.endsWith(".md") ? n + 1 : n;
          }, 0);
        const mdCount = countMd(dir);
        if (mdCount)
          console.error(
            `⚠ reports/bugs/${sub}/ holds ${mdCount} report(s) but is not a known lifecycle ` +
              `directory (${[...LIFECYCLE_DIRS.keys()].join(", ")}) — they are NOT counted.`,
          );
      }
      continue;
    }
    // Walk the lifecycle dir RECURSIVELY. A lifecycle dir may be foldered by
    // severity (`open/critical-high/`, `open/medium/`, `open/low/`), and the
    // former one-level scan then read zero `.md` in `open/` and silently dropped
    // every open bug from `tc:yield`, `tc:rank`'s proven-catcher guard and
    // `compute-metrics`' defectDensity — with NO warning, because `open` IS a
    // known lifecycle dir, so the unknown-dir notice above never fires. Same
    // "an unattributed bug is RECORDED, never dropped" rule the LIFECYCLE_DIRS
    // exact-match comment above exists for.
    // The lifecycle is the TOP-LEVEL dir's, never a nested one's: severity is
    // declared inside the report and is not a lifecycle.
    const walkReports = (cur: string, rel: string): void => {
      for (const f of readdirSync(cur)) {
        const full = join(cur, f);
        if (statSync(full).isDirectory()) {
          if (NON_REPORT_DIRS.has(f.trim().toLowerCase())) continue;
          walkReports(full, join(rel, f));
          continue;
        }
        if (!f.endsWith(".md")) continue;
        const parsed = parseFoundBy(readFileSync(full, "utf-8"), knownCaseIds);
        out.push({ bugFile: join(rel, f), lifecycle, ...parsed });
      }
    };
    walkReports(dir, sub);
  }
  return out;
}

export interface AttributionIndex {
  /** caseId -> bug files it is credited with catching. */
  byCase: Map<string, string[]>;
  /** suiteId -> bug files. */
  bySuite: Map<string, string[]>;
  /** `${runId}::${suiteId}` -> bug count, the join `bugs_found` is derived from. */
  byRunSuite: Map<string, number>;
  total: number;
  attributed: number;
  /** Bugs with a named source but no case — where cases AREN'T. */
  unattributedBySource: Map<FoundSource, number>;
}

export function indexAttributions(rows: readonly Attribution[]): AttributionIndex {
  const byCase = new Map<string, string[]>();
  const bySuite = new Map<string, string[]>();
  const byRunSuite = new Map<string, number>();
  const unattributedBySource = new Map<FoundSource, number>();
  let attributed = 0;

  for (const r of rows) {
    if (r.attributed) attributed++;
    else unattributedBySource.set(r.source, (unattributedBySource.get(r.source) ?? 0) + 1);

    for (const c of r.caseIds) byCase.set(c, [...(byCase.get(c) ?? []), r.bugFile]);
    for (const s of r.suiteIds) bySuite.set(s, [...(bySuite.get(s) ?? []), r.bugFile]);
    if (r.runId) {
      for (const s of r.suiteIds) {
        const k = `${r.runId}::${s}`;
        byRunSuite.set(k, (byRunSuite.get(k) ?? 0) + 1);
      }
    }
  }
  return { byCase, bySuite, byRunSuite, total: rows.length, attributed, unattributedBySource };
}
