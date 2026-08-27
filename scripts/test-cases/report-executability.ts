#!/usr/bin/env -S npx tsx
/**
 * `npm run suites:executability` — how much of the corpus a runner can execute, why the rest
 * cannot, and what the cheapest way forward is.
 *
 * WHY THIS EXISTS. Per-case lane routing moved determinism from 9.3% to 13.3%, and nothing
 * in the repo can say that number, watch it, or say what would move it next. Without that,
 * two things happen: the figure gets quoted from a commit message months after it stopped
 * being true, and a change that quietly makes cases unroutable reads as a normal run. So this
 * is the reporting half of `scripts/lib/case-classifier.ts` — it adds no judgement of its own
 * and deliberately shares the classifier with the lane planner, because a report that
 * disagreed with the routing would be worse than no report.
 *
 * IT IS NOT A QUALITY GATE ON PROSE. 84% of the corpus is prose BY DESIGN — these are cases
 * an LLM agent drives, and most of them should stay that way. A gate that failed on "not
 * machine-executable" would be red forever, and everyone would learn to pass `--warn-only`,
 * which kills the signal permanently. What `--check` guards is only the direction of travel:
 * determinism may not go DOWN.
 *
 * Usage:
 *   npm run suites:executability                  per-suite table + corpus totals
 *   npm run suites:executability -- --suite 050h  per-case detail for one suite
 *   npm run suites:executability -- --burn-down   the backlog, cheapest first
 *   npm run suites:executability -- --check       ratchet: fail if machine cases DROPPED
 *   npm run suites:executability -- --json
 *
 * Exit codes: 0 fine · 1 (`--check` only) a suite lost machine cases against the manifest
 * · 2 an argument problem (unknown suite).
 */
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { isCanonicalHeader, parseSuite } from "./append-test-cases-to-suite.js";
import { allSuiteCsvs } from "./sync-test-suites.js";
import {
  blockerHistogram,
  classifySuiteCases,
  CLASSIFIER_VERSION,
  type BlockerCode,
  type CaseVerdict,
  isUiReady,
} from "../lib/case-classifier.js";
import { loadManifest } from "../../ci/lib/suite-manifest.js";

interface SuiteReport {
  id: string;
  name: string;
  file: string;
  machine: number;
  browser: number;
  manual: number;
  /**
   * Retired cases (`Automation_Status: Deprecated`, EX-201). Its own count, never folded into
   * `manual` — both mean "does not run", but one expects a human and the other expects nobody.
   * Same rule that keeps `unroutable` out of `browser`.
   */
  deprecated: number;
  /** Cases nothing can classify: the file carries a legacy header or will not parse. */
  unroutable: number;
  /**
   * The suite declares its own deterministic runner in the manifest (`runner: layout-runner`).
   * Such a suite is ALREADY deterministic at the suite level, so its cases must not be counted
   * into the UI-family backlog — `048c` uses the layout-runner grammar ([VIEWPORT], [PROBE:*],
   * [SNAP], [REFLOW]) plus 29 [NAV] steps, and the [NAV] alone was enough to make the per-case
   * family detector claim all 29 of its cases as UI work that needs authoring. They need none.
   */
  hasOwnRunner: boolean;
  verdicts: CaseVerdict[];
}

/**
 * Authoring cost buckets, derived from the blocker codes rather than guessed per case.
 *
 * The split that matters is which HALF of a case is prose. A case whose steps already compile
 * needs its assertions rewritten and nothing else — that is the cheap tranche. A case whose
 * assertions are fine but whose steps are prose is the expensive one, because normalising a
 * step means deciding what the runner should actually do. A case that is prose on both sides
 * is not a project: those are taken suite by suite inside /qa-review-tests, ranked by
 * browser-minutes × run-frequency, not by count.
 *
 * The minute figures are estimates and are labelled as such wherever they are printed. They
 * exist to ORDER the backlog, not to promise a schedule.
 */
const ASSERTION_CODES: BlockerCode[] = ["EX-101", "EX-102"];
const STEP_CODES: BlockerCode[] = ["EX-010", "EX-011", "EX-003", "EX-002"];
const MIN_PER_ASSERTION_CASE = 4;
const MIN_PER_STEP_CASE = 6;

