/**
 * suite-selection — decide WHICH suites a change needs, deterministically.
 *
 * "Not running a suite beats running it fast." Every other piece of this work made the same
 * corpus cheaper to execute (`full` 23.4 h → 14 h 15 m, `smoke` 83 → 40 min). This one asks
 * whether a given change needs the whole corpus at all: 50 of 127 suites declare
 * `requiresModules`, so a single-module PR plausibly needs a handful of suites, not 119.
 *
 * WHY IT REPLACES AN LLM. `ci/run-full-cycle.ts` asks an agent to print
 * `AFFECTED_SUITES: <ids>` and parses it with a regex (`:104` and `:113`). That has already
 * hallucinated — the `REG-2026-08-24-1806` notes carry 32 claimed new-case IDs that do not
 * exist, each one exactly the next sequential number after a real suite's maximum. A selection
 * derived from `git diff` and the manifest cannot invent a suite id, costs nothing, and gives
 * the same answer twice.
 *
 * FAIL-OPEN — and note this INVERTS the rule the rest of this work follows.
 * `case-classifier.ts` fails CLOSED: any doubt routes a case to the browser lane, because
 * claiming a case is machine-ready when it is not manufactures a BLOCKED that reads as a
 * product failure. Here the expensive direction is the opposite one. Selecting a suite that
 * turns out to be irrelevant costs its `estimatedMinutes`; NOT selecting one that would have
 * caught a regression ships the regression. So:
 *
 *   - a changed path that maps to nothing WIDENS the selection, and is reported in
 *     `unmappedPaths` so the gap is visible rather than silently absorbed;
 *   - narrowing inside a repo happens only when a path segment matches the manifest's OWN
 *     vocabulary, never on a guess;
 *   - the risk floor is never trimmed, whatever the makespan target says.
 *
 * NO HAND-MAINTAINED PATH MAP. The temptation is a table from `client-app/shared/checkout/…`
 * to a suite list. That is the transcribed constant `.claude/rules/test-data.md` §GOLDEN RULE
 * forbids, and it fails silently — a renamed directory produces a narrower selection with no
 * error anywhere. Instead the path's own segments are matched against the manifest's `domain`
 * and `tags` values, so the vocabulary comes from the same file the suites do.
 *
 * WHAT THIS CANNOT PROVE. Whether a change-scoped selection catches what `full` catches is a
 * question about missed regressions, and answering it needs run history that does not exist yet
 * (`history.json` is un-ignored per A4, but no run has written one). So the history signal
 * below is a documented no-op today, and the whole selector is meant to run in shadow beside a
 * periodic `full` for several cycles before anyone trusts it as the default. Shipping it as the
 * default now would be trading a measured cost for an unmeasured risk.
 *
 * Pure: no filesystem, no git, no clock beyond what the caller injects. The CLI in
 * `scripts/regression/select-suites.ts` supplies the diff and the manifest.
 */

import type { LaneConcurrency, PlannableSuite } from "../../ci/lib/run-plan.js";
import { buildRunPlan } from "../../ci/lib/run-plan.js";

export const SELECTOR_VERSION = "1.0.0";

/** Why a suite is in the selection. Several may apply; all are kept for the report. */
export type SelectionReasonKind =
  | "change" // a changed path maps to it
  | "risk-floor" // P0 or critical-ui-scope — never trimmed
  | "history" // flagged flaky or dropping
  | "rotation" // staleness top-up so untouched suites do not rot silently
  | "widened"; // nothing mapped, so the net was cast wider on purpose

export interface SelectionReason {
  readonly kind: SelectionReasonKind;
  readonly detail: string;
}

