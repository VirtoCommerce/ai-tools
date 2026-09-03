#!/usr/bin/env node
/**
 * scope-existing-coverage — which EXISTING suite rows does this change put at risk,
 * and will any of them actually run?
 *
 *   npm run tc:scope -- --domain sales-rep --observable "Recent orders" --observable "All orders"
 *   npm run tc:scope -- --domain loyalty,orders --oracle BL-SR-002 --json
 *   npm run tc:scope -- --suite 091,093 --observable salesRepOrders --cases critical
 *
 * WHY THIS EXISTS. `/qa-test` read the existing corpus in exactly one direction — "which suites
 * cover this, so I author only the gaps" (`skills/qa-test/authoring.md` §Artifact A) — and never in
 * the other: "which existing rows does this change make WRONG?". So a stale case was reachable only
 * by FAILING at Step 4 and being triaged at 5a. That is reactive by construction, and three
 * independent things stop the failure ever happening:
 *
 *   1. `regression:select` maps CHANGED PATHS to suites by path token. Measured 2026-09-02 on
 *      VCST-5733: `--path client-app/pages/company/customer-orders.vue` selects 37 suites and
 *      EXCLUDES 089/091/093 — the sales-rep suites — because no path segment is the literal token
 *      `sales-rep`. Worse, it reports `unmappedPaths: []`, because the fail-open widening only fires
 *      when the vocabulary matched NOTHING (`suite-selection.ts` §1(c)); `orders`/`account` matched,
 *      so selection believes it mapped cleanly and never widens.
 *   2. Artifact C then applies `--cases critical`, which drops the High rows where most
 *      label/route assertions live (091: 24 High, 093: 29 High).
 *   3. A row that never executes is never triaged, so 5a cannot reach it.
 *
 * The concrete hole those three leave, same measurement: PR #2444 renames the hub widget to
 * "My recent orders" across 13 locales, and the existing suites assert the OLD label 62 times
 * (093: 43, 091: 19). Every one of those rows is stale on merge and no gate in the pipeline can see it.
 *
 * SO THE PRIMARY SIGNAL HERE IS THE MANIFEST'S OWN VOCABULARY, NEVER A PATH TOKEN. `domain`/`tags`
 * are present on every suite; a changed path is a proxy for them that demonstrably misses. Paths are
 * accepted (`--changed-files`) but they are ADDITIVE — the same asymmetry `selectSuites` already
 * applies to its repo index, and for the same reason: a path hit is evidence FOR a suite and never
 * evidence against one.
 *
 * WHAT IT DOES AND DOES NOT DECIDE. It answers only the deterministic half — WHICH rows mention an
 * observable the change moves, WHICH cite an oracle the ticket amends, and CRUCIALLY whether each
 * would run under the planned Artifact-C selection. Whether the row is actually wrong is judgment,
 * and it belongs to `/qa-review-tests` (Dim 11) against the docs+live+source evidence bar. Same
 * split as `lint-test-cases.ts` TRI-000 (reports WHEN a row was audited) vs `--triangulate` (whether
 * the tag is TRUE), and the same split as `bl:lint` (a citation resolves) vs Dimension 6 (it is the
 * RIGHT citation).
 *
 * THE `runFate` COLUMN IS THE POINT. A stale row that will run is a self-announcing problem: it goes
 * red at Step 4 and 5a triages it. A stale row that will NOT run is invisible forever. Reporting the
 * two together is what makes the second class actionable, and it is why this tool reads the planned
 * case filter rather than leaving the caller to guess.
 *
 * FAIL-OPEN, AND ALWAYS NAMED. Doubt WIDENS the worklist, matching `filter-cases.ts` and inverting
 * `case-classifier.ts`: a wrongly-included row costs one triage line, a wrongly-excluded one is a
 * stale assertion nobody will look at again. An unreadable suite is therefore reported in
 * `unscannable[]` with its reason and never silently dropped — absence of evidence never becomes
 * evidence of absence.
 *
 * Reuses `parseSuite`/`describeHeaderMismatch` (the 15-column contract), `parseAuditStamp` (the
 * TRI-000 stamp format), and `filterRows` (the priority-tier table) so there is no second
 * implementation of any of the three to drift.
 *
 * Exit codes: 0 a worklist was produced (even an empty one) · 1 bad usage · 2 an EXPLICITLY named
 * `--suite` could not be scanned (a named request must never be silently ignored; a suite reached by
 * vocabulary lands in `unscannable[]` instead).
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  describeHeaderMismatch,
  parseSuite,
  type Row,
} from "./append-test-cases-to-suite.js";
import { parseAuditStamp } from "./lint-test-cases.js";
import { filterRows } from "../regression/filter-cases.js";
import { pathTokens } from "../lib/suite-selection.js";

/** The subset of a manifest suite this module needs. Keeps the tests fixture-free. */
export interface ScopeSuite {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly domain?: string;
  readonly layer?: string;
  readonly tags?: readonly string[];
  readonly requiresModules?: readonly string[];
}