function analyseSuite(suite: { id: string; name: string; file: string; hasOwnRunner?: boolean }): SuiteReport {
  const base = { id: suite.id, name: suite.name, file: suite.file, hasOwnRunner: suite.hasOwnRunner === true };
  if (!existsSync(suite.file)) {
    return { ...base, machine: 0, browser: 0, manual: 0, deprecated: 0, unroutable: 0, verdicts: [] };
  }
  const raw = readFileSync(suite.file, "utf-8").replace(/^﻿/, "");

  // A legacy 11-column header is UNROUTABLE, never classified. `parseSuite` maps fields
  // positionally, so on such a file the legacy `Steps` lands in `Test_Data` and
  // `Expected Result` lands in `Steps`; classifying it would produce a confident verdict
  // derived from the wrong cells. Reporting it as unroutable keeps the backlog honest —
  // these suites need a header migration, which is authoring, not hygiene.
  if (!isCanonicalHeader(raw)) {
    let count = 0;
    for (const line of raw.split(/\r?\n/)) if (/^\s*"?[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+"?\s*,/.test(line)) count++;
    return { ...base, machine: 0, browser: 0, manual: 0, deprecated: 0, unroutable: count, verdicts: [] };
  }

  try {
    const rows = parseSuite(raw).rows;
    const r = classifySuiteCases(rows as never);
    return {
      ...base,
      machine: r.machine.length,
      browser: r.browser.length,
      manual: r.manual.length,
      deprecated: r.deprecated.length,
      unroutable: 0,
      verdicts: r.verdicts,
    };
  } catch {
    let count = 0;
    for (const line of raw.split(/\r?\n/)) if (/^\s*"?[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+"?\s*,/.test(line)) count++;
    return { ...base, machine: 0, browser: 0, manual: 0, deprecated: 0, unroutable: count, verdicts: [] };
  }
}

function analyseCorpus(): SuiteReport[] {
  const manifest = loadManifest();
  const byFile = new Map(manifest.suites.map((s) => [s.file, s]));
  const reports: SuiteReport[] = [];
  for (const file of allSuiteCsvs()) {
    const declared = byFile.get(file);
    reports.push(
      analyseSuite({
        id: declared?.id ?? "(orphan)",
        name: declared?.name ?? file,
        file,
        // Read from the manifest, never guessed from the file's tags — the tags are exactly what
        // fooled the family detector.
        hasOwnRunner: Boolean((declared as { runner?: string } | undefined)?.runner),
      }),
    );
  }
  return reports.sort((a, b) => b.machine - a.machine || a.id.localeCompare(b.id));
}

function totals(reports: SuiteReport[]) {
  const t = { machine: 0, browser: 0, manual: 0, deprecated: 0, unroutable: 0 };
  // Two numbers about the UI family, reported because they answer "what would a ui-runner buy"
  // BEFORE one is built. `uiFamily` counts cases that drive a browser at all; `uiReady` counts
  // the ones that already compile under the UI grammar and are waiting only on an executor.
  // A `uiReady` of 0 alongside a large `uiFamily` says the bottleneck is authoring, not tooling —
  // which is the opposite of what a runner-first plan assumes.
  let uiFamily = 0;
  let uiReady = 0;
  for (const r of reports) {
    t.machine += r.machine;
    t.browser += r.browser;
    t.manual += r.manual;
    t.deprecated += r.deprecated;
    t.unroutable += r.unroutable;
    if (r.hasOwnRunner) continue; // already deterministic — not UI backlog
    for (const v of r.verdicts) {
      if (v.family !== "ui") continue;
      uiFamily++;
      if (isUiReady(v)) uiReady++;
    }
  }
  const cases = t.machine + t.browser + t.manual + t.deprecated + t.unroutable;
  return { ...t, cases, uiFamily, uiReady, determinismPct: cases > 0 ? (t.machine / cases) * 100 : 0 };
}

/** Cases whose ONLY blockers are assertion-side, vs step-side, vs both. */
function burnDownBuckets(reports: SuiteReport[]) {
  let assertionsOnly = 0;
  let stepsOnly = 0;
  let both = 0;
  let manual = 0;
  let deprecated = 0;
  for (const r of reports) {
    for (const v of r.verdicts) {
      if (v.lane === "machine") continue;
      const codes = new Set(v.blockers.map((b) => b.code));
      if (codes.has("EX-200")) {
        manual++;
        continue;
      }
      // Retired: out of scope by DEFINITION, not by intent — converting one would be work
      // spent on a case that is scheduled for deletion. Its own bucket for that reason.
      if (codes.has("EX-201")) {
        deprecated++;
        continue;
      }
      const hasAssertion = ASSERTION_CODES.some((c) => codes.has(c));
      const hasStep = STEP_CODES.some((c) => codes.has(c));
      if (hasAssertion && hasStep) both++;
      else if (hasAssertion) assertionsOnly++;
      else if (hasStep) stepsOnly++;
    }
  }
  return { assertionsOnly, stepsOnly, both, manual, deprecated };
}