/** The subset of a manifest suite this module needs. Keeps the tests fixture-free. */
export interface SelectableSuite {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly domain?: string;
  readonly layer?: string;
  readonly priority?: string;
  readonly tags?: readonly string[];
  readonly testCount?: number;
  readonly estimatedMinutes?: number;
  readonly requiresModules?: readonly string[];
  readonly clickDriven?: boolean;
  readonly runner?: string;
  readonly preferredBrowser?: string;
  readonly agent?: string;
  /**
   * Execution lane, SUPPLIED by the caller (`ci/lib/lane-classifier.ts` `classifyLane`).
   *
   * Not derived here. `classifyLane` reads the suite CSV to decide whether it is runner-native,
   * which this module cannot do and stay pure — and a local `runner ? "deterministic" : "browser"`
   * shortcut is a second implementation of a decision that already exists. It measurably
   * disagreed: putting the 13 fastpath suites on the browser lane inflated the whole-corpus
   * baseline from 855 to 1161 minutes, i.e. it would have overstated this selector's own saving.
   */
  readonly lane?: "browser" | "fastpath" | "deterministic";
}

/** One changed file, with the repository it changed in. */
export interface ChangedPath {
  /** `vc-module-catalog`, `vc-frontend`, `vc-platform`, … as `fix-repos.json` names them. */
  readonly repo: string;
  readonly path: string;
}

/** Suite → the repos that own its code. Supplied by the caller (resolveSuiteSource). */
export type SuiteRepoIndex = ReadonlyMap<string, readonly string[]>;

/** Per-suite history signal. Empty until a run writes `history.json` — see the header. */
export interface HistorySignal {
  readonly suiteId: string;
  readonly flaky?: boolean;
  readonly consecutiveDrops?: number;
}

export interface SelectionInput {
  readonly suites: readonly SelectableSuite[];
  readonly changed: readonly ChangedPath[];
  readonly suiteRepos: SuiteRepoIndex;
  readonly history?: readonly HistorySignal[];
  /** Suite ids in staleness order (oldest audit first) — `audit-queue.ts` produces this. */
  readonly rotation?: readonly string[];
  readonly rotationCount?: number;
  /** Trim until the predicted makespan fits. `null` = no trimming. */
  readonly targetMinutes?: number | null;
  readonly concurrency: LaneConcurrency;
}

export interface SelectedSuite {
  readonly id: string;
  readonly name: string;
  readonly estimatedMinutes: number;
  readonly reasons: readonly SelectionReason[];
}

export interface ExcludedSuite {
  readonly id: string;
  readonly name: string;
  readonly estimatedMinutes: number;
  /** Why it is not running. This is coverage DEBT, stated, not a silent omission. */
  readonly reason: string;
}

export interface SelectionResult {
  readonly selectorVersion: string;
  readonly selected: readonly SelectedSuite[];
  readonly excluded: readonly ExcludedSuite[];
  readonly predictedMakespanMinutes: number;
  readonly fullMakespanMinutes: number;
  /** Changed paths that mapped to no suite. They WIDEN the selection; see the header. */
  readonly unmappedPaths: readonly string[];
  /** True when a mapping gap forced the wider net. */
  readonly widened: boolean;
  /**
   * How many of the predicted minutes come from suites whose `estimatedMinutes` is known to be
   * unreliable. Reported so a target overrun does not read as "too much was selected" when the
   * real cause is a number that is ×18–×88 out.
   */
  readonly unreliableEstimateMinutes: number;
}

const RISK_TAGS = new Set(["critical-ui-scope"]);
const DEFAULT_ROTATION_COUNT = 3;

function minutesOf(s: SelectableSuite): number {
  return s.estimatedMinutes ?? 0;
}

/**
 * Suites whose `estimatedMinutes` is known to be unreliable, and must therefore not be trimmed
 * for being "expensive".
 *
 * Measured: suite `050m` declares 245 minutes and ran in **2.77** (`REG-2026-08-26-1631`), and the
 * overstatement is ×18–×88 across every runner-native suite. Trimming sorts by value per minute
 * with `estimatedMinutes` as the denominator, so `--target 60` excluded `050m` — a suite that
 * costs under three minutes — as too costly to fit. That is not a rounding problem, it is the
 * selector acting on a number that is wrong by two orders of magnitude.
 *
 * A suite with its own runner (`fastpath`/`deterministic`) does not spend an agent session, and
 * its cost is dominated by network round-trips rather than by anything the manifest models. Until
 * `npm run regression:recalibrate` has three runs per suite to propose real numbers, such a suite
 * is treated as effectively free by the trimmer: keeping it costs a couple of minutes, and
 * dropping it costs whatever it was going to catch.
 */
