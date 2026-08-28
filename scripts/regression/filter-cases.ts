#!/usr/bin/env node
/**
 * filter-cases — narrow a resolved suite CSV to the cases a change-scoped run should execute.
 *
 *   npm run suites:filter -- <resolved.csv> --priority Critical --out <path>
 *   npm run suites:filter -- <resolved.csv> --priority Critical --also-ids SRCH-013,SRCH-059 --out <path>
 *   npm run suites:filter -- <resolved.csv> --priority Critical --json          # report only, no write
 *
 * WHY A CASE FILTER AT ALL. `/qa-test` Artifact C selects whole SUITES, so VCST-5729 planned all 44
 * cases of suite `004` to check one search change — 6 of them Critical, 19 skipped outright. A
 * single-module selection predicts ~149 minutes against a 40-minute window. Critical is 883 of the
 * 3,969 canonical-header cases (22%), which is what makes the window reachable.
 *
 * WHERE IT PLUGS IN. `regression-orchestrator.md` Step 3 already writes a per-suite
 * `suite-{ID}-resolved.csv` before calling `suites:lanes`. Filtering AT THAT HOP leaves lanes, the
 * machine lane, the merge, the results envelope, triage and promotion completely untouched — no new
 * runner, and `/qa-regression`'s suite-ID interface does not move.
 *
 * NEVER HAND-ROLL THE CSV. Suite files carry CRLF, bare CR, escaped inner quotes and (12 of them) a
 * UTF-8 BOM. `parseSuite`/`serialiseRows` from the appender are the one pair that survives all of
 * that; memory `reference_suite_csv_literal_edits_need_tolerant_matching` is the scar tissue. The
 * header line is copied VERBATIM from the source rather than re-serialised, because the corpus mixes
 * quoted (`"ID","Title",…`) and unquoted (`ID,Title,…`) header styles and re-emitting one as the
 * other is a diff nobody asked for.
 *
 * Exit codes: 0 a filtered set was produced (even an empty one — see below) · 1 bad usage ·
 * 2 the source is a legacy 11-column suite.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  detectEol,
  isCanonicalHeader,
  normaliseEol,
  parseSuite,
  serialiseRows,
  withSingleTrailingNewline,
  type Row,
} from "../test-cases/append-test-cases-to-suite.js";

/**
 * Priority tiers, and the two spellings each one answers to.
 *
 * The `P0..P3` aliases are NOT speculative: `append-test-cases-to-suite.ts` already accepts both
 * vocabularies (`PRIORITIES`), and its `HIGH_PRIORITIES` set pairs `Critical` with `P0` and `High`
 * with `P1` — so the alias table below is that file's existing judgement, read out loud rather than
 * re-decided here. Measured on the 117 canonical suites: Critical 883 · High 1899 · Medium 1088 ·
 * Low 64 · P1 18 · P2 17, and **no `P0` row exists today**. The alias costs nothing and stops a
 * future `P0` case from being silently dropped from a critical-only run.
 */
const TIER_ALIASES: Record<string, readonly string[]> = {
  critical: ["critical", "p0"],
  high: ["high", "p1"],
  medium: ["medium", "p2"],
  low: ["low", "p3"],
};

const TIER_OF = new Map<string, string>();
for (const [tier, spellings] of Object.entries(TIER_ALIASES)) {
  for (const s of spellings) TIER_OF.set(s, tier);
}

/**
 * The scope sidecar — what a scoped run must carry forward, and WHY it is not optional.
 *
 * A filtered run is a partial run, and every consumer downstream computes from the plan it is
 * handed. `suite-results-merge.ts` derives `totalCases` from the lanes plan (which is built from
 * the filtered CSV), `regression-triage.ts` writes that into `history.json`, and
 * `estimate-calibration.ts` rejects an observation only when `casesReported / totalCases < 0.95`.
 * Without this record a 6-of-44 run reports 6/6 = 100% coverage, sails through that guard, and
 * feeds `regression:recalibrate` a six-case duration as a full observation of a 44-case suite —
 * silently falsifying the very calibration data the 40-minute window depends on.
 *
 * So `sourceCases` is the load-bearing field: it is the ONLY place the unfiltered size survives
 * once the scoped CSV replaces the full one.
 */
export interface CaseFilterScope {
  readonly tiers: readonly string[];
  readonly alsoIds: readonly string[];
  /** Cases in the filtered output. */
  readonly keptCases: number;
  /** Cases in the suite BEFORE filtering — the real denominator. */
  readonly sourceCases: number;
  readonly untypeable: ReadonlyArray<{ id: string; priority: string }>;
  readonly missingAlsoIds: readonly string[];
}