/**
 * The ratchet's decision, as a pure function so it can be tested on a DROP rather than only on
 * the corpus happening to be clean today. A gate whose only test is the current state passes
 * just as happily when it stops checking anything.
 */
/**
 * Lines describing a RE-BASELINE, or none when the classifier has not moved.
 *
 * Extracted so the behaviour is testable without asserting on the implementation's own source
 * text — a test that greps the file it tests breaks on any rewording and proves nothing about
 * what the tool does.
 *
 * A version change is deliberately NOT a failure. Failing on every legitimate bump would teach
 * everyone to bypass the gate; the per-suite drop check remains the thing that exits non-zero.
 * What this adds is visibility: the ratchet compares live counts against the manifest, so a
 * commit that changes the classifier AND refreshes the counts lowers the baseline alongside the
 * fact and the drop disappears. It happened on this branch — classifier 1.1.0 to 1.2.0 with
 * machine 559 to 555, reported `OK`.
 */
export function describeRebaseline(
  recordedVersion: string | undefined,
  currentVersion: string,
  declaredTotal: number,
  liveTotal: number,
): string[] {
  if (recordedVersion === currentVersion) return [];
  const delta = liveTotal - declaredTotal;
  const lines = [
    `[suites:executability] classifier ${recordedVersion ?? "unrecorded"} -> ${currentVersion}: ` +
      `machine ${declaredTotal} -> ${liveTotal} (${delta >= 0 ? "+" : ""}${delta})`,
  ];
  if (delta < 0) {
    lines.push(
      `  A version bump that LOWERS the total is a re-baseline, not a caught regression: the ` +
        `per-suite check below compares against counts recorded under the old classifier. ` +
        `Confirm the loss is intended (a case retired to Deprecated, a rule made stricter) ` +
        `before merging — \`--suite <ID>\` shows the blocker codes.`,
    );
  }
  return lines;
}

