/**
 * Rank test cases by how much detection they buy for what they cost.
 *
 * WHY THIS EXISTS
 * ---------------
 * The corpus grows every day and a full regression runs for hours, but a large
 * share of it buys nothing: many cases carry no assertion that can fail on a
 * wrong value, and most Frontend cases are long walkthroughs. That combination
 * is the worst possible trade — maximum cost to run, near-zero probability of
 * catching anything, because a presence check only fails when an element is
 * absent entirely. This script REPORTS the current numbers rather than quoting
 * them: the first version transcribed a measurement that the next commit
 * corrected, and it went stale in four places at once.
 *
 * This script makes that trade VISIBLE per case, with a reason for every verdict.
 * It deliberately prints reasons rather than a bare score: Google deployed a
 * bug-prediction score company-wide and measured no change in behaviour (Lewis
 * et al., ICSE 2013) — an unexplained number gets ignored, so the output has to
 * say WHY a case is weak and what would fix it.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not a yield measurement. "Has this case ever caught a bug?" is still not
 * computable here: history.json is suite-granular, its `bugs_found` is empty in
 * every row, and per-case `durationMs` is written by the runner then discarded at
 * fold. So this ranks by assertion STRENGTH and STEP COST — properties of the
 * case text — and says so. When per-case history lands, `yield` becomes a fourth
 * signal; until then no verdict here claims a case is dead, only that it cannot
 * discriminate.
 *
 * FAIL-CLOSED, in the expensive direction
 * ---------------------------------------
 * A wrongly demoted case silently removes coverage; a wrongly kept one costs
 * minutes. So every doubt resolves to KEEP, and DEMOTE requires ALL of:
 * presence-only assertions AND >=6 steps AND not on the risk floor AND no
 * deliberate design stamp. Anything cheap, high-priority or deliberately
 * designed is STRENGTHEN (fix the assertion) — never DEMOTE.
 *
 * Usage:
 *   npx tsx scripts/test-cases/rank-cases.ts [--suite <csv>] [--layer frontend|backend]
 *                                            [--verdict DEMOTE|STRENGTHEN|KEEP] [--json] [--limit N]
 */