function estimateIsUnreliable(s: SelectableSuite): boolean {
  return s.lane === "fastpath" || s.lane === "deterministic" || Boolean(s.runner);
}

/**
 * The manifest's own narrowing vocabulary: every `domain` and every `tag` any suite declares,
 * lower-cased. Derived, so a renamed domain changes the vocabulary rather than stranding a
 * hand-written table.
 */
export function manifestVocabulary(suites: readonly SelectableSuite[]): Set<string> {
  const vocab = new Set<string>();
  for (const s of suites) {
    if (s.domain) vocab.add(s.domain.toLowerCase());
    for (const t of s.tags ?? []) vocab.add(t.toLowerCase());
  }
  return vocab;
}

/**
 * Tokens a changed path contributes, kept only if the manifest knows the word.
 *
 * `client-app/shared/checkout/components/x.vue` → `checkout` when some suite is tagged
 * `checkout`. A path whose segments the manifest has never heard of contributes NOTHING, which
 * is what makes the wider net kick in rather than a narrower wrong one.
 */
export function pathTokens(path: string, vocab: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const consider = (t: string) => {
    if (t && vocab.has(t)) out.push(t);
  };
  for (const raw of path.split(/[\\/]/)) {
    const seg = raw.replace(/\.[A-Za-z0-9]+$/, "");
    if (!seg) continue;
    consider(seg.toLowerCase());
    // Split the segment the way real paths are actually written, then match each piece EXACTLY.
    // A .NET module path is `VirtoCommerce.CatalogModule.Data`, so without splitting on dots and
    // CamelCase boundaries the primary signal would find nothing in the entire backend — which
    // is how a "narrowing" ends up selecting only the risk floor and calling it a scoped run.
    for (const part of seg.split(/[.\-_]/)) {
      consider(part.toLowerCase());
      for (const word of part.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/)) {
        consider(word.toLowerCase());
        // `CatalogModule` → `catalog`: strip the one structural suffix .NET module names all
        // carry. Only this exact suffix, and only on an exact vocabulary hit afterwards — a
        // prefix match would let `cart` capture `cartridge`.
        const m = /^(.+?)(module|service|controller)$/i.exec(word);
        if (m) consider(m[1].toLowerCase());
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Layers a changed repo touches, derived from the suites that name it.
 *
 * Needed because the repo index is measurably INCOMPLETE: `resolveSuiteSource` resolves modules
 * for 117 of 127 suites but repos for only 44, since `reposForModule` reports router-matched
 * names only. `vc-frontend` names just 7 suites while 53 carry `layer: frontend`. Treating the
 * repo index as the whole truth would therefore make a vc-frontend change select 7 suites and
 * skip 46 — fail-CLOSED, in the one module that must fail open. So when nothing narrows, the
 * fallback is the layer, not the repo's 7.
 */
export function layersForRepo(
  repo: string,
  suites: readonly SelectableSuite[],
  suiteRepos: SuiteRepoIndex,
): string[] {
  const layers = new Set<string>();
  for (const s of suites) {
    if (!(suiteRepos.get(s.id) ?? []).includes(repo)) continue;
    if (s.layer) layers.add(s.layer);
  }
  return [...layers].sort();
}

function suiteMatchesTokens(s: SelectableSuite, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const own = new Set<string>([
    ...(s.domain ? [s.domain.toLowerCase()] : []),
    ...(s.tags ?? []).map((t) => t.toLowerCase()),
  ]);
  return tokens.some((t) => own.has(t));
}

function toPlannable(s: SelectableSuite): PlannableSuite {
  return {
    id: s.id,
    description: s.name,
    lane: s.lane ?? (s.runner ? "deterministic" : "browser"),
    testCount: s.testCount ?? 0,
    estimatedMinutes: minutesOf(s),
    ...(s.clickDriven ? { browserDenyList: ["playwright-firefox"] as const } : {}),
    ...(s.preferredBrowser ? { preferredBrowser: s.preferredBrowser } : {}),
  };
}

function makespanOf(suites: readonly SelectableSuite[], concurrency: LaneConcurrency): number {
  if (suites.length === 0) return 0;
  return buildRunPlan(suites.map(toPlannable), concurrency).makespanMinutes;
}

/**
 * Trim order: cheapest coverage first, i.e. drop the suite with the WORST value per minute.
 *
 * `risk` is a small integer (P0 outranks P1) and `staleness` is the suite's position in the
 * rotation queue, so a suite that is both low-risk and recently audited is dropped before one
 * that is neither. Ties break on id so the result is reproducible — a selector that returns a
 * different set for the same input cannot be shadow-compared against anything.
 */
function valuePerMinute(
  s: SelectableSuite,
  reasons: readonly SelectionReason[],
  rotationIndex: number,
): number {
  const risk = s.priority === "P0" ? 4 : s.priority === "P1" ? 3 : s.priority === "P2" ? 2 : 1;
  const changeWeight = reasons.some((r) => r.kind === "change") ? 3 : 1;
  const historyWeight = reasons.some((r) => r.kind === "history") ? 2 : 1;
  const staleness = rotationIndex >= 0 ? 1 + 1 / (rotationIndex + 1) : 1;
  return (risk * changeWeight * historyWeight * staleness) / Math.max(1, minutesOf(s));
}

export function selectSuites(input: SelectionInput): SelectionResult {
  const { suites, changed, suiteRepos, concurrency } = input;
  const vocab = manifestVocabulary(suites);
  const reasons = new Map<string, SelectionReason[]>();
  const add = (id: string, reason: SelectionReason) => {
    const list = reasons.get(id) ?? [];
    if (!list.some((r) => r.kind === reason.kind && r.detail === reason.detail)) list.push(reason);
    reasons.set(id, list);
  };

  // ---- 1. change scope -----------------------------------------------------------------
  //
  // Signal ORDER matters, and it is the opposite of the obvious one. The repo index looks like
  // the precise signal and the vocabulary like the fuzzy one, but measured against the corpus it
  // is the reverse: `resolveSuiteSource` yields repos for only 44 of 127 suites, so the repo
  // index alone would select 7 suites for a `vc-frontend` change and skip the other 46 that
  // carry `layer: frontend`. Meanwhile `domain`/`tags` are present on every suite. So the
  // COMPLETE signal is primary and the incomplete one is an additive bonus — never a filter that
  // could remove what the vocabulary found.
  const unmappedPaths: string[] = [];
  let widened = false;
  const changedRepos = new Set(changed.map((c) => c.repo));

  for (const repo of changedRepos) {
    const pathsHere = changed.filter((c) => c.repo === repo).map((c) => c.path);
    const tokens = [...new Set(pathsHere.flatMap((p) => pathTokens(p, vocab)))];
    const inRepo = suites.filter((s) => (suiteRepos.get(s.id) ?? []).includes(repo));
    const layers = layersForRepo(repo, suites, suiteRepos);

    // (a) primary: the manifest's own vocabulary, over every suite.
    const byVocabulary = tokens.length > 0 ? suites.filter((s) => suiteMatchesTokens(s, tokens)) : [];
    for (const s of byVocabulary) {
      add(s.id, { kind: "change", detail: `${repo} touched (${tokens.join(", ")})` });
    }

    // (b) additive: suites the incomplete repo index does place in this repo. Union, not
    // intersection — a repo hit is evidence FOR a suite and never evidence against one.
    for (const s of inRepo) {
      add(s.id, { kind: "change", detail: `${repo} owns this suite` });
    }

    // Gate the fallback on the VOCABULARY alone, never on the repo index having contributed.
    // Requiring `inRepo.length === 0` here was a real bug, caught by the test below: one hit from
    // an index that resolves 44 of 127 suites is not evidence that the index is complete, so
    // trusting it would skip widening in exactly the case the widening exists for — a repo whose
    // suites are mostly unmapped. The complete signal decides; the incomplete one only adds.
    if (byVocabulary.length > 0) continue;

    // (c) fail-OPEN floor: nothing matched, so widen to the layers this repo is known to touch.
    // The layer, not the repo's own handful of suites — the repo index is the thing that just
    // failed, so leaning on it here would narrow on the strength of a gap.
    if (layers.length > 0) {
      widened = true;
      const inLayer = suites.filter((s) => s.layer && layers.includes(s.layer));
      for (const s of inLayer) {
        add(s.id, {
          kind: "widened",
          detail: `${repo} touched; nothing narrowed, so the whole ${layers.join("+")} layer`,
        });
      }
      for (const p of pathsHere) unmappedPaths.push(`${repo}/${p}`);
      continue;
    }

    // (d) the repo is unknown to the corpus entirely. Widening here would select everything on
    // any typo, so record the paths and let the risk floor carry the run.
    for (const p of pathsHere) unmappedPaths.push(`${repo}/${p}`);
  }

  // ---- 2. risk floor — never trimmed ---------------------------------------------------
  const riskFloor = new Set<string>();
  for (const s of suites) {
    if (s.priority === "P0") {
      riskFloor.add(s.id);
      add(s.id, { kind: "risk-floor", detail: "P0" });
    } else if ((s.tags ?? []).some((t) => RISK_TAGS.has(t))) {
      riskFloor.add(s.id);
      add(s.id, { kind: "risk-floor", detail: "critical-ui-scope" });
    }
  }

  // ---- 3. history signal — a documented no-op until a run writes history.json ----------
  for (const h of input.history ?? []) {
    if (h.flaky) add(h.suiteId, { kind: "history", detail: "flagged flaky" });
    if ((h.consecutiveDrops ?? 0) >= 2) {
      add(h.suiteId, { kind: "history", detail: `${h.consecutiveDrops} consecutive drops` });
    }
  }

  // ---- 4. rotation top-up --------------------------------------------------------------
  const rotation = input.rotation ?? [];
  const rotationIndexOf = new Map(rotation.map((id, i) => [id, i]));
  const topUp = input.rotationCount ?? DEFAULT_ROTATION_COUNT;
  let added = 0;
  for (const id of rotation) {
    if (added >= topUp) break;
    if (reasons.has(id)) continue;
    add(id, { kind: "rotation", detail: `staleness rank ${(rotationIndexOf.get(id) ?? 0) + 1}` });
    added++;
  }

  // ---- 5. makespan-aware trimming ------------------------------------------------------
  const byId = new Map(suites.map((s) => [s.id, s]));
  let chosen = [...reasons.keys()].map((id) => byId.get(id)).filter((s): s is SelectableSuite => Boolean(s));
  const excluded: ExcludedSuite[] = [];
  const target = input.targetMinutes ?? null;

  if (target !== null) {
    // Drop worst-value-per-minute first, and NEVER a risk-floor suite: the floor exists so a
    // tight time budget cannot quietly remove the P0 gate, which is the one thing a
    // change-scoped run must not be able to do.
    const trimmable = () =>
      chosen
        .filter((s) => !riskFloor.has(s.id))
        // A runner-native suite is never trimmed for cost: see estimateIsUnreliable. It is still
        // trimmable in principle, just not on the strength of a number known to be ×18–×88 out.
        .filter((s) => !estimateIsUnreliable(s))
        .sort((a, b) => {
          const va = valuePerMinute(a, reasons.get(a.id) ?? [], rotationIndexOf.get(a.id) ?? -1);
          const vb = valuePerMinute(b, reasons.get(b.id) ?? [], rotationIndexOf.get(b.id) ?? -1);
          return va - vb || a.id.localeCompare(b.id);
        });

    while (makespanOf(chosen, concurrency) > target) {
      const candidates = trimmable();
      if (candidates.length === 0) break; // only the floor is left — report the overrun, do not cheat it
      const drop = candidates[0];
      chosen = chosen.filter((s) => s.id !== drop.id);
      excluded.push({
        id: drop.id,
        name: drop.name,
        estimatedMinutes: minutesOf(drop),
        reason: `trimmed to fit ${target} min (kept: ${(reasons.get(drop.id) ?? []).map((r) => r.kind).join("+") || "none"})`,
      });
    }
  }

  const selected: SelectedSuite[] = chosen
    .map((s) => ({
      id: s.id,
      name: s.name,
      estimatedMinutes: minutesOf(s),
      reasons: reasons.get(s.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    selectorVersion: SELECTOR_VERSION,
    selected,
    excluded: excluded.sort((a, b) => a.id.localeCompare(b.id)),
    predictedMakespanMinutes: makespanOf(chosen, concurrency),
    fullMakespanMinutes: makespanOf(suites, concurrency),
    unmappedPaths: [...new Set(unmappedPaths)].sort(),
    widened,
    unreliableEstimateMinutes: chosen.filter(estimateIsUnreliable).reduce((n, s) => n + minutesOf(s), 0),
  };
}

/** Human-readable report. The excluded list is printed, never summarised away. */
export function formatSelection(r: SelectionResult): string {
  const lines: string[] = [];
  const totalWork = r.selected.reduce((n, s) => n + s.estimatedMinutes, 0);
  lines.push(`=== Suite selection (selector ${r.selectorVersion}) ===`);
  lines.push(
    `${r.selected.length} suite(s) selected · ${totalWork} min of work · predicted ${r.predictedMakespanMinutes} min ` +
      `(vs ${r.fullMakespanMinutes} min for every suite)`,
  );
  if (r.widened) {
    lines.push(`WIDENED — a changed path matched no manifest vocabulary, so the net was cast wider on purpose.`);
  }
  if (r.unreliableEstimateMinutes > 0) {
    // Otherwise a target overrun looks like too much work was selected, when in fact a
    // known-wrong number is dominating the prediction. 050m declares 245 min and runs in 2.77.
    lines.push(
      `NOTE — ${r.unreliableEstimateMinutes} of those predicted minutes come from runner-native ` +
        `suites whose estimatedMinutes is measurably wrong (x18-x88 overstated). They are not ` +
        `trimmed for cost, and the prediction above overstates them too. ` +
        `Run \`npm run regression:recalibrate\` for the evidence.`,
    );
  }
  lines.push("");
  lines.push("  suite   min  why");
  for (const s of r.selected) {
    // Distinct KINDS. Two `change` reasons (a vocabulary hit and a repo-index hit) are two
    // pieces of evidence but one reason to run the suite, and printing `change+change` reads
    // like a bug.
    const why = [...new Set(s.reasons.map((x) => x.kind))].join("+");
    lines.push(`  ${s.id.padEnd(6)} ${String(s.estimatedMinutes).padStart(4)}  ${why}`);
  }
  if (r.excluded.length > 0) {
    lines.push("");
    lines.push(`EXCLUDED — ${r.excluded.length} suite(s), ${r.excluded.reduce((n, s) => n + s.estimatedMinutes, 0)} min. This is coverage debt, not a pass:`);
    for (const s of r.excluded) lines.push(`  ${s.id.padEnd(6)} ${String(s.estimatedMinutes).padStart(4)}  ${s.reason}`);
  }
  if (r.unmappedPaths.length > 0) {
    lines.push("");
    lines.push(`UNMAPPED — ${r.unmappedPaths.length} changed path(s) matched no suite. Reported, not absorbed:`);
    for (const p of r.unmappedPaths.slice(0, 20)) lines.push(`  ${p}`);
    if (r.unmappedPaths.length > 20) lines.push(`  … ${r.unmappedPaths.length - 20} more`);
  }
  return lines.join("\n");
}