export interface FilterResult {
  readonly kept: Row[];
  readonly keptIds: string[];
  readonly droppedCount: number;
  /**
   * Rows whose `Priority` matches no known spelling. Reported, never silently discarded.
   *
   * The asymmetry is deliberate and runs OPPOSITE to `case-classifier.ts`. That one fails closed
   * (doubt → the browser lane) because a wrongly-machine-routed case manufactures a BLOCKED that
   * reads as a product failure. Here the expensive direction reverses: an unreadable priority that
   * quietly leaves the run is a coverage hole with no error anywhere. So it does not run — the
   * caller asked for Critical and this is not provably Critical — but it is NAMED, and the
   * orchestrator surfaces the count. Absence of evidence never becomes evidence of absence.
   */
  readonly untypeable: Array<{ id: string; priority: string }>;
  /** Ids passed via `--also-ids` that no row in this suite carries. */
  readonly missingAlsoIds: string[];
}

/** Narrow `rows` to the requested tiers plus any explicitly named id. Pure — the tests drive this. */
export function filterRows(
  rows: readonly Row[],
  opts: { tiers: readonly string[]; alsoIds?: readonly string[] },
): FilterResult {
  const wanted = new Set(opts.tiers.map((t) => t.trim().toLowerCase()));
  const also = new Set((opts.alsoIds ?? []).map((s) => s.trim()).filter(Boolean));
  const seenAlso = new Set<string>();

  const kept: Row[] = [];
  const untypeable: Array<{ id: string; priority: string }> = [];
  let droppedCount = 0;

  for (const row of rows) {
    const id = (row.ID ?? "").trim();
    if (!id) continue; // a blank continuation line is not a case

    if (also.has(id)) {
      seenAlso.add(id);
      kept.push(row);
      continue;
    }

    const raw = (row.Priority ?? "").trim();
    const tier = TIER_OF.get(raw.toLowerCase());
    if (!tier) {
      untypeable.push({ id, priority: raw });
      droppedCount++;
      continue;
    }
    if (wanted.has(tier)) kept.push(row);
    else droppedCount++;
  }

  return {
    kept,
    keptIds: kept.map((r) => (r.ID ?? "").trim()),
    droppedCount,
    untypeable,
    missingAlsoIds: [...also].filter((id) => !seenAlso.has(id)),
  };
}

/** The source's header line, byte-for-byte (BOM and quoting style included). */
export function headerLine(rawText: string): string {
  return rawText.split(/\r?\n/, 1)[0] ?? "";
}

/** Rebuild a suite CSV from the original header line and the surviving rows. */
export function renderFiltered(rawText: string, kept: readonly Row[]): string {
  const eol = detectEol(rawText);
  const body = serialiseRows([...kept]);
  const text = kept.length > 0 ? `${headerLine(rawText)}\n${body}` : headerLine(rawText);
  return withSingleTrailingNewline(normaliseEol(text, eol), eol);
}

export interface Args {
  source: string;
  tiers: string[];
  alsoIds: string[];
  out: string | null;
  scopeOut: string | null;
  json: boolean;
}

/**
 * Exported so the argument surface is testable WITHOUT spawning the CLI.
 *
 * Spawning is not an option here: the house helper hardcodes
 * `../../node_modules/tsx/dist/cli.mjs`, which does not exist in a git worktree, and four sibling
 * test files fail for exactly that reason. `select-suites.ts` sets the precedent by exporting its
 * own `parseArgs` for the same purpose.
 */