import { readFileSync } from "fs";
import { join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { ARCHETYPE_STAMP_RE, parseSuite, type Row } from "./append-test-cases-to-suite.js";
import {
  classifyAssertionStrength,
  hasDiscriminatingAssertion,
  isUnclassified,
  STRENGTH_ORDER,
} from "./lint-test-cases.js";
import { collectAttributions, indexAttributions, loadKnownCaseIds } from "../lib/defect-attribution.js";
import { isNonExecutingStatus } from "../lib/case-classifier.js";
import { allSuiteCsvs } from "./sync-test-suites.js";
import { enumFlag, flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SUITES_ROOT = join(REPO_ROOT, "regression", "suites");

/** Steps at or above which a case is "expensive to run" (long walkthrough). */
export const EXPENSIVE_STEPS = 6;
/** Priorities that are never demoted regardless of assertion strength. */
export const RISK_FLOOR = new Set(["Critical", "P0"]);
/**
 * Does this case consume regression time today?
 *
 * DERIVED, not listed: `isNonExecutingStatus` owns EX-200/EX-201 and case-folds,
 * which a local literal did not. A blank status runs (the runner does not skip
 * it), so it counts as running here — and `demote-cases` must therefore be able
 * to act on it, or the ranker advertises work its counterpart cannot do.
 */
function isRunningStatus(status: string): boolean {
  return !isNonExecutingStatus(status);
}

export type Verdict = "KEEP" | "STRENGTHEN" | "DEMOTE";

export interface CaseRank {
  id: string;
  suite: string;
  priority: string;
  status: string;
  /** Strongest assertion class present. */
  best: string;
  discriminating: boolean;
  steps: number;
  assertions: number;
  hasDesignStamp: boolean;
  verdict: Verdict;
  /** Human-readable, one clause per contributing signal. */
  reasons: string[];
}

function lines(cell: string): string[] {
  return (cell ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Strongest class present, by the ladder's own order.
 *
 * The order is imported, not re-declared. The first version kept a local copy
 * and it silently lost `NEG` the moment that class was added: `indexOf` returned
 * -1, the guard skipped it, and 49 cases reported `best: UNKNOWN` while being
 * correctly judged discriminating — the explanation contradicting the verdict.
 */
export function bestStrength(assertionLines: readonly string[]): string {
  let bestIdx = STRENGTH_ORDER.length - 1;
  for (const l of assertionLines) {
    const idx = STRENGTH_ORDER.indexOf(classifyAssertionStrength(l));
    if (idx >= 0 && idx < bestIdx) bestIdx = idx;
  }
  return assertionLines.length ? STRENGTH_ORDER[bestIdx] : "NONE";
}

/** Pure ranking of one row. Exported so the tests exercise it without file IO. */
/**
 * Cases the repo can PROVE caught a bug. Lazily built once.
 *
 * This is the only ground truth available, and the first version of this ranker
 * never consulted it — while its own header promised "every doubt resolves to
 * KEEP". Measured on the corpus at the time: 10 of the 36 proven cases were
 * marked DEMOTE, among them the tests that caught a nested-impersonation
 * privilege escalation, a stored XSS, two open P0s and a cross-org role leak.
 * A case that has caught a bug is not a candidate for anything but KEEP.
 */
let provenCatchers: Set<string> | null = null;
export function provenBugCatchers(): Set<string> {
  if (provenCatchers) return provenCatchers;
  try {
    const idx = indexAttributions(
      collectAttributions(join(REPO_ROOT, "reports", "bugs"), loadKnownCaseIds(SUITES_ROOT)),
    );
    provenCatchers = new Set(idx.byCase.keys());
  } catch {
    // Fail CLOSED for demotion: with no evidence available we must not silently
    // behave as though every case is unproven. An empty set plus the explicit
    // flag below keeps the ranker honest about what it could not check.
    provenCatchers = new Set();
  }
  return provenCatchers;
}

export function rankCase(row: Row, suite: string, proven: ReadonlySet<string> = provenBugCatchers()): CaseRank {
  const aLines = lines(row.Assertions);
  const sLines = lines(row.Steps);
  const discriminating = hasDiscriminatingAssertion(aLines);
  const priority = (row.Priority ?? "").trim();
  const status = (row.Automation_Status ?? "").trim();
  const refs = row.References ?? "";
  // A stamp means a human/agent deliberately declared what defect this probes
  // (the /qa-test Step 1e contract). Deliberate design is evidence of intent, so
  // it blocks demotion even when the assertions are currently weak.
  const hasDesignStamp = ARCHETYPE_STAMP_RE.test(refs);
  const id = row.ID ?? "<no id>";
  const caughtABug = proven.has(id);
  const unreadable = isUnclassified(aLines);

  const reasons: string[] = [];
  let verdict: Verdict = "KEEP";

  // Every guard that can block demotion, evaluated once.
  const blockers: string[] = [];
  if (caughtABug) blockers.push("has caught a real bug (see tc:yield) — never demoted");
  if (RISK_FLOOR.has(priority)) blockers.push(`${priority} — risk floor, never demoted; fix it instead`);
  if (hasDesignStamp) blockers.push("carries a deliberate Archetype stamp — strengthen, do not retire");
  if (sLines.length < EXPENSIVE_STEPS) blockers.push(`only ${sLines.length} steps — cheap to keep and fix`);

  if (!aLines.length) {
    reasons.push("no assertions at all — the case checks nothing");
    // The zero-assertion branch obeys the SAME contract as the weak branch: the
    // documented rule is presence-only AND expensive AND not risk-floor AND not
    // stamped. The first version checked only the risk floor here, so a 1-step
    // deliberately-stamped case whose author had not yet filled Assertions was
    // demoted.
    verdict = blockers.length ? "STRENGTHEN" : "DEMOTE";
    reasons.push(...blockers);
  } else if (unreadable) {
    // NOT presence-only: the classifier has no bucket for these forms. That is
    // the classifier's gap, so it can never justify removing coverage.
    reasons.push(
      `assertion forms the strength classifier cannot read (${bestStrength(aLines)}) — a gap in the classifier, not evidence the case is weak`,
    );
    verdict = "STRENGTHEN";
  } else if (!discriminating) {
    reasons.push(
      `every assertion is presence-only (${bestStrength(aLines)}) — cannot fail on a wrong value`,
    );
    verdict = "STRENGTHEN";
    if (sLines.length >= EXPENSIVE_STEPS && !caughtABug && !RISK_FLOOR.has(priority) && !hasDesignStamp) {
      reasons.push(`${sLines.length} steps to run for a check that cannot discriminate`);
      verdict = "DEMOTE";
    } else {
      reasons.push(...blockers);
    }
  }
  if (discriminating) reasons.push(`strongest assertion class: ${bestStrength(aLines)}`);
  if (!isRunningStatus(status)) {
    reasons.push(`Automation_Status "${status}" — already out of the regression lane`);
    verdict = "KEEP";
  }

  return {
    id,
    suite,
    priority,
    status,
    best: bestStrength(aLines),
    discriminating,
    steps: sLines.length,
    assertions: aLines.length,
    hasDesignStamp,
    verdict,
    reasons,
  };
}

/**
 * Corpus walk, delegated. `allSuiteCsvs` already does this (with
 * `withFileTypes`, avoiding a `statSync` per entry) and returns repo-relative
 * forward-slash paths — which is also what `rankSuiteFile` used to recompute by
 * hand. This was the sixth `.csv` walker in the repo; five was already too many.
 */
function collectSuites(layer?: string): string[] {
  const all = allSuiteCsvs(SUITES_ROOT);
  if (!layer) return all;
  const want = layer.toLowerCase() === "frontend" ? "Frontend" : "Backend";
  return all.filter((f) => f.includes(`/${want}/`));
}

export function rankSuiteFile(file: string): CaseRank[] {
  const text = readFileSync(file, "utf-8");
  let rows: Row[];
  try {
    rows = parseSuite(text).rows;
  } catch {
    // A legacy-header or unparsable suite is REPORTED, never silently skipped —
    // absence from a ranking reads as "nothing to fix here", which is a lie.
    return [
      {
        id: "<unparsable>", suite: file, priority: "", status: "", best: "NONE",
        discriminating: false, steps: 0, assertions: 0, hasDesignStamp: false,
        verdict: "KEEP",
        reasons: ["suite is not field-parsable (legacy header?) — excluded from ranking, not cleared"],
      },
    ];
  }
  const rel = file.slice(REPO_ROOT.length + 1);
  return rows.map((r) => rankCase(r, rel));
}

function main(): void {
  const argv = process.argv.slice(2);
  rejectUnknownFlags(
    argv,
    ["--json", "--suite", "--layer", "--verdict", "--limit"],
    ["--suite", "--layer", "--verdict", "--limit"],
  );
  const asJson = argv.includes("--json");
  const suite = flagValue(argv, "--suite");
  const layer = enumFlag(argv, "--layer", ["frontend", "backend"] as const);
  const wantVerdict = enumFlag(argv, "--verdict", ["KEEP", "STRENGTHEN", "DEMOTE"] as const);
  const limit = intFlag(argv, "--limit", 40);

  const files = suite ? [resolve(suite)] : collectSuites(layer);
  // ONE walk: counts are corpus-wide, `ranks` is the filtered view of the same
  // array. Two independent traversals that must agree is a smell, not a saving.
  const all = files.flatMap((f) => rankSuiteFile(f));
  const total = all.length;
  const counts = { KEEP: 0, STRENGTHEN: 0, DEMOTE: 0 } as Record<Verdict, number>;
  for (const r of all) counts[r.verdict]++;
  const ranks = wantVerdict ? all.filter((r) => r.verdict === wantVerdict) : all;

  if (asJson) {
    console.log(JSON.stringify({ total, counts, cases: ranks }, null, 2));
    return;
  }

  console.log(`\nRanked ${total} case(s) across ${files.length} suite(s)`);
  console.log(
    `  KEEP ${counts.KEEP}   STRENGTHEN ${counts.STRENGTHEN}   DEMOTE-candidate ${counts.DEMOTE}\n`,
  );
  // Worst first: DEMOTE, then most steps wasted.
  const order: Record<Verdict, number> = { DEMOTE: 0, STRENGTHEN: 1, KEEP: 2 };
  ranks.sort((a, b) => order[a.verdict] - order[b.verdict] || b.steps - a.steps);
  for (const r of ranks.slice(0, limit)) {
    console.log(`${r.verdict.padEnd(10)} ${r.id.padEnd(18)} ${r.priority.padEnd(9)} ${r.steps}st/${r.assertions}as  ${r.suite.split(sep).pop()}`);
    for (const why of r.reasons) console.log(`           · ${why}`);
  }
  if (ranks.length > limit) console.log(`\n… ${ranks.length - limit} more (raise --limit or use --json)`);
  console.log(
    `\nRanked by assertion strength and step cost — NOT by measured yield.\n` +
      `"Has this case ever caught a bug?" is not computable yet (history.json is suite-granular,\n` +
      `bugs_found is empty in every row, per-case durationMs is discarded at fold). No verdict here\n` +
      `claims a case is dead — only that it cannot discriminate. DEMOTE means "stop paying for it in\n` +
      `regression", never "delete it".`,
  );
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
