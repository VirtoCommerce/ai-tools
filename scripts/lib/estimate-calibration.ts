/**
 * estimate-calibration — turn measured run durations into a PROPOSED `estimatedMinutes`, for a
 * human to review.
 *
 * `estimatedMinutes` is a hand-maintained constant, which `.claude/rules/test-data.md` §GOLDEN
 * RULE forbids, and it is wrong by one to two orders of magnitude on the runner-native suites:
 * suite `050m` declares **245 minutes** for 119 cases and ran in **2.77** (`REG-2026-08-26-1631`,
 * 14:31:02.678 → 14:33:48.842). Across the 13 fastpath suites the overstatement is ×18 to ×88.
 *
 * WHY IT MATTERS, measured rather than assumed. Two of the three consequences turn out to be
 * negligible and one is a live defect:
 *
 *   - LPT ordering: immaterial. Once the estimates are right, the difference between the best and
 *     worst dispatch order on the fastpath lane is **0.21 minutes**. Worth raising, not fixing.
 *   - Derived caps: safe. `timeoutMsFor` scales with the estimate, so an overstatement makes the
 *     timeout too generous, never too tight.
 *   - **Change-scoped trimming: broken.** `suite-selection.ts` sorts by value-per-minute with
 *     `estimatedMinutes` as the denominator, so `--target 60` excluded `050m` — a suite that
 *     costs 2.8 minutes — as too expensive to fit. That is the reason this module exists.
 *
 * IT NEVER WRITES THE MANIFEST. A diff for review only, and the reason is not caution for its own
 * sake: a single anomalous run (a flaky env, a truncated pass) that silently rewrote the manifest
 * would reorder dispatch and re-scope every future selection, with no reviewer in the loop. A
 * stale estimate is visible in a diff; a laundered one is not.
 *
 * TWO CONFIDENCE TIERS, because inert is worse than careful. A **proposal** needs `k >= 3`
 * observations so one run cannot move a number. A single observation is still reported, as an
 * **observation**, so the reviewer sees `050m: declared 245, observed 2.77 (×88, n=1)` today
 * rather than waiting three runs to learn it. Only proposals are diffable.
 *
 * Pure: the caller supplies the observations and the manifest rows.
 */

export const CALIBRATION_VERSION = "1.0.0";

/** Minimum observations before a number may be PROPOSED (as opposed to merely reported). */
export const MIN_OBSERVATIONS_FOR_PROPOSAL = 3;

export interface DurationObservation {
  readonly suiteId: string;
  readonly runId: string;
  readonly durationMinutes: number;
  /** Cases that actually reported. A truncated run must not calibrate a full suite. */
  readonly casesReported?: number;
  readonly totalCases?: number;
  /**
   * The run deliberately executed only a SLICE of the suite (`/qa-regression --cases <tier>`).
   *
   * Distinct from truncation, and it needs its own flag rather than leaning on the coverage ratio
   * below: on a scoped run `casesReported` and `totalCases` are BOTH the filtered count, so
   * coverage computes to 1.0 and the truncation guard cannot see anything wrong. A 6-of-44
   * Critical-only run would otherwise calibrate `estimatedMinutes` for the whole 44-case suite
   * from a sixth of its work — and that number feeds `suite-selection.ts`'s `--target`, i.e. the
   * time budget the scoping exists to satisfy. A measurement must not calibrate the instrument
   * that produced it.
   */
  readonly scoped?: boolean;
}

export interface CalibratableSuite {
  readonly id: string;
  readonly name: string;
  readonly testCount: number;
  readonly estimatedMinutes: number;
}

export type CalibrationTier = "proposal" | "observation" | "insufficient";

export interface CalibrationRow {
  readonly suiteId: string;
  readonly name: string;
  readonly declaredMinutes: number;
  /** Median of the usable observations, or null when there are none. */
  readonly measuredMinutes: number | null;
  readonly observations: number;
  /** `declared / measured`, or null. >1 means the manifest overstates. */
  readonly ratio: number | null;
  readonly tier: CalibrationTier;
  /** Observations excluded, with the reason — never dropped silently. */
  readonly rejected: readonly { readonly runId: string; readonly reason: string }[];
}

