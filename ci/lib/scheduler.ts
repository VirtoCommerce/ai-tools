// Continuous-refill, lane-aware suite scheduler.
//
// Replaces `chunkArray(validSuites, MAX_PARALLEL)` + `await Promise.all(batch)`, which is a
// BARRIER per fixed batch: each batch costs its slowest suite and a freed slot is never
// refilled until the whole batch drains. Simulated against the real 123-suite manifest at
// concurrency 3, that costs `full` 1404 minutes (23.4 h) against 812 (13.5 h) for a
// continuous pool in longest-processing-time-first order — a 42% wall-clock tax for
// nothing. `smoke` and `critical` lose ~45% the same way.
//
// Three design points worth keeping in mind before changing anything here:
//
//  1. LPT + continuous refill is already essentially optimal at concurrency 3 — it packs
//     `full`'s browser lane to 812 minutes against a theoretical floor of 810 (Sum/3).
//     Do NOT invest in a smarter bin-packer; the only remaining levers are lane count and
//     not running the work at all.
//  2. LPT degrades GRACEFULLY under estimate error: with useless estimates it converges on
//     the unordered pool result (926 min), still far better than the barrier. That matters
//     because `estimatedMinutes` is hand-maintained and provably wrong for the 14 already
//     deterministic suites (they carry LLM-era numbers ~1.11 min/case against a measured
//     0.10). Order the pool first; fix the estimates later, from recorded history.
//  3. A slot that cannot run a suite QUEUES it, never downgrades it. `playwright-firefox`
//     cannot click on this storefront or the Admin SPA (confirmed 6x independently; the
//     root cause is in the `@playwright/mcp` layer), so a firefox placement on a
//     click-driven suite costs a whole wasted attempt. An idle lane is strictly cheaper.

import { minutesOf, type SuiteCapsInput } from "./suite-caps.ts";

/**
 * Which pool a suite competes in. `browser` consumes a browser slot; `fastpath` is
 * runner-native GraphQL (no browser, per test-runner-agent.md Phase 0); `deterministic` is
 * a manifest-declared `runner` (e.g. 048c -> layout-runner). The three do not share slots,
 * which is why splitting them shortens `full` by a further ~114 minutes on its own.
 */
export type LaneKind = "browser" | "fastpath" | "deterministic";

export interface SchedulableSuite extends SuiteCapsInput {
  id: string;
  lane: LaneKind;
  /** Browser servers this suite must NOT be placed on (derived `clickDriven` -> firefox). */
  browserDenyList?: readonly string[];
  /** Browser server this suite REQUIRES (manifest `preferredBrowser`, e.g. 039/041). */
  preferredBrowser?: string;
}

/** One unit of concurrency. `server` is set only for the browser lane. */
export interface PoolSlot {
  id: string;
  server?: string;
}

// --- Pure ordering + makespan model ------------------------------------------------

/**
 * Longest-processing-time-first. Ties break on `id` so the order is deterministic and a
 * unit test can assert it (an unstable sort would make the makespan assertion flaky).
 */
