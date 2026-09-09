// Bounded batching: give one agent session SEVERAL small suites instead of one each.
//
// WHY. Every dispatch pays the always-loaded preamble (~14.3K tokens as of 2026-09-09) plus
// `SETUP_TURNS` of env check / sign-in / first navigate before its first case. On `full`'s browser
// lane that is 110 dispatches for 3,691 cases — the preamble alone is ~1.57M tokens, and the setup
// turns are paid 110 times for work that is identical each time.
//
// WHY NOT ONE AGENT PER LANE, which is what the 2026-09-07 audit's §6 item 9 actually proposed.
// That would be 3 sessions of ~1,230 cases. The corpus's own measurement is an artefactual-BLOCKED
// rate of **19.9% overall and 28.6% on suites of 81+ cases** (`skills/qa-test/coverage-triage.md`):
// session length is the driver, so item 9 as written buys tokens by degrading the verdict — in the
// pipeline whose only product is a verdict. A bound is what makes the saving safe to take.
//
// So: batch UP TO a case budget, never past it. Measured on `full`'s browser lane (110 suites, 3,694
// cases, 3 slots) at budget 60: **110 dispatches -> 74**, for **+0.1% makespan** — one minute. At 80
// it is 56 dispatches but +1.3% AND the batch sits on the 81-case degradation line, so 60 is chosen
// on evidence, not taste.
//
// Be precise about what this does and does not do to session length. It creates NO session longer
// than the longest suite that already existed: every batch is <= the budget except a lone oversized
// suite, which is unchanged. It does not SHORTEN the worst sessions either — `full`'s longest batch
// is 116 cases because one suite is 116 cases on its own. Shortening those is suite splitting
// (the `078` precedent), a separate change.
//
// Two invariants the grouping must not break, both load-bearing elsewhere:
//   1. A batch is dispatched to ONE slot, so every suite in it must be runnable on that slot. Only
//      suites with an IDENTICAL affinity signature are grouped — conservative on purpose: a union of
//      deny-lists that still leaves a slot free is sound in theory and one manifest edit away from
//      not being, and `039`/`041` (Payment — CyberSource, `preferredBrowser`) are exactly the suites
//      a subtle affinity bug would strand.
//   2. A suite is never SPLIT. A suite larger than the budget is its own batch and stays whole;
//      splitting a suite is `suites:lanes`' job and changes what a result file means.

import { minutesOf, type SuiteCapsInput } from "./suite-caps.ts";

/**
 * Case budget for one agent session. 60 sits below the 81-case line where the corpus measures
 * artefactual-BLOCKED jumping from 19.9% to 28.6%, with room to spare — the point is to stay inside
 * the better-behaved population, not to sit on its boundary.
 */
export const DEFAULT_MAX_BATCH_CASES = 60;

export interface BatchableSuite extends SuiteCapsInput {
  id: string;
  browserDenyList?: readonly string[];
  preferredBrowser?: string;
}

export interface SuiteBatch {
  /** `039` for a lone suite, `039+041` for a group — readable in a dispatch log. */
  id: string;
  suites: BatchableSuite[];
  /** Summed, so LPT ordering and the caps formulas work on a batch unchanged. */
  testCount: number;
  estimatedMinutes: number;
  browserDenyList?: readonly string[];
  preferredBrowser?: string;
}

/** Suites may share a session only if one slot can accept all of them. */
function affinityKey(s: BatchableSuite): string {
  const deny = [...(s.browserDenyList ?? [])].sort().join(",");
  return `${s.preferredBrowser ?? ""}|${deny}`;
}

const casesOf = (s: SuiteCapsInput): number => Math.max(0, s.testCount ?? 0);

/**
 * Group an LPT-ordered suite list into dispatch units of at most `maxCases` cases.
 *
 * Longest-first within each affinity group, then greedy fill: a long suite ends up alone (its own
 * batch) and the short tail clusters, which is exactly where the per-dispatch overhead was being
 * paid for the least work. Output is LPT-ordered by summed minutes so the scheduler's packing model
 * is unchanged — it simply sees fewer, slightly larger units.
 */
export function batchSuites(
  suites: readonly BatchableSuite[],
  opts: { maxCases?: number } = {},
): SuiteBatch[] {
  const maxCases = Math.max(1, opts.maxCases ?? DEFAULT_MAX_BATCH_CASES);
  const groups = new Map<string, BatchableSuite[]>();
  for (const s of suites) {
    const key = affinityKey(s);
    const bucket = groups.get(key);
    if (bucket) bucket.push(s);
    else groups.set(key, [s]);
  }

  const batches: SuiteBatch[] = [];
  for (const bucket of groups.values()) {
    // Longest-first, ties on id — same rule as `orderLpt`, kept local so this module stays pure.
    const ordered = [...bucket].sort((a, b) => {
      const d = minutesOf(b) - minutesOf(a);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
    let current: BatchableSuite[] = [];
    let cases = 0;
    const flush = (): void => {
      if (current.length === 0) return;
      batches.push(toBatch(current));
      current = [];
      cases = 0;
    };
    for (const s of ordered) {
      const n = casesOf(s);
      // A suite bigger than the budget goes alone rather than being split or dragging others past it.
      if (n >= maxCases) {
        flush();
        batches.push(toBatch([s]));
        continue;
      }
      if (cases + n > maxCases) flush();
      current.push(s);
      cases += n;
    }
    flush();
  }

  return batches.sort((a, b) => {
    const d = minutesOf(b) - minutesOf(a);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function toBatch(suites: readonly BatchableSuite[]): SuiteBatch {
  const first = suites[0];
  return {
    id: suites.map((s) => s.id).join("+"),
    suites: [...suites],
    testCount: suites.reduce((sum, s) => sum + casesOf(s), 0),
    estimatedMinutes: suites.reduce((sum, s) => sum + minutesOf(s), 0),
    ...(first.preferredBrowser ? { preferredBrowser: first.preferredBrowser } : {}),
    ...(first.browserDenyList?.length ? { browserDenyList: [...first.browserDenyList] } : {}),
  };
}
