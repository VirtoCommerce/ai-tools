/**
 * Merge per-lane result fragments into the ONE canonical `suite-{ID}-results.json`.
 *
 * WHY FRAGMENTS AND A MERGER, RATHER THAN ONE SHARED FILE. Once a suite's cases are split
 * across a machine lane and a browser agent, two writers exist. The runner agent's contract
 * is "overwrite the whole file each time", so a shared file is a race — and asking an LLM to
 * preserve another writer's rows on every rewrite is a rule it will break under context
 * pressure, at which point a real failure silently disappears. So: exactly ONE writer per
 * fragment, and one deterministic merger.
 *
 *   suite-050h-results.machine.json   <- machine-lane.ts    (29 rows)
 *   suite-050h-results.browser.json   <- test-runner-agent  (4 rows)
 *           \__ merge-suite-lanes.ts __/
 *                       v
 *   suite-050h-results.json           <- canonical, 34 rows, every one tagged with its lane
 *
 * The canonical file is what `scripts/lib/regression-triage.ts` and
 * `scripts/regression/generate-regression-html-report.ts` already read, so nothing
 * downstream changes.
 *
 * THE PLAN IS AUTHORITATIVE ABOUT WHAT SHOULD EXIST. `planned` comes from the lanes file,
 * not from the fragments, because the failure worth engineering against is a lane dying
 * quietly: if the merger derived its case set from what the fragments reported, a machine
 * lane that crashed before writing would produce a smaller, greener, faster-looking suite.
 * That is the same failure shape as a dropped test, and it is the reason `lane_lost` exists.
 */

export type CaseLane = "machine" | "browser" | "manual" | "deprecated";

/**
 * The lanes that never dispatch anything, and the note each one earns in the results.
 *
 * A planned case with no fragment row is normally `lane_lost` — a lane died before writing.
 * For these two it is the EXPECTED state: nothing was ever sent, so the row must be
 * materialised here or the case would read as lost. They are kept apart deliberately: a
 * retired case labelled `Automation_Status=Manual (explicit)` would tell a reader a human is
 * expected to run it, which is the opposite of what Deprecated means.
 */
const NON_EXECUTING_LANES: Partial<Record<CaseLane, string>> = {
  manual: "Automation_Status=Manual (explicit)",
  deprecated: "Automation_Status=Deprecated (retired — excluded from execution, EX-201)",
};

/** Statuses the recomputed counts recognise. Anything else stays untallied — see below. */
const COUNTED = new Set(["PASS", "FAIL", "BLOCKED", "SKIPPED"]);

export interface ResultCase {
  id: string;
  status: string;
  lane?: CaseLane;
  notes?: string;
  [k: string]: unknown;
}

export interface Fragment {
  /** Which lane produced it — stamped onto every row it contributes. */
  lane: CaseLane;
  /** Path or label, used verbatim in error messages. */
  source: string;
  /** The parsed `suite-{ID}-results.{lane}.json`. Tolerates a missing `testCases`. */
  envelope: Record<string, unknown>;
}

export interface MergeInput {
  suiteId: string;
  suiteName?: string;
  runId?: string;
  environment?: string;
  browser?: string;
  /** From the lanes file: every case the run intended to execute, and where. */
  planned: ReadonlyArray<{ id: string; lane: CaseLane }>;
  fragments: ReadonlyArray<Fragment>;
  /**
   * Present only on a `--cases`-scoped run (`suites:filter`'s sidecar). It records that `planned`
   * is a SLICE of the suite, not the suite.
   *
   * Without it the envelope is indistinguishable from a full run: `totalCases` below is derived
   * from `planned`, so a 6-of-44 scoped run reports 6/6 and every downstream consumer —
   * `history.json`, the flakiness trend, and above all `estimate-calibration`'s 95%-coverage
   * guard — reads it as complete. `estimatedMinutes` would then be recalibrated from a fifth of
   * a suite while believing it saw all of it.
   *
   * `totalCases` stays the PLANNED count on purpose: the pass rate must be over what the run
   * actually intended to execute. The unfiltered size travels separately, as `unfilteredTotal`.
   */
  caseFilter?: {
    readonly tiers: readonly string[];
    readonly keptCases: number;
    readonly sourceCases: number;
  };
}

export interface MergeResult {
  envelope: Record<string, unknown>;
  /** Non-empty means DO NOT publish — the lane split leaked. Caller exits non-zero. */
  errors: string[];
  /** Recorded, not fatal: the fragments and the plan disagree, but no data is at risk. */
  warnings: string[];
}

function casesOf(envelope: Record<string, unknown>): ResultCase[] {
  const raw = envelope.testCases;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is ResultCase => !!c && typeof (c as ResultCase).id === "string");
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === "string" && v.trim()) return v;
  return undefined;
}