/** Why a suite is in the triage scope. All matching reasons are kept for the report. */
export type ScopeReasonKind =
  | "domain" // the suite's own `domain` is one the ticket touches
  | "tag" // a manifest tag matches
  | "module" // `requiresModules` names a module the change touches
  | "named" // the operator named it with --suite
  | "path"; // additive only: a changed path's token matched

export interface ScopeReason {
  readonly kind: ScopeReasonKind;
  readonly detail: string;
}

/**
 * Will this row execute under the planned Artifact-C selection?
 *
 * `NOT_EXECUTING` is deliberately its own value rather than a flavour of `FILTERED_OUT`: an
 * explicitly `Manual` or `Deprecated` row is opted out by intent (EX-200/EX-201), so "it will not
 * run" is the correct state and not a coverage hole. `FILTERED_OUT` is the hole.
 */
export type RunFate = "WILL_RUN" | "FILTERED_OUT" | "NOT_EXECUTING";

/** One existing row the change puts at risk. */
export interface CoverageHit {
  readonly suiteId: string;
  readonly suiteFile: string;
  readonly caseId: string;
  readonly title: string;
  readonly priority: string;
  readonly automationStatus: string;
  /** Which observable(s) matched, and in which column. */
  readonly matches: ReadonlyArray<{ term: string; column: string }>;
  /** Oracle ids the row cites that the ticket is amending. */
  readonly oracles: readonly string[];
  /** Latest `Audited:` stamp, or null when this row has never been triangulated. */
  readonly lastAudited: string | null;
  readonly runFate: RunFate;
}

export interface UnscannableSuite {
  readonly suiteId: string;
  readonly file: string;
  readonly reason: string;
}

export interface ScopeResult {
  readonly scopedSuites: ReadonlyArray<{
    id: string;
    name: string;
    file: string;
    reasons: readonly ScopeReason[];
  }>;
  readonly hits: readonly CoverageHit[];
  readonly unscannable: readonly UnscannableSuite[];
  /** Observables that matched nothing anywhere. Reported: a term with no hit is a term to re-word. */
  readonly unmatchedObservables: readonly string[];
  readonly counts: {
    readonly suitesScoped: number;
    readonly rowsScanned: number;
    readonly hits: number;
    readonly willRun: number;
    readonly filteredOut: number;
    readonly notExecuting: number;
    readonly neverAudited: number;
  };
}

// ---------------------------------------------------------------------------------------------
// Scope resolution — the manifest's own vocabulary, which every suite carries.
// ---------------------------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Tokenize changed paths against the manifest's own vocabulary, reusing `suite-selection.ts`'s
 * `pathTokens` rather than re-deriving the split rules (dots, dashes, CamelCase, the structural
 * `Module`/`Service`/`Controller` suffix, then an EXACT match so `cart` cannot capture `cartridge`).
 * A second copy of that tokenizer is exactly the drift this file avoids everywhere else.
 *
 * The vocabulary is built from the suites themselves, so it needs no hand-maintained path map.
 */