export function findDeterminismDrops(
  live: ReadonlyArray<Pick<SuiteReport, "id" | "machine">>,
  declared: ReadonlyMap<string, number>,
): { drops: Array<{ id: string; was: number; now: number }>; gains: Array<{ id: string; was: number; now: number }> } {
  const drops: Array<{ id: string; was: number; now: number }> = [];
  const gains: Array<{ id: string; was: number; now: number }> = [];
  for (const r of live) {
    const was = declared.get(r.id) ?? 0;
    if (r.machine < was) drops.push({ id: r.id, was, now: r.machine });
    else if (r.machine > was) gains.push({ id: r.id, was, now: r.machine });
  }
  return { drops, gains };
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const json = args.includes("--json");
  const check = args.includes("--check");
  const burnDown = args.includes("--burn-down");
  const suiteArg = (() => {
    const i = args.indexOf("--suite");
    return i >= 0 ? args[i + 1] : undefined;
  })();

  // ---- one suite, per case ----------------------------------------------------
  if (suiteArg) {
    const manifest = loadManifest();
    const suite = manifest.suites.find((s) => s.id === suiteArg);
    if (!suite) {
      console.error(`[suites:executability] unknown suite "${suiteArg}"`);
      process.exit(2);
    }
    const r = analyseSuite(suite);
    if (json) {
      console.log(JSON.stringify({ classifierVersion: CLASSIFIER_VERSION, ...r }, null, 2));
      return;
    }
    console.log(`=== ${r.id} ${r.name} ===`);
    console.log(
      `${r.verdicts.length} cases → ${r.machine} machine · ${r.browser} browser · ${r.manual} manual · ` +
        `${r.deprecated} deprecated`,
    );
    if (r.unroutable > 0) {
      console.log(`${r.unroutable} case(s) UNROUTABLE — legacy header or unparsable; needs migration first.`);
      return;
    }
    console.log("");
    for (const v of r.verdicts) {
      if (v.lane === "machine") {
        console.log(`  machine  ${v.id}`);
        continue;
      }
      const codes = [...new Set(v.blockers.map((b) => b.code))].join(",");
      const detail = v.blockers[0]?.detail ?? "";
      console.log(`  ${v.lane.padEnd(8)} ${v.id.padEnd(18)} ${codes.padEnd(22)} ${detail.slice(0, 50)}`);
    }
    return;
  }

  const reports = analyseCorpus();
  const t = totals(reports);
  const hist = blockerHistogram(reports.flatMap((r) => r.verdicts));

  // ---- ratchet ---------------------------------------------------------------
  //
  // Deliberately NOT the same question `suites:lint` asks. That one asks "is the manifest in
  // sync?" and fails on drift in either direction. This one asks "did determinism regress?"
  // and fails ONLY on a drop, so a change that makes cases unroutable cannot ride in behind a
  // routine `suites:sync`.
  if (check) {
    const manifest = loadManifest();
    const declared = new Map(manifest.suites.map((s) => [s.id, s.lanes?.machine ?? 0]));
    const { drops, gains } = findDeterminismDrops(reports, declared);

    // A RE-BASELINE is not a regression, but it must not be silent either.
    //
    // This ratchet compares live counts against the manifest, so a commit that both changes the
    // classifier and refreshes the counts lowers the baseline alongside the fact — and the drop
    // disappears. That happened: classifier 1.1.0 -> 1.2.0 with machine 559 -> 555, reported
    // `OK`. The loss was legitimate (the classifier got stricter and split `deprecated` out of
    // `manual`), but nothing said so.
    //
    // The fix is NOT to fail on a version change — that would fire on every legitimate bump and
    // teach everyone to pass `--warn-only`. It is to print the aggregate delta whenever the
    // recorded version differs, so a reviewer sees the trade instead of a green line.
    const recordedVersion = (manifest._meta as { classifierVersion?: string } | undefined)?.classifierVersion;
    for (const line of describeRebaseline(
      recordedVersion,
      CLASSIFIER_VERSION,
      [...declared.values()].reduce((n, v) => n + v, 0),
      t.machine,
    )) {
      console.log(line);
    }
    if (gains.length > 0) {
      console.log(`[suites:executability] ${gains.length} suite(s) gained machine cases — run \`npm run suites:sync\` to record it:`);
      for (const g of gains.slice(0, 8)) console.log(`  + ${g.id}: ${g.was} -> ${g.now}`);
    }
    if (drops.length > 0) {
      console.error(`[suites:executability] FAIL — ${drops.length} suite(s) LOST machine cases:`);
      for (const d of drops) console.error(`  - ${d.id}: machine cases ${d.was} -> ${d.now}`);
      console.error(`A case that stops being runner-executable goes back to a browser agent, where the`);
      console.error(`measured artefactual-BLOCKED rate applies again — 19.9% corpus-wide, and 28.6% on`);
      console.error(`suites of 81+ cases (history.json, 19 runs, 3991 cases). If the loss is intended,`);
      console.error(`run \`npm run suites:sync\` and say why in the commit.`);
      console.error(`Not every drop is a regression: a case RETIRED to \`Automation_Status: Deprecated\``);
      console.error(`(EX-201) leaves the machine lane by design and runs nowhere at all. Check`);
      console.error(`\`--suite <ID>\` for an EX-201 before treating the drop as lost determinism.`);
      process.exit(1);
    }
    console.log(
      `[suites:executability] OK — ${t.machine}/${t.cases} cases machine-executable ` +
        `(${t.determinismPct.toFixed(1)}%), classifier ${CLASSIFIER_VERSION}`,
    );
    return;
  }

  // ---- burn-down -------------------------------------------------------------
  if (burnDown) {
    const b = burnDownBuckets(reports);
    const pp = (n: number) => ((n / t.cases) * 100).toFixed(1);
    if (json) {
      console.log(JSON.stringify({ classifierVersion: CLASSIFIER_VERSION, totals: t, buckets: b }, null, 2));
      return;
    }
    console.log(`=== Executability burn-down (classifier ${CLASSIFIER_VERSION}) ===`);
    console.log(`Now: ${t.machine}/${t.cases} machine-executable (${t.determinismPct.toFixed(1)}%)\n`);
    console.log(`  cases  bucket                                     est. effort   if done`);
    console.log(
      `  ${String(b.assertionsOnly).padStart(5)}  steps compile, assertions are prose        ` +
        `${String(Math.round((b.assertionsOnly * MIN_PER_ASSERTION_CASE) / 60) + "h").padStart(6)}      +${pp(b.assertionsOnly)} pp`,
    );
    console.log(
      `  ${String(b.stepsOnly).padStart(5)}  assertions compile, steps need normalising ` +
        `${String(Math.round((b.stepsOnly * MIN_PER_STEP_CASE) / 60) + "h").padStart(6)}      +${pp(b.stepsOnly)} pp`,
    );
    console.log(`  ${String(b.both).padStart(5)}  prose on both sides — not a project, take it suite by suite`);
    console.log(`  ${String(b.manual).padStart(5)}  explicitly Manual — out of scope by intent`);
    if (b.deprecated > 0) {
      console.log(`  ${String(b.deprecated).padStart(5)}  explicitly Deprecated — retired; out of scope by definition, never converted`);
    }
    if (t.unroutable > 0) {
      console.log(`  ${String(t.unroutable).padStart(5)}  UNROUTABLE — legacy 11-column header; a suite-level migration, and authoring`);
    }
    console.log(`\nEffort figures are estimates, present to ORDER the backlog — not a schedule.`);
    console.log("");
    console.log(`READ THE SMALL NUMBER AS A FINDING, NOT AN UNDER-COUNT. These buckets are measured`);
    console.log(`against the grammar the GraphQL/REST runner actually parses, so the cheap tranche is`);
    console.log(`genuinely almost exhausted — the cases one assertion away from determinism number in`);
    console.log(`the tens, not the hundreds. An earlier estimate of ~365 came from a looser proxy (does`);
    console.log(`the assertion CONTAIN a comparison operator) and does not survive the executor's own`);
    console.log(`parser: a storefront case asserting \`[DOM] cart icon visible\` can never be scoreable by`);
    console.log(`a GraphQL predicate scorer, however well written it is.`);
    console.log("");
    console.log(`So the next real gain is NOT an authoring push — it is a DOM predicate grammar (a`);
    console.log(`ui-runner). Rewriting assertions buys ~1 pp; giving the browser lane a runner of its`);
    console.log(`own is what moves the other 2508.`);
    return;
  }

  // ---- default: per-suite table ---------------------------------------------
  if (json) {
    console.log(
      JSON.stringify(
        {
          classifierVersion: CLASSIFIER_VERSION,
          totals: t,
          blockers: hist,
          suites: reports.map(({ verdicts: _v, ...rest }) => rest),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`=== Executability (classifier ${CLASSIFIER_VERSION}) ===`);
  console.log(
    `${t.cases} cases across ${reports.length} suites: ${t.machine} machine · ${t.browser} browser · ` +
      `${t.manual} manual · ${t.deprecated} deprecated · ${t.unroutable} unroutable`,
  );
  console.log(`Determinism: ${t.determinismPct.toFixed(1)}%`);
  // Reported unconditionally, including when uiReady is 0: a zero here IS the finding.
  console.log(
    `UI family: ${t.uiFamily} case(s) drive a browser \u00b7 ${t.uiReady} already compile under the ` +
      `UI grammar (awaiting a ui-runner). ${t.uiReady === 0 ? "Zero means the bottleneck is authoring, not the runner." : ""}`,
  );
  console.log("");

  console.log(`  suite   machine  browser  manual  deprec  unroutable  name`);
  for (const r of reports) {
    if (r.machine === 0 && r.unroutable === 0) continue; // pure-browser suites are the norm
    console.log(
      `  ${r.id.padEnd(7)} ${String(r.machine).padStart(7)} ${String(r.browser).padStart(8)} ` +
        `${String(r.manual).padStart(7)} ${String(r.deprecated || "").padStart(7)} ` +
        `${String(r.unroutable || "").padStart(11)}  ${r.name.slice(0, 38)}`,
    );
  }

  console.log(`\nWhy the rest are not machine-executable (cases per code):`);
  for (const h of hist) console.log(`  ${h.code}  ${h.count}`);
  console.log(`\n84% of the corpus is prose BY DESIGN — these are cases an agent drives, and most`);
  console.log(`should stay that way. Run \`--burn-down\` for the tranche that is cheap to convert.`);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();

export { analyseSuite, analyseCorpus, totals, burnDownBuckets, type SuiteReport };