export function parseArgs(argv: readonly string[]): Args | { error: string } {
  const a: Args = { source: "", tiers: [], alsoIds: [], out: null, scopeOut: null, json: false };
  // A value-taking flag must never swallow the NEXT flag as its value. `--out --json` used to
  // create a file literally named `--json` and silently leave `--json` unset; `--out` as the last
  // token used to mean "write nothing" while still exiting 0 — which, at the documented in-place
  // call site, left the run reading an UNFILTERED csv while reporting a scoped run. Same lookahead
  // guard `plan-lanes.ts` already uses.
  const valueOf = (flag: string, i: number): string | { error: string } => {
    const nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith("--")) return { error: `${flag} requires a value` };
    return nxt;
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--priority" || v === "--also-ids" || v === "--out" || v === "--scope-out") {
      const got = valueOf(v, i);
      if (typeof got !== "string") return got;
      i++;
      if (v === "--priority") a.tiers.push(...got.split(",").map((s) => s.trim()).filter(Boolean));
      else if (v === "--also-ids") a.alsoIds.push(...got.split(",").map((s) => s.trim()).filter(Boolean));
      else if (v === "--out") a.out = got;
      else a.scopeOut = got;
    } else if (v === "--json") a.json = true;
    else if (v.startsWith("--")) return { error: `unknown argument '${v}'` };
    else if (!a.source) a.source = v;
    else return { error: `unexpected extra argument '${v}'` };
  }
  if (!a.source) return { error: "give the resolved suite CSV as the first argument" };
  if (a.tiers.length === 0) return { error: "--priority <tier[,tier]> is required (e.g. --priority Critical)" };
  const unknown = a.tiers.filter((t) => !TIER_ALIASES[t.toLowerCase()]);
  if (unknown.length > 0) {
    return { error: `unknown priority tier(s) ${unknown.join(", ")} — expected one of ${Object.keys(TIER_ALIASES).join(", ")}` };
  }
  return a;
}

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(`filter-cases: ${parsed.error}`);
    console.error("Usage: npm run suites:filter -- <resolved.csv> --priority Critical [--also-ids ID,ID] [--out <path>] [--scope-out <path>] [--json]");
    return 1;
  }
  const args = parsed;

  if (!existsSync(args.source)) {
    console.error(`filter-cases: source not found: ${args.source}`);
    return 1;
  }
  // An I/O failure must not surface as a raw stack trace on exit 1 — that is the SAME exit code
  // as a bad flag, so the caller could not tell a typo from an unreadable file. `merge-suite-lanes.ts`
  // sets the precedent: catch, say what failed, exit deliberately.
  let rawText: string;
  try {
    rawText = readFileSync(args.source, "utf-8");
  } catch (err) {
    console.error(`filter-cases: cannot read ${args.source}: ${(err as Error).message}`);
    return 1;
  }

  // Same refusal `plan-lanes.ts` makes, for the same reason: `parseSuite` maps fields POSITIONALLY,
  // so on an 11-column legacy suite the legacy `Steps` lands in `Test_Data` — filtering on
  // `Priority` there would score real cases against the wrong column and drop them confidently.
  if (!isCanonicalHeader(rawText)) {
    console.error(`filter-cases: ${args.source} has a legacy 11-column header — refusing to filter it.`);
    console.error("  Its columns do not line up with the canonical 15, so `Priority` cannot be read.");
    return 2;
  }

  const { rows } = parseSuite(rawText);
  const result = filterRows(rows, { tiers: args.tiers, alsoIds: args.alsoIds });
  const sourceCases = rows.filter((r) => (r.ID ?? "").trim()).length;

  const scope: CaseFilterScope = {
    tiers: args.tiers,
    alsoIds: args.alsoIds,
    keptCases: result.kept.length,
    sourceCases,
    untypeable: result.untypeable,
    missingAlsoIds: result.missingAlsoIds,
  };

  try {
    if (args.out) writeFileSync(args.out, renderFiltered(rawText, result.kept), "utf-8");
    // The sidecar is what keeps the run's own scope re-derivable after the fact. Written next to
    // `suite-{ID}-lanes.json` in the same run dir, and read by `suites:merge`.
    if (args.scopeOut) writeFileSync(args.scopeOut, `${JSON.stringify(scope, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.error(`filter-cases: cannot write output: ${(err as Error).message}`);
    return 1;
  }

  const report = {
    source: args.source,
    out: args.out,
    scopeOut: args.scopeOut,
    tiers: args.tiers,
    total: sourceCases,
    kept: result.kept.length,
    dropped: result.droppedCount,
    keptIds: result.keptIds,
    untypeable: result.untypeable,
    missingAlsoIds: result.missingAlsoIds,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`${args.source}: ${report.kept} of ${report.total} cases kept (${args.tiers.join(", ")})`);
  if (args.alsoIds.length > 0) console.log(`  also-ids: ${args.alsoIds.length} requested`);
  if (result.kept.length === 0) {
    // Not an error. 11 of 128 suites hold no Critical case at all, and a suite contributing zero
    // rows is a legitimate outcome the orchestrator must REPORT rather than treat as a failure.
    console.log("  → no case matched; this suite contributes nothing to the run (report it, do not hide it)");
  }
  for (const u of result.untypeable) {
    console.log(`  ! ${u.id}: unreadable Priority ${JSON.stringify(u.priority)} — not run, not silently dropped`);
  }
  for (const id of result.missingAlsoIds) {
    console.log(`  ! --also-ids ${id}: no such case in this suite`);
  }
  if (args.out) console.log(`  wrote ${args.out}`);
  if (args.scopeOut) console.log(`  wrote ${args.scopeOut} (scope sidecar — carries sourceCases=${sourceCases})`);
  return 0;
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) process.exit(main(process.argv.slice(2)));