export interface CalibrationResult {
  readonly calibrationVersion: string;
  readonly rows: readonly CalibrationRow[];
  /** Rows a reviewer could apply today. Empty is a normal, honest state. */
  readonly proposals: readonly CalibrationRow[];
  /** Measured but not yet proposable — the interesting half while history is thin. */
  readonly observationsOnly: readonly CalibrationRow[];
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A truncated run measures a fraction of the suite and must not be scaled up to stand for it.
 *
 * Real example: `REG-2026-08-03-1900` reported 8 of suite `078-p3`'s 38 cases. Extrapolating that
 * elapsed time to 38 cases would produce a confident number describing a run that never happened,
 * and the plan's own rule is that truncation must never be able to report as a normal result.
 */
export function isUsableObservation(o: DurationObservation): { usable: boolean; reason?: string } {
  if (!Number.isFinite(o.durationMinutes) || o.durationMinutes <= 0) {
    return { usable: false, reason: "no positive duration" };
  }
  // Checked BEFORE the coverage ratio, because on a scoped run that ratio is 1.0 by construction
  // and would wave the observation straight through.
  if (o.scoped) {
    return {
      usable: false,
      reason:
        o.totalCases !== undefined
          ? `scoped run — only ${o.casesReported ?? o.totalCases} case(s) of the suite were in scope`
          : "scoped run — a --cases slice cannot calibrate the whole suite",
    };
  }
  if (o.totalCases !== undefined && o.casesReported !== undefined) {
    if (o.totalCases <= 0) return { usable: false, reason: "suite reports zero cases" };
    const coverage = o.casesReported / o.totalCases;
    if (coverage < 0.95) {
      return {
        usable: false,
        reason: `truncated run — ${o.casesReported}/${o.totalCases} cases reported (${Math.round(coverage * 100)}%)`,
      };
    }
  }
  return { usable: true };
}

export function calibrate(
  suites: readonly CalibratableSuite[],
  observations: readonly DurationObservation[],
): CalibrationResult {
  const bySuite = new Map<string, DurationObservation[]>();
  for (const o of observations) {
    const list = bySuite.get(o.suiteId) ?? [];
    list.push(o);
    bySuite.set(o.suiteId, list);
  }

  const rows: CalibrationRow[] = suites.map((s) => {
    const all = bySuite.get(s.id) ?? [];
    const rejected: { runId: string; reason: string }[] = [];
    const usable: number[] = [];
    for (const o of all) {
      const v = isUsableObservation(o);
      if (v.usable) usable.push(o.durationMinutes);
      else rejected.push({ runId: o.runId, reason: v.reason ?? "unusable" });
    }
    const measured = usable.length > 0 ? Math.round(median(usable) * 100) / 100 : null;
    const tier: CalibrationTier =
      usable.length >= MIN_OBSERVATIONS_FOR_PROPOSAL ? "proposal" : usable.length > 0 ? "observation" : "insufficient";
    return {
      suiteId: s.id,
      name: s.name,
      declaredMinutes: s.estimatedMinutes,
      measuredMinutes: measured,
      observations: usable.length,
      ratio: measured && measured > 0 ? Math.round((s.estimatedMinutes / measured) * 100) / 100 : null,
      tier,
      rejected,
    };
  });

  return {
    calibrationVersion: CALIBRATION_VERSION,
    rows,
    proposals: rows.filter((r) => r.tier === "proposal"),
    observationsOnly: rows.filter((r) => r.tier === "observation"),
  };
}

/**
 * The review diff. Sorted by how wrong the number is, because that is what a reviewer wants
 * first — and the observation-only tier is printed too, clearly separated, so a thin history
 * still tells them something.
 */
export function formatCalibration(r: CalibrationResult): string {
  const out: string[] = [];
  out.push(`=== estimatedMinutes calibration (v${r.calibrationVersion}) ===`);
  out.push(
    `${r.proposals.length} proposal(s) (>=${MIN_OBSERVATIONS_FOR_PROPOSAL} runs) · ` +
      `${r.observationsOnly.length} measured but not yet proposable · ` +
      `${r.rows.length - r.proposals.length - r.observationsOnly.length} unmeasured`,
  );
  out.push("");
  out.push("This NEVER writes config/test-suites.json. Apply a proposal by hand after reading it:");
  out.push("one anomalous run that silently rewrote the manifest would reorder dispatch and");
  out.push("re-scope every future change-scoped selection with no reviewer in the loop.");

  const table = (rows: readonly CalibrationRow[], title: string) => {
    if (rows.length === 0) return;
    out.push("");
    out.push(`${title}:`);
    out.push("  suite  declared  measured  ratio   n  name");
    for (const row of [...rows].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))) {
      out.push(
        `  ${row.suiteId.padEnd(6)} ${String(row.declaredMinutes).padStart(8)} ` +
          `${(row.measuredMinutes ?? 0).toFixed(2).padStart(9)} ` +
          `${row.ratio !== null ? `x${row.ratio.toFixed(0)}`.padStart(6) : "     -"} ` +
          `${String(row.observations).padStart(3)}  ${row.name.slice(0, 40)}`,
      );
    }
  };

  table(r.proposals, `PROPOSALS — reviewable now`);
  table(r.observationsOnly, `OBSERVED — real measurements, below the ${MIN_OBSERVATIONS_FOR_PROPOSAL}-run bar`);

  const rejected = r.rows.flatMap((row) => row.rejected.map((x) => ({ suiteId: row.suiteId, ...x })));
  if (rejected.length > 0) {
    out.push("");
    out.push(`REJECTED observations — reported, never dropped in silence:`);
    for (const x of rejected) out.push(`  ${x.suiteId.padEnd(6)} ${x.runId}  ${x.reason}`);
  }
  return out.join("\n");
}