export function pathTokensForPaths(
  paths: readonly string[],
  suites: readonly ScopeSuite[],
): string[] {
  if (paths.length === 0) return [];
  const vocab = new Set<string>();
  for (const s of suites) {
    if (s.domain) vocab.add(norm(s.domain));
    for (const t of s.tags ?? []) vocab.add(norm(t));
    for (const m of s.requiresModules ?? []) vocab.add(norm(m));
  }
  return [...new Set(paths.flatMap((p) => pathTokens(p, vocab)))];
}

/**
 * Suites whose coverage a change in these domains/tags/modules could invalidate.
 *
 * Matching is EXACT on a normalised term, never a prefix or substring — the same rule
 * `pathTokens` follows, and for the same reason: a prefix match would let `cart` capture
 * `cartridge`, and here it would let `order` capture every suite in the corpus and turn a
 * triage worklist into the whole tree.
 */
export function resolveScopeSuites(
  suites: readonly ScopeSuite[],
  input: {
    readonly domains?: readonly string[];
    readonly suiteIds?: readonly string[];
    readonly modules?: readonly string[];
    readonly pathTokens?: readonly string[];
  },
): Array<{ id: string; name: string; file: string; reasons: ScopeReason[] }> {
  const domains = new Set((input.domains ?? []).map(norm));
  const named = new Set((input.suiteIds ?? []).map((s) => s.trim()));
  const modules = new Set((input.modules ?? []).map(norm));
  const tokens = new Set((input.pathTokens ?? []).map(norm));

  const out = new Map<string, { id: string; name: string; file: string; reasons: ScopeReason[] }>();
  const add = (s: ScopeSuite, reason: ScopeReason) => {
    const entry =
      out.get(s.id) ?? { id: s.id, name: s.name, file: s.file, reasons: [] as ScopeReason[] };
    if (!entry.reasons.some((r) => r.kind === reason.kind && r.detail === reason.detail)) {
      entry.reasons.push(reason);
    }
    out.set(s.id, entry);
  };

  for (const s of suites) {
    if (named.has(s.id)) add(s, { kind: "named", detail: `--suite ${s.id}` });

    if (s.domain && domains.has(norm(s.domain))) {
      add(s, { kind: "domain", detail: `domain=${s.domain}` });
    }
    for (const t of s.tags ?? []) {
      if (domains.has(norm(t))) add(s, { kind: "tag", detail: `tag=${t}` });
    }
    for (const m of s.requiresModules ?? []) {
      if (modules.has(norm(m)) || domains.has(norm(m))) {
        add(s, { kind: "module", detail: `requiresModules=${m}` });
      }
    }
    // Additive ONLY. A path token can add a suite the vocabulary missed; it can never remove one
    // the vocabulary found. This is the asymmetry `selectSuites` applies to its repo index.
    if (tokens.size > 0) {
      const suiteWords = new Set(
        [s.domain ?? "", ...(s.tags ?? [])].filter(Boolean).map(norm),
      );
      for (const t of tokens) {
        if (suiteWords.has(t)) add(s, { kind: "path", detail: `changed path token '${t}'` });
      }
    }
  }

  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------------
// Row matching.
// ---------------------------------------------------------------------------------------------

/** Columns an observable is searched in. Metadata columns are excluded: a term matching an
 *  `Archetype:` stamp or a `Cleanup` note tells you nothing about what the row ASSERTS. */
export const SEARCHED_COLUMNS = [
  "Title",
  "Section",
  "Preconditions",
  "Test_Data",
  "Steps",
  "Assertions",
  "Cross_Layer_Checks",
  "Failure_Signals",
] as const;

/** Oracle ids are cited in these two columns plus free-text References. */
const ORACLE_COLUMNS = ["Business_Rule", "Edge_Case_Refs", "References"] as const;

/**
 * Does this row mention any observable the change moves?
 *
 * Case-INSENSITIVE substring, deliberately looser than the exact-token rule used for scope
 * resolution above. The two are answering different questions: scope resolution partitions 132
 * suites and must not over-select, while this searches inside prose an author wrote by hand, where
 * `"Recent orders"`, `Recent Orders` and `recent orders` are the same assertion (all three spellings
 * are live in 091/093). Over-matching here costs a triage line; under-matching loses the row.
 */
export function matchObservables(
  row: Row,
  observables: readonly string[],
): Array<{ term: string; column: string }> {
  const out: Array<{ term: string; column: string }> = [];
  for (const term of observables) {
    const needle = norm(term);
    if (!needle) continue;
    for (const col of SEARCHED_COLUMNS) {
      if ((row[col] ?? "").toLowerCase().includes(needle)) out.push({ term, column: col });
    }
  }
  return out;
}

/** Oracle ids this row cites that appear in the ticket's amend set. Exact, word-bounded. */
export function matchOracles(row: Row, oracles: readonly string[]): string[] {
  const cell = ORACLE_COLUMNS.map((c) => row[c] ?? "").join(" ");
  return oracles.filter((id) => {
    const t = id.trim();
    if (!t) return false;
    // Word-bounded so `BL-SR-002` cannot be matched by a row citing `BL-SR-0021`, and so a
    // prose mention of `VCST-5733` in References counts the same as a Business_Rule citation.
    return new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(t)}([^A-Za-z0-9-]|$)`, "i").test(cell);
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Would this row execute under the planned Artifact-C selection?
 *
 * Delegates the tier decision to `filterRows` — the appender's own priority table, read out loud
 * rather than re-decided. A parallel table here would drift and silently change what "critical"
 * means between the scope report and the run it predicts.
 */
export function classifyRunFate(
  row: Row,
  plan: { readonly tiers: readonly string[]; readonly alsoIds?: readonly string[] },
): RunFate {
  const status = norm(row.Automation_Status ?? "");
  if (status === "manual" || status === "deprecated") return "NOT_EXECUTING";
  if (plan.tiers.length === 0 && (plan.alsoIds ?? []).length === 0) return "WILL_RUN";
  const { kept } = filterRows([row], { tiers: plan.tiers, alsoIds: plan.alsoIds ?? [] });
  return kept.length > 0 ? "WILL_RUN" : "FILTERED_OUT";
}

// ---------------------------------------------------------------------------------------------
// The scan.
// ---------------------------------------------------------------------------------------------

export interface ScanInput {
  readonly suites: readonly ScopeSuite[];
  readonly domains?: readonly string[];
  readonly suiteIds?: readonly string[];
  readonly modules?: readonly string[];
  readonly pathTokens?: readonly string[];
  readonly observables?: readonly string[];
  readonly oracles?: readonly string[];
  readonly tiers?: readonly string[];
  readonly alsoIds?: readonly string[];
  /** Injected so the scan stays pure and the tests stay fixture-free. */
  readonly readSuite: (file: string) => string | null;
}

export function scanExistingCoverage(input: ScanInput): ScopeResult {
  const scoped = resolveScopeSuites(input.suites, {
    domains: input.domains,
    suiteIds: input.suiteIds,
    modules: input.modules,
    pathTokens: input.pathTokens,
  });

  const observables = (input.observables ?? []).filter((o) => o.trim());
  const oracles = (input.oracles ?? []).filter((o) => o.trim());
  const plan = { tiers: input.tiers ?? [], alsoIds: input.alsoIds ?? [] };

  const hits: CoverageHit[] = [];
  const unscannable: UnscannableSuite[] = [];
  const seenTerms = new Set<string>();
  let rowsScanned = 0;

  // An id named on `--suite` that is in NO manifest suite never entered `scoped`, so without this
  // it reached neither `hits[]` nor `unscannable[]` — it vanished, the run exited 0, and an empty
  // worklist read as "no stale rows found". That is the precise failure this tool exists to close,
  // arrived at from the inside: a typo (`91` for `091`), a renumbered suite, or a suite not yet in
  // the manifest — which is exactly the state suite 093 was historically found in — all answered
  // "clean" to a question that was never actually asked. A suite reached by VOCABULARY that cannot
  // be scanned still exits 0 (widening found it, widening may lose it); a suite named EXPLICITLY
  // must never be silently ignored, so it lands here and the exit-2 rule picks it up for free.
  const scopedIds = new Set(scoped.map((s) => s.id));
  for (const id of input.suiteIds ?? []) {
    if (!id.trim() || scopedIds.has(id)) continue;
    unscannable.push({ suiteId: id, file: "(unknown)", reason: "not in config/test-suites.json" });
  }

  for (const s of scoped) {
    const raw = input.readSuite(s.file);
    if (raw === null) {
      unscannable.push({ suiteId: s.id, file: s.file, reason: "file not found" });
      continue;
    }
    // A legacy 11-column suite maps fields POSITIONALLY, so its `Steps` lands in `Test_Data` and
    // its `Priority` is not `Priority`. Scanning it would report the right rows for the wrong
    // reasons and predict `runFate` off a column that holds something else. Refused and NAMED —
    // the same refusal `filter-cases.ts` and `plan-lanes.ts` make, for the same reason.
    const mismatch = describeHeaderMismatch(raw);
    if (mismatch) {
      unscannable.push({
        suiteId: s.id,
        file: s.file,
        reason: `legacy header — ${mismatch.split("\n")[0]}`,
      });
      continue;
    }

    let rows: Row[];
    try {
      rows = parseSuite(raw).rows;
    } catch (e) {
      unscannable.push({
        suiteId: s.id,
        file: s.file,
        reason: `unparsable CSV — ${(e as Error).message}`,
      });
      continue;
    }

    for (const row of rows) {
      if (!row.ID) continue;
      rowsScanned += 1;
      const matches = matchObservables(row, observables);
      const cited = matchOracles(row, oracles);
      if (matches.length === 0 && cited.length === 0) continue;
      for (const m of matches) seenTerms.add(m.term);
      hits.push({
        suiteId: s.id,
        suiteFile: s.file,
        caseId: row.ID,
        title: row.Title ?? "",
        priority: row.Priority ?? "",
        automationStatus: row.Automation_Status ?? "",
        matches,
        oracles: cited,
        lastAudited: parseAuditStamp(row.References ?? ""),
        runFate: classifyRunFate(row, plan),
      });
    }
  }

  const unmatchedObservables = observables.filter((o) => !seenTerms.has(o));

  return {
    scopedSuites: scoped,
    hits,
    unscannable,
    unmatchedObservables,
    counts: {
      suitesScoped: scoped.length,
      rowsScanned,
      hits: hits.length,
      willRun: hits.filter((h) => h.runFate === "WILL_RUN").length,
      filteredOut: hits.filter((h) => h.runFate === "FILTERED_OUT").length,
      notExecuting: hits.filter((h) => h.runFate === "NOT_EXECUTING").length,
      neverAudited: hits.filter((h) => h.lastAudited === null).length,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------------------------

export interface Args {
  readonly domains: string[];
  readonly suiteIds: string[];
  readonly modules: string[];
  /** Changed paths — additive scope only, never a filter (see the --path case in parseArgs). */
  readonly paths: string[];
  readonly observables: string[];
  readonly oracles: string[];
  readonly tiers: string[];
  readonly alsoIds: string[];
  readonly json: boolean;
}

const TIER_WORDS = new Set(["critical", "high", "medium", "low"]);

export function parseArgs(argv: readonly string[]): Args | { error: string } {
  const a: {
    domains: string[];
    suiteIds: string[];
    modules: string[];
    paths: string[];
    observables: string[];
    oracles: string[];
    tiers: string[];
    alsoIds: string[];
    json: boolean;
  } = {
    domains: [],
    suiteIds: [],
    modules: [],
    paths: [],
    observables: [],
    oracles: [],
    tiers: [],
    alsoIds: [],
    json: false,
  };

  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Every value-taking flag looks ahead, because `--observable` as the final token used to bind
    // `undefined` and then match every row — the same value-lookahead bug `tc:promote --ids` had.
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return null;
      i += 1;
      return v;
    };
    switch (arg) {
      case "--domain":
      case "--domains": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.domains.push(...list(v));
        break;
      }
      case "--suite":
      case "--suites": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.suiteIds.push(...list(v));
        break;
      }
      case "--module":
      case "--modules": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.modules.push(...list(v));
        break;
      }
      // Paths are ADDITIVE ONLY — they can add a suite the manifest vocabulary missed, never
      // remove one it found (the asymmetry `selectSuites` applies to its own repo index). They do
      // NOT satisfy the scope requirement below: there has to be a vocabulary scope for a path to
      // be additive TO. The header documented this flag before it existed, which left the whole
      // path pathway reachable only from the unit test.
      case "--path":
      case "--paths":
      case "--changed-files": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.paths.push(...list(v));
        break;
      }
      case "--observable": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.observables.push(v);
        break;
      }
      case "--oracle": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.oracles.push(...list(v));
        break;
      }
      case "--cases": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        for (const t of list(v)) {
          if (!TIER_WORDS.has(t.toLowerCase())) {
            return { error: `--cases: unknown tier '${t}' (critical|high|medium|low)` };
          }
          a.tiers.push(t.toLowerCase());
        }
        break;
      }
      case "--also-ids": {
        const v = value();
        if (!v) return { error: `${arg} needs a value` };
        a.alsoIds.push(...list(v));
        break;
      }
      case "--json":
        a.json = true;
        break;
      default:
        return { error: `unknown argument '${arg}'` };
    }
  }

  if (a.domains.length === 0 && a.suiteIds.length === 0 && a.modules.length === 0) {
    return { error: "need at least one of --domain / --suite / --module to scope the scan" };
  }
  if (a.observables.length === 0 && a.oracles.length === 0) {
    return {
      error:
        "need at least one --observable or --oracle: without one this would list every row in scope, " +
        "which is a suite audit (/qa-review-tests --triangulate), not a change-scoped triage",
    };
  }
  return a;
}

export function formatReport(r: ScopeResult, args: Args): string {
  const L: string[] = [];
  L.push(
    `Existing-coverage triage — ${r.counts.suitesScoped} suite(s) in scope, ` +
      `${r.counts.rowsScanned} rows scanned, ${r.counts.hits} at risk`,
  );
  L.push(
    `  runFate: ${r.counts.willRun} WILL_RUN · ${r.counts.filteredOut} FILTERED_OUT · ` +
      `${r.counts.notExecuting} NOT_EXECUTING   |   never audited: ${r.counts.neverAudited}`,
  );
  L.push("");
  L.push(`Scope: ${r.scopedSuites.map((s) => s.id).join(", ") || "(none)"}`);
  for (const s of r.scopedSuites) {
    L.push(`  ${s.id}  ${s.name}`);
    L.push(`        ${s.reasons.map((x) => `${x.kind}: ${x.detail}`).join(" · ")}`);
  }

  if (r.hits.length > 0) {
    L.push("");
    L.push("At-risk rows — classify each, then dispose per skills/qa-test/coverage-triage.md §3:");
    const bySuite = new Map<string, CoverageHit[]>();
    for (const h of r.hits) bySuite.set(h.suiteId, [...(bySuite.get(h.suiteId) ?? []), h]);
    for (const [suiteId, rows] of [...bySuite.entries()].sort()) {
      L.push("");
      L.push(`  ${suiteId} — ${rows[0].suiteFile}`);
      for (const h of rows) {
        const terms = [...new Set(h.matches.map((m) => m.term))].join(", ");
        const cols = [...new Set(h.matches.map((m) => m.column))].join("/");
        const bits = [
          h.priority || "?",
          h.automationStatus || "?",
          h.runFate,
          h.lastAudited ? `audited ${h.lastAudited}` : "NEVER audited",
        ];
        L.push(`    ${h.caseId.padEnd(14)} ${bits.join(" · ")}`);
        L.push(`      ${h.title.slice(0, 96)}`);
        if (terms) L.push(`      matched: ${terms}  (in ${cols})`);
        if (h.oracles.length) L.push(`      cites: ${h.oracles.join(", ")}`);
      }
    }
  }

  // Coverage debt, stated. A silent omission here is exactly the failure this tool exists to close,
  // so an unscannable suite and an unmatched term are printed even on an otherwise clean run.
  if (r.unscannable.length > 0) {
    L.push("");
    L.push("NOT SCANNED — triage these by hand, they are not evidence of no risk:");
    for (const u of r.unscannable) L.push(`  ${u.suiteId}  ${u.reason}  (${u.file})`);
  }
  if (r.unmatchedObservables.length > 0) {
    L.push("");
    L.push(
      `Observables that matched nothing: ${r.unmatchedObservables.map((o) => `'${o}'`).join(", ")}`,
    );
    L.push(
      "  Either the corpus genuinely never asserts them (a gap → a 1e matrix cell), or the term is " +
        "worded differently in the CSVs than in the diff. Check before concluding the first.",
    );
  }
  if (r.counts.filteredOut > 0) {
    L.push("");
    L.push(
      `${r.counts.filteredOut} at-risk row(s) would NOT run under --cases ` +
        `${args.tiers.join(",") || "(none given)"}. A stale row that runs goes red and gets triaged; ` +
        "a stale row that does not run is invisible. Carry them on --also-ids or dispose of them here.",
    );
  }
  return L.join("\n");
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(`tc:scope: ${parsed.error}`);
    console.error(
      "\nusage: npm run tc:scope -- --domain <d>[,<d>] [--suite <ids>] [--module <m>]\n" +
        "                          (--observable <text> | --oracle <ID>)...\n" +
        "                          [--changed-files <p>[,<p>]] [--cases critical[,high]]\n" +
        "                          [--also-ids <ids>] [--json]\n" +
        "\n  --changed-files is ADDITIVE: it adds a suite the vocabulary missed, never removes\n" +
        "  one it found, and it does not by itself scope a scan.",
    );
    return 1;
  }

  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const manifestPath = resolve(repoRoot, "config/test-suites.json");
  if (!existsSync(manifestPath)) {
    console.error(`tc:scope: manifest not found at ${manifestPath}`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    suites: ScopeSuite[];
  };

  const result = scanExistingCoverage({
    suites: manifest.suites,
    domains: parsed.domains,
    suiteIds: parsed.suiteIds,
    modules: parsed.modules,
    pathTokens: pathTokensForPaths(parsed.paths, manifest.suites),
    observables: parsed.observables,
    oracles: parsed.oracles,
    tiers: parsed.tiers,
    alsoIds: parsed.alsoIds,
    readSuite: (file) => {
      const p = resolve(repoRoot, file);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    },
  });

  // A named suite that could not be scanned is exit 2: the operator asked for it explicitly, and
  // answering "no risk found" would be a false negative on a direct question. A suite reached by
  // vocabulary stays exit 0 with its `unscannable[]` line — widening found it, widening can lose it.
  const namedUnscannable = result.unscannable.filter((u) => parsed.suiteIds.includes(u.suiteId));

  if (parsed.json) {
    console.log(JSON.stringify({ ...result, namedUnscannable }, null, 2));
  } else {
    console.log(formatReport(result, parsed));
    if (namedUnscannable.length > 0) {
      console.error(
        `\ntc:scope: ${namedUnscannable.length} explicitly named suite(s) could not be scanned.`,
      );
    }
  }
  return namedUnscannable.length > 0 ? 2 : 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("scope-existing-coverage.ts")) {
  main().then((code) => process.exit(code));
}