export function orderLpt<T extends SuiteCapsInput & { id: string }>(suites: readonly T[]): T[] {
  return [...suites].sort((a, b) => {
    const d = minutesOf(b) - minutesOf(a);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Makespan of a continuous pool: assign each suite, in the given order, to whichever slot
 * is currently least loaded. Pure and side-effect free — used both by the tests and to log
 * a predicted makespan so the scheduler's model can be scored against reality later.
 *
 * Deliberately ignores slot affinity (deny lists / preferred browsers): it is a planning
 * model, not the dispatcher. Affinity can only make the real makespan longer, so this is a
 * lower bound — do not present it as a guarantee.
 */
export function simulateMakespan(
  suites: readonly SuiteCapsInput[],
  concurrency: number,
): { makespanMinutes: number; perSlotMinutes: number[] } {
  const slots = new Array(Math.max(1, concurrency)).fill(0) as number[];
  for (const suite of suites) {
    let lightest = 0;
    for (let i = 1; i < slots.length; i++) if (slots[i] < slots[lightest]) lightest = i;
    slots[lightest] += minutesOf(suite);
  }
  return { makespanMinutes: Math.max(...slots), perSlotMinutes: slots };
}

/** Makespan of the OLD fixed-batch barrier, kept so the gain is asserted, not asserted-about. */
export function simulateBatchBarrierMakespan(
  suites: readonly SuiteCapsInput[],
  batchSize: number,
): number {
  const size = Math.max(1, batchSize);
  let total = 0;
  for (let i = 0; i < suites.length; i += size) {
    const batch = suites.slice(i, i + size);
    total += Math.max(...batch.map(minutesOf));
  }
  return total;
}

// --- Slot affinity -----------------------------------------------------------------

/** Can this suite run on this slot? Deny list wins over preference. */
export function slotAccepts(suite: SchedulableSuite, slot: PoolSlot): boolean {
  if (slot.server) {
    if (suite.browserDenyList?.includes(slot.server)) return false;
    if (suite.preferredBrowser && suite.preferredBrowser !== slot.server) return false;
  }
  return true;
}

// --- Budget ledger -----------------------------------------------------------------

/**
 * Reserve-at-dispatch / settle-at-completion budget ledger.
 *
 * The old code computed `perSuiteBudget` per BATCH and handed the same figure to every
 * suite in it, so with 3 concurrent suites the per-suite caps could sum to 3x the global
 * remainder. A ledger makes over-commitment impossible: `reserve` refuses when the amount
 * is not actually available.
 */
export class BudgetLedger {
  private readonly reservations = new Map<string, number>();
  private spent = 0;

  constructor(readonly total: number) {}

  /** Not yet spent and not yet reserved. */
  get available(): number {
    return this.total - this.spent - this.reserved;
  }

  get reserved(): number {
    let sum = 0;
    for (const amount of this.reservations.values()) sum += amount;
    return sum;
  }

  get totalSpent(): number {
    return this.spent;
  }

  /** Reserve for a suite about to be dispatched. Returns the granted amount, or null. */
  reserve(id: string, requested: number): number | null {
    if (requested <= 0) return null;
    if (requested > this.available) return null;
    this.reservations.set(id, requested);
    return requested;
  }

  /** Release the reservation and book what was actually spent. */
  settle(id: string, actualUsd: number): void {
    this.reservations.delete(id);
    this.spent += Math.max(0, actualUsd);
  }

  /** True when not even `amount` is left — the signal to stop dispatching and defer. */
  exhaustedFor(amount: number): boolean {
    return this.available < amount;
  }
}

// --- The pool ----------------------------------------------------------------------

export interface DispatchDecision {
  ok: boolean;
  /** Why this suite cannot be dispatched (recorded on the deferred result). */
  reason?: string;
  /** True when the blocker applies to every remaining suite (e.g. budget exhausted). */
  stopAll?: boolean;
}

export interface PoolOutcome<T> {
  suite: SchedulableSuite;
  slot?: PoolSlot;
  result?: T;
  /** Set when the suite was never attempted. */
  deferredReason?: string;
}

/**
 * Run `suites` through `slots` with continuous refill: the moment one settles, the head of
 * the queue that the freed slot can accept is dispatched. No barrier.
 *
 * `canDispatch` is consulted immediately before each dispatch (that is where the budget
 * ledger hooks in). A `stopAll` refusal defers every remaining suite — `deferred` is a
 * distinct outcome from a failure, because nothing was attempted.
 *
 * A suite no remaining slot can ever accept is deferred with a reason rather than silently
 * dropped or forced onto a slot that cannot run it.
 */
export async function runLanePool<T>(opts: {
  suites: readonly SchedulableSuite[];
  slots: readonly PoolSlot[];
  run: (suite: SchedulableSuite, slot: PoolSlot) => Promise<T>;
  canDispatch?: (suite: SchedulableSuite) => DispatchDecision;
  onDispatch?: (suite: SchedulableSuite, slot: PoolSlot) => void;
}): Promise<Array<PoolOutcome<T>>> {
  const { suites, slots, run, canDispatch, onDispatch } = opts;
  const outcomes: Array<PoolOutcome<T>> = [];

  if (suites.length === 0) return outcomes;
  if (slots.length === 0) {
    for (const suite of suites) outcomes.push({ suite, deferredReason: "no slot configured for this lane" });
    return outcomes;
  }

  const queue = orderLpt(suites as readonly (SchedulableSuite & { id: string })[]);
  const freeSlots: PoolSlot[] = [...slots];
  const inFlight = new Map<Promise<void>, true>();
  let stopped: string | null = null;

  const deferRest = (reason: string): void => {
    while (queue.length > 0) outcomes.push({ suite: queue.shift()!, deferredReason: reason });
  };

  while (queue.length > 0 || inFlight.size > 0) {
    // Dispatch into every slot we can fill right now.
    let dispatchedAny = false;
    while (!stopped && freeSlots.length > 0 && queue.length > 0) {
      const slot = freeSlots[0];
      const index = queue.findIndex((s) => slotAccepts(s, slot));
      if (index === -1) break; // this slot can take nothing currently queued

      const suite = queue[index];
      const decision = canDispatch?.(suite) ?? { ok: true };
      if (!decision.ok) {
        if (decision.stopAll) {
          stopped = decision.reason ?? "dispatch halted";
          break;
        }
        // Suite-specific refusal: record and drop it from the queue, keep going.
        queue.splice(index, 1);
        outcomes.push({ suite, deferredReason: decision.reason ?? "dispatch refused" });
        continue;
      }

      queue.splice(index, 1);
      freeSlots.shift();
      dispatchedAny = true;
      onDispatch?.(suite, slot);

      const task = (async () => {
        try {
          const result = await run(suite, slot);
          outcomes.push({ suite, slot, result });
        } finally {
          freeSlots.push(slot);
        }
      })();
      const tracked = task.then(
        () => {
          inFlight.delete(tracked);
        },
        () => {
          inFlight.delete(tracked);
        },
      );
      inFlight.set(tracked, true);
    }

    if (stopped) {
      deferRest(stopped);
      break;
    }

    if (inFlight.size === 0) {
      if (queue.length === 0) break;
      if (!dispatchedAny) {
        // Nothing running and nothing dispatchable: no slot will ever accept these.
        deferRest("no configured slot accepts this suite (browser deny-list / preferred browser)");
        break;
      }
      continue;
    }

    await Promise.race(inFlight.keys());
  }

  // Drain anything still running (the loop exits early only via `stopped`).
  while (inFlight.size > 0) await Promise.race(inFlight.keys());

  return outcomes;
}