export function mergeSuiteResults(input: MergeInput): MergeResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const plannedLane = new Map<string, CaseLane>();
  for (const p of input.planned) plannedLane.set(p.id, p.lane);

  /** id -> {row, fragment source}. A second fragment claiming the same id is fatal. */
  const merged = new Map<string, { row: ResultCase; source: string }>();

  for (const frag of input.fragments) {
    // Within ONE fragment a repeated id is a retry: the later row is the final verdict,
    // same rule as the per-case JSONL fold. ACROSS fragments it means the split leaked.
    const seenHere = new Map<string, ResultCase>();
    for (const c of casesOf(frag.envelope)) seenHere.set(c.id, c);

    for (const [id, row] of seenHere) {
      const prior = merged.get(id);
      if (prior) {
        errors.push(
          `case ${id} was reported by BOTH ${prior.source} and ${frag.source} — the lane split ` +
            `leaked, so this case would be counted twice and one verdict would be silently discarded`,
        );
        continue;
      }
      if (!plannedLane.has(id)) {
        // Keep it: a case that actually ran is more trustworthy than a plan that failed to
        // mention it. But say so, because it means the classifier and the run disagree.
        warnings.push(`case ${id} was reported by ${frag.source} but the lanes plan does not list it`);
      }
      merged.set(id, { row: { ...row, lane: frag.lane }, source: frag.source });
    }
  }

  // Every planned case must exist. Absent = the lane never reported it.
  for (const [id, lane] of plannedLane) {
    if (merged.has(id)) continue;
    const nonExecuting = NON_EXECUTING_LANES[lane];
    if (nonExecuting) {
      // Visible as a deliberate non-run, never as a quiet absence.
      merged.set(id, {
        row: { id, status: "SKIPPED", lane, notes: nonExecuting },
        source: "(plan)",
      });
      continue;
    }
    merged.set(id, {
      row: {
        id,
        status: "BLOCKED",
        lane,
        notes: `lane_lost: the ${lane} lane did not report this case`,
      },
      source: "(plan)",
    });
  }

  // Order: follow the plan, then any unplanned extras in the order they were reported.
  const ordered: ResultCase[] = [];
  for (const p of input.planned) {
    const hit = merged.get(p.id);
    if (hit) ordered.push(hit.row);
  }
  for (const [id, hit] of merged) {
    if (!plannedLane.has(id)) ordered.push(hit.row);
  }

  // Counts are RECOMPUTED from the rows, never summed from the fragment headers — a
  // fragment header is the writer's own claim about itself, and two writers' claims cannot
  // be added without double-counting whatever the merger just reconciled.
  const tally = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0 };
  for (const c of ordered) {
    const s = String(c.status ?? "").toUpperCase();
    if (COUNTED.has(s)) tally[s as keyof typeof tally]++;
  }
  // A status outside the four (PENDING, or anything unrecognised) is deliberately left
  // untallied rather than reclassified: the four counts then sum to LESS than totalCases,
  // which is how an incomplete suite stays visibly incomplete instead of being rounded into
  // a verdict. The existing readers already render that gap.
  const total = ordered.length;

  const first = input.fragments[0]?.envelope ?? {};
  const envelope: Record<string, unknown> = {
    suiteId: input.suiteId,
    suiteName: input.suiteName ?? firstString(first.suiteName) ?? "",
    runId: input.runId ?? firstString(first.runId) ?? "",
    browser: input.browser ?? firstString(first.browser) ?? "",
    environment: input.environment ?? firstString(first.environment) ?? "",
    startedAt: earliest(input.fragments, "startedAt"),
    completedAt: latest(input.fragments, "completedAt"),
    totalCases: total,
    // Scope provenance — absent on a normal run, so a full envelope is byte-identical to before.
    ...(input.caseFilter
      ? {
          scoped: true,
          caseFilter: input.caseFilter,
          /** The suite's real size before filtering — the denominator calibration must use. */
          unfilteredTotal: input.caseFilter.sourceCases,
        }
      : {}),
    passed: tally.PASS,
    failed: tally.FAIL,
    blocked: tally.BLOCKED,
    skipped: tally.SKIPPED,
    passRate: total > 0 ? `${((tally.PASS / total) * 100).toFixed(1)}%` : "0.0%",
    lanes: laneCounts(ordered),
    testCases: ordered,
    bugs: input.fragments.flatMap((f) => (Array.isArray(f.envelope.bugs) ? f.envelope.bugs : [])),
    errors: [...input.fragments.flatMap((f) => (Array.isArray(f.envelope.errors) ? f.envelope.errors : [])), ...warnings],
  };

  return { envelope, errors, warnings };
}

/** Per-lane row counts — without this a determinism trend cannot be read off history. */
function laneCounts(cases: readonly ResultCase[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cases) {
    const lane = c.lane ?? "unknown";
    out[lane] = (out[lane] ?? 0) + 1;
  }
  return out;
}

function earliest(fragments: ReadonlyArray<Fragment>, key: string): string {
  const values = fragments
    .map((f) => f.envelope[key])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .sort();
  return values[0] ?? "";
}

function latest(fragments: ReadonlyArray<Fragment>, key: string): string {
  const values = fragments
    .map((f) => f.envelope[key])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .sort();
  // Empty when ANY fragment is still open: a half-merged suite must not look finished,
  // because a set `completedAt` tells every reader the envelope is authoritative and stops
  // the live dashboard from folding in later per-case rows.
  if (values.length !== fragments.length || fragments.length === 0) return "";
  return values[values.length - 1];
}
