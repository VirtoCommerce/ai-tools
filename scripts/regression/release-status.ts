#!/usr/bin/env -S npx tsx
/**
 * release-status — the shared state of a release regression that several QA run in parallel.
 *
 *   npm run release:status -- stable-16                 # who has which wave, totals, open decisions
 *   npm run release:status -- stable-16 --write         # regenerate PROGRESS.md from the wave files
 *   npm run release:check  -- stable-16                 # validate release.json, every state.json, ledger.csv, PROGRESS.md
 *   npm run release:check  -- --all                     # every release folder (the CI gate)
 *   npm run release:status -- stable-16 --ledger --suites 017,018 [--with-baseline]   # earlier verdicts, as JSON
 *
 * WHY IT EXISTS. A release regression outlives one person's session and one person's limits. Its
 * plan, who holds which wave, what each wave found and — above all — what each triage DECIDED have
 * to sit in git, or the next QA re-runs and re-triages the same failures from scratch. The layout
 * (`regression/releases/<release>/`) and every field below are specified in
 * `.claude/skills/qa-run/release-folder.md`; this script is that contract's checker and
 * its only aggregator.
 *
 * ONE AUTHOR PER FILE. `release.json` is written by the planner; `waves/<W>/state.json`,
 * `ledger.csv` and `report.md` by that wave's owner only. PROGRESS.md is generated, and `--check`
 * fails when it is stale — CI checks a PR's merge commit, so a wave PR that raced another one is told
 * to re-run `--write` instead of merging an overview that is already wrong.
 *
 * --with-baseline adds the ledger of the release named in `release.json` `baseline` (when that
 * folder exists), so a recurrence from the previous bundle is recognised as known ground.
 *
 * Exit codes: 0 ok · 1 bad usage, or --check found a violation · 2 the release folder is missing.
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse/sync";

// The release folders belong to the PROJECT, not to wherever this script is installed: QA_RUN_HOME,
// else the working directory — the same split vc-fix makes between outputRoot() and pluginRoot().
const REPO_ROOT = resolve(process.env.QA_RUN_HOME || process.cwd());
const ROOT = join(REPO_ROOT, "regression/releases");

export const WAVE_STATUSES = ["NOT_STARTED", "CLAIMED", "RUNNING", "RUN_DONE", "TRIAGED", "DONE", "BLOCKED"] as const;
export const VERDICTS = [
  "REAL_BUG", "BY_DESIGN", "TEST_DEFECT", "DATA", "ENV_CONFIG", "NOT_TESTABLE", "DUPLICATE", "FLAKY", "PENDING_DECISION",
] as const;
export const CASE_STATUSES = ["FAIL", "BLOCKED", "SKIPPED", "OBSERVED"] as const;
export const LEDGER_COLUMNS = [
  "case_id", "suite", "run_id", "status", "verdict", "new_in_release", "summary", "reason", "decided_by", "source", "follow_up", "reopen_when",
] as const;
const NEW_IN_RELEASE = ["yes", "no", "unknown"];
/** An issue key (`VCST-6286`) or a PR (`ai-tools#449`, `vc-deploy-dev#6912`) at the start of the field. */
const ISSUE_KEY = /^([A-Z][A-Z0-9]+-\d+|[A-Za-z0-9._-]+#\d+)\b/;
const DRAFT = /^DRAFT\b/;
const RAN = new Set(["RUN_DONE", "TRIAGED", "DONE"]);
const TOTAL_KEYS = ["planned", "executed", "pass", "fail", "blocked", "skipped", "ambiguous"] as const;

interface Wave { id: string; title: string; note?: string; tier?: string; suites: string[]; modules?: string[]; exclusive?: string[]; dependsOn?: string[] }
interface Release { release: string; ticket?: string; baseline?: string; bundle?: Record<string, unknown>; env?: Record<string, unknown>; waves: Wave[] }
type Totals = Record<(typeof TOTAL_KEYS)[number], number>;
interface NotRun { suites: string[]; cases: number; reason: string }
interface State {
  wave: string; owner: string | null; status: string; runIds: string[]; personas?: string; untriaged?: number;
  totals?: Totals; notRun?: NotRun[]; handovers?: { owner: string; until: string; note?: string }[]; evidence?: string; updatedAt?: string;
}
type LedgerRow = Record<(typeof LEDGER_COLUMNS)[number], string> & { wave: string; release: string };

function usage(msg?: string): never {
  if (msg) console.error(`release-status: ${msg}`);
  console.error("usage: release:status -- <release> [--check] [--write] [--json] [--ledger [--suites a,b] [--with-baseline]] | --check --all");
  process.exit(1);
}

const rel = (p: string) => p.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
function readJson<T>(path: string, problems: string[]): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (e) {
    problems.push(`${rel(path)}: unreadable JSON (${(e as Error).message})`);
    return null;
  }
}

function load(release: string, required = true) {
  const dir = join(ROOT, release);
  if (!existsSync(join(dir, "release.json"))) {
    if (!required) return null;
    console.error(`release-status: ${rel(join(dir, "release.json"))} not found — run /qa-test-plan stable <N> first`);
    process.exit(2);
  }
  const problems: string[] = [];
  const plan = readJson<Release>(join(dir, "release.json"), problems);
  const states = new Map<string, State>();
  const ledger: LedgerRow[] = [];
  const wavesDir = join(dir, "waves");
  for (const w of existsSync(wavesDir) ? readdirSync(wavesDir) : []) {
    const statePath = join(wavesDir, w, "state.json");
    if (existsSync(statePath)) {
      const s = readJson<State>(statePath, problems);
      if (s) states.set(w, s);
    }
    const ledgerPath = join(wavesDir, w, "ledger.csv");
    if (!existsSync(ledgerPath)) continue;
    const text = readFileSync(ledgerPath, "utf-8").replace(/^﻿/, "");
    const header = text.split(/\r?\n/, 1)[0].split(",").map((h) => h.trim());
    if (header.join(",") !== LEDGER_COLUMNS.join(",")) {
      problems.push(`${rel(ledgerPath)}: header must be exactly ${LEDGER_COLUMNS.join(",")}`);
      continue;
    }
    try {
      for (const r of parse(text, { columns: true, skip_empty_lines: true, relax_column_count: false }) as LedgerRow[]) {
        ledger.push({ ...r, wave: w, release });
      }
    } catch (e) {
      problems.push(`${rel(ledgerPath)}: ${(e as Error).message}`);
    }
  }
  return { dir, plan, states, ledger, problems };
}

function hasCycle(waves: Wave[]): string | null {
  const deps = new Map(waves.map((w) => [w.id, w.dependsOn ?? []]));
  const seen = new Set<string>(), stack = new Set<string>();
  const visit = (id: string): string | null => {
    if (stack.has(id)) return id;
    if (seen.has(id)) return null;
    seen.add(id); stack.add(id);
    for (const d of deps.get(id) ?? []) { const c = visit(d); if (c) return c; }
    stack.delete(id);
    return null;
  };
  for (const w of waves) { const c = visit(w.id); if (c) return c; }
  return null;
}

function reachesW0(waves: Wave[], id: string, seen = new Set<string>()): boolean {
  if (id === "W0") return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return (waves.find((w) => w.id === id)?.dependsOn ?? []).some((d) => reachesW0(waves, d, seen));
}

const TIERS = ["critical", "high", "rest"];
function dependsOnWave(waves: Wave[], id: string, target: string, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const deps = waves.find((w) => w.id === id)?.dependsOn ?? [];
  return deps.includes(target) || deps.some((d) => dependsOnWave(waves, d, target, seen));
}

const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

function check(release: string, dir: string, plan: Release | null, states: Map<string, State>, ledger: LedgerRow[], problems: string[]): string[] {
  if (!plan) return problems;
  if (plan.release !== release) problems.push(`release.json: release '${plan.release}' does not match its folder '${release}'`);
  if (!Array.isArray(plan.waves) || plan.waves.length === 0) {
    problems.push("release.json: `waves` must be a non-empty array");
    return problems;
  }
  const waves = new Map(plan.waves.map((w) => [w.id, w]));
  if (waves.size !== plan.waves.length) problems.push("release.json: a wave id is duplicated");
  const cycle = hasCycle(plan.waves);
  if (cycle) problems.push(`release.json: dependsOn has a cycle through ${cycle}`);
  for (const w of plan.waves) {
    if (!/^[A-Z][A-Za-z0-9-]*$/.test(w.id ?? "")) problems.push(`release.json: wave id '${w.id}' must start with a capital letter (W0, C-purchase, WX)`);
    if (w.tier !== undefined && !TIERS.includes(w.tier)) problems.push(`release.json: wave ${w.id} tier '${w.tier}' not one of ${TIERS.join(" ")}`);
    // Priority is a dependency: a high wave waits for every critical wave, a rest wave for every high one.
    const before = w.tier === "high" ? "critical" : w.tier === "rest" ? "high" : null;
    if (before && !cycle) {
      for (const o of plan.waves.filter((x) => x.tier === before)) {
        if (!dependsOnWave(plan.waves, w.id, o.id)) problems.push(`release.json: ${w.tier} wave ${w.id} must depend on ${before} wave ${o.id}`);
      }
    }
    if (!Array.isArray(w.suites) || w.suites.length === 0) problems.push(`release.json: wave ${w.id} has no suites`);
    for (const d of w.dependsOn ?? []) if (!waves.has(d)) problems.push(`release.json: wave ${w.id} depends on unknown wave ${d}`);
    if (waves.has("W0") && w.id !== "W0" && !cycle && !reachesW0(plan.waves, w.id)) problems.push(`release.json: wave ${w.id} does not depend on the W0 smoke gate`);
    if (!states.has(w.id)) problems.push(`waves/${w.id}/state.json is missing — every planned wave has one`);
    // An exclusive suite may also sit in a wave that has ALREADY run (it skipped the suite's env-wide
    // cases, which is why they are here); in a wave still to run it would run in parallel — the
    // exact thing exclusivity exists to prevent.
    for (const x of w.exclusive ?? []) {
      if (!w.suites.includes(x)) problems.push(`release.json: wave ${w.id} lists exclusive '${x}' that is not among its suites`);
      for (const o of plan.waves) {
        if (o.id === w.id || !o.suites?.includes(x)) continue;
        if (!RAN.has(states.get(o.id)?.status ?? "NOT_STARTED")) problems.push(`release.json: exclusive suite ${x} (wave ${w.id}) is also in wave ${o.id}, which has not run — take it out of ${o.id}`);
      }
    }
  }
  for (const [folder, s] of states) {
    const where = `waves/${folder}/state.json`;
    const w = waves.get(folder);
    if (s.wave !== folder) problems.push(`${where}: wave '${s.wave}' does not match its folder`);
    if (!w) { problems.push(`${where}: wave ${folder} is not in release.json`); continue; }
    if (!(WAVE_STATUSES as readonly string[]).includes(s.status)) problems.push(`${where}: status '${s.status}' not one of ${WAVE_STATUSES.join(" ")}`);
    if (!Array.isArray(s.runIds)) problems.push(`${where}: runIds must be an array`);
    if (s.status !== "NOT_STARTED" && !s.owner) problems.push(`${where}: a ${s.status} wave needs an owner`);
    if (s.status !== "NOT_STARTED" && !s.personas) problems.push(`${where}: a ${s.status} wave records which accounts it signs in as (personas)`);
    if (RAN.has(s.status)) {
      if (!s.runIds?.length) problems.push(`${where}: a ${s.status} wave names no runIds`);
      if (!s.totals) problems.push(`${where}: a ${s.status} wave has no totals`);
      if (!isCount(s.untriaged)) problems.push(`${where}: a ${s.status} wave states how many FAILs have no ledger row (untriaged)`);
    }
    if ((s.status === "TRIAGED" || s.status === "DONE") && s.untriaged !== 0) problems.push(`${where}: ${s.status} needs untriaged = 0 (got ${s.untriaged})`);
    if (s.status === "BLOCKED" && !s.notRun?.length) problems.push(`${where}: a BLOCKED wave says in notRun what is blocked and why`);
    if (s.totals) {
      const t = s.totals;
      for (const k of TOTAL_KEYS) if (!isCount(t[k])) problems.push(`${where}: totals.${k} must be a whole number ≥ 0`);
      const sum = t.pass + t.fail + t.blocked + t.skipped + t.ambiguous;
      if (sum !== t.executed) problems.push(`${where}: pass+fail+blocked+skipped+ambiguous = ${sum}, executed = ${t.executed}`);
      if (t.executed > t.planned) problems.push(`${where}: executed exceeds planned`);
      if (isCount(s.untriaged) && s.untriaged! > t.fail) problems.push(`${where}: untriaged exceeds the FAIL count`);
    }
    for (const n of s.notRun ?? []) {
      if (!Array.isArray(n.suites) || !n.suites.length || !n.reason || !isCount(n.cases)) problems.push(`${where}: each notRun entry needs suites[], cases and a reason`);
      for (const id of n.suites ?? []) if (!w.suites.includes(id)) problems.push(`${where}: notRun suite ${id} is not in wave ${folder}`);
    }
  }
  const seen = new Set<string>();
  for (const r of ledger) {
    const where = `waves/${r.wave}/ledger.csv ${r.case_id || "(no case_id)"}`;
    const w = waves.get(r.wave), s = states.get(r.wave);
    if (!r.case_id || !r.suite) problems.push(`${where}: case_id and suite are required`);
    if (w && r.suite && !w.suites.includes(r.suite)) problems.push(`${where}: suite ${r.suite} is not in wave ${r.wave}`);
    if (s && !s.runIds?.includes(r.run_id)) problems.push(`${where}: run_id ${r.run_id} is not in the wave's runIds`);
    const key = `${r.wave}|${r.case_id}|${r.run_id}`;
    if (seen.has(key)) problems.push(`${where}: duplicated for run ${r.run_id} — amend the row, do not append`);
    seen.add(key);
    if (!(CASE_STATUSES as readonly string[]).includes(r.status)) problems.push(`${where}: status '${r.status}' not one of ${CASE_STATUSES.join(" ")}`);
    if (!(VERDICTS as readonly string[]).includes(r.verdict)) problems.push(`${where}: verdict '${r.verdict}' not one of ${VERDICTS.join(" ")}`);
    if (!NEW_IN_RELEASE.includes(r.new_in_release)) problems.push(`${where}: new_in_release must be yes / no / unknown`);
    if (!r.summary || !r.reason) problems.push(`${where}: summary and reason are required — a verdict without its why cannot be re-checked`);
    if (!r.decided_by) problems.push(`${where}: decided_by is required (who decided, or who must decide)`);
    if (r.verdict === "REAL_BUG" && !ISSUE_KEY.test(r.follow_up) && !DRAFT.test(r.follow_up)) problems.push(`${where}: REAL_BUG needs an issue key in follow_up, or DRAFT while it awaits filing`);
    if (r.verdict === "DUPLICATE" && !ISSUE_KEY.test(r.follow_up)) problems.push(`${where}: DUPLICATE needs the existing issue key in follow_up`);
    if (["TEST_DEFECT", "DATA", "ENV_CONFIG"].includes(r.verdict) && !r.follow_up) problems.push(`${where}: ${r.verdict} needs a follow_up (PR, ticket, or OPEN: …)`);
  }
  if (!problems.length) {
    const progress = join(dir, "PROGRESS.md");
    const want = render(plan, summarise(plan, states, ledger));
    if (!existsSync(progress) || readFileSync(progress, "utf-8").replace(/\r\n/g, "\n") !== want) {
      problems.push(`PROGRESS.md is stale — run: npm run release:status -- ${release} --write`);
    }
  }
  return problems;
}

function summarise(plan: Release, states: Map<string, State>, ledger: LedgerRow[]) {
  const rows = plan.waves.map((w) => {
    const s = states.get(w.id);
    const t = s?.totals;
    return {
      wave: w.id, title: w.title, owner: s?.owner ?? "—", status: s?.status ?? "NOT_STARTED",
      planned: t?.planned ?? null, executed: t?.executed ?? null, pass: t?.pass ?? null, fail: t?.fail ?? null, blocked: t?.blocked ?? null,
      untriaged: s?.untriaged ?? null, ledger: ledger.filter((r) => r.wave === w.id).length, runIds: s?.runIds ?? [], notRun: s?.notRun ?? [],
    };
  });
  const verdicts = Object.fromEntries(VERDICTS.map((v) => [v, ledger.filter((r) => r.verdict === v).length]));
  const pending = ledger.filter((r) => r.verdict === "PENDING_DECISION");
  const drafts = ledger.filter((r) => r.verdict === "REAL_BUG" && DRAFT.test(r.follow_up));
  const sum = (k: "executed" | "pass" | "fail" | "blocked") => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  return { rows, verdicts, pending, drafts, totals: { executed: sum("executed"), pass: sum("pass"), fail: sum("fail"), blocked: sum("blocked") } };
}

const n = (v: number | null) => (v === null ? "—" : String(v));
/** A ledger summary in one table cell: no pipes, and short enough that the table stays readable. */
const cell = (s: string) => {
  const t = s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
};

function render(plan: Release, s: ReturnType<typeof summarise>): string {
  const L: string[] = [];
  L.push(`# ${plan.release} — release regression progress`, "");
  L.push("<!-- GENERATED by `npm run release:status -- " + plan.release + " --write` from release.json + waves/*/. Do not edit by hand; on a merge conflict, re-run it. -->", "");
  const meta = [plan.ticket && `Ticket: ${plan.ticket}`, plan.baseline && `Baseline: ${plan.baseline}`, plan.env && `Env: ${Object.values(plan.env).filter(Boolean).join(" · ")}`].filter(Boolean);
  if (meta.length) L.push(meta.join(" · "), "");
  L.push(`**Executed ${s.totals.executed} · PASS ${s.totals.pass} · FAIL ${s.totals.fail} · BLOCKED ${s.totals.blocked}** · ledger ${Object.values(s.verdicts).reduce((a, b) => a + b, 0)} rows`, "");
  L.push("| Wave | Scope | Owner | Status | Planned | Executed | PASS | FAIL | BLOCKED | FAIL without a verdict | Ledger | Runs |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of s.rows) L.push(`| ${r.wave} | ${r.title} | ${r.owner} | ${r.status} | ${n(r.planned)} | ${n(r.executed)} | ${n(r.pass)} | ${n(r.fail)} | ${n(r.blocked)} | ${n(r.untriaged)} | ${r.ledger} | ${r.runIds.join(" ") || "—"} |`);
  L.push("", "## Triage verdicts", "", "| Verdict | Rows |", "|---|---|");
  for (const [v, c] of Object.entries(s.verdicts)) if (c) L.push(`| ${v} | ${c} |`);
  const notRun = s.rows.flatMap((r) => r.notRun.map((x) => ({ ...x, wave: r.wave })));
  if (notRun.length) {
    L.push("", "## Not run yet", "", "| Wave | Suites | Cases | Why |", "|---|---|---|---|");
    for (const x of notRun) L.push(`| ${x.wave} | ${x.suites.join(" ")} | ${x.cases} | ${cell(x.reason)} |`);
  }
  if (s.drafts.length) {
    L.push("", "## Real bugs awaiting filing", "", "| Wave | Case | Summary | New in release | Note |", "|---|---|---|---|---|");
    for (const r of s.drafts) L.push(`| ${r.wave} | ${r.case_id} | ${cell(r.summary)} | ${r.new_in_release} | ${cell(r.follow_up.replace(DRAFT, "").replace(/^[\s:—-]+/, ""))} |`);
  }
  if (s.pending.length) {
    L.push("", "## Decisions pending", "", "| Wave | Case | Question | Who decides |", "|---|---|---|---|");
    for (const r of s.pending) L.push(`| ${r.wave} | ${r.case_id} | ${cell(r.summary)} | ${r.decided_by} |`);
  }
  L.push("", "Per-wave detail: `waves/<wave>/report.md` · verdicts: `waves/<wave>/ledger.csv` · contract: `.claude/skills/qa-run/release-folder.md`.", "");
  return L.join("\n");
}

function checkOne(release: string): boolean {
  const { dir, plan, states, ledger, problems } = load(release)!;
  const found = check(release, dir, plan, states, ledger, problems);
  if (found.length) {
    console.error(`release:check ${release}: ${found.length} problem(s)`);
    for (const p of found) console.error(`  - ${p}`);
    return false;
  }
  console.log(`release:check ${release}: OK — ${plan!.waves.length} waves, ${states.size} state files, ${ledger.length} ledger rows`);
  // A planned suite the manifest does not have (yet) is a note, not a failure: it may land in another PR.
  try {
    const ids = new Set((JSON.parse(readFileSync(join(REPO_ROOT, "config/test-suites.json"), "utf-8")).suites ?? []).map((x: { id: string }) => x.id));
    for (const w of plan!.waves) for (const id of w.suites) if (!ids.has(id)) console.warn(`  note: wave ${w.id} plans suite ${id}, which config/test-suites.json does not have on this branch`);
  } catch { /* manifest unreadable: suites:lint reports it */ }
  return true;
}

const KNOWN_FLAGS = new Set(["--check", "--all", "--write", "--json", "--ledger", "--suites", "--with-baseline"]);

function main(): number {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let suitesArg: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suites") { suitesArg = argv[++i] ?? usage("--suites needs a comma-separated list"); continue; }
    if (a.startsWith("--")) { if (!KNOWN_FLAGS.has(a)) usage(`unknown flag ${a}`); continue; }
    positional.push(a);
  }
  const flag = (f: string) => argv.includes(f);

  if (flag("--all")) {
    if (!flag("--check")) usage("--all is only valid with --check");
    const releases = existsSync(ROOT) ? readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "release.json"))) : [];
    if (!releases.length) console.log("release:check: no release folders under regression/releases/");
    return releases.map(checkOne).every(Boolean) ? 0 : 1;
  }
  if (positional.length !== 1 || !/^[a-z0-9][a-z0-9.-]*$/.test(positional[0])) usage("give exactly one release folder name, e.g. stable-16");
  const release = positional[0];
  if (flag("--check")) return checkOne(release) ? 0 : 1;

  const { dir, plan, states, ledger, problems } = load(release)!;
  if (!plan) {
    for (const p of problems) console.error(p);
    return 1;
  }
  if (flag("--ledger")) {
    const want = suitesArg ? new Set(suitesArg.split(",").map((x) => x.trim()).filter(Boolean)) : null;
    let rows = ledger;
    if (flag("--with-baseline") && plan.baseline) {
      const base = load(plan.baseline, false);
      if (base) rows = [...rows, ...base.ledger];
      else console.error(`release-status: baseline ${plan.baseline} has no release folder — only ${release}'s ledger is listed`);
    }
    console.log(JSON.stringify(rows.filter((r) => !want || want.has(r.suite)), null, 1));
    return 0;
  }
  const s = summarise(plan, states, ledger);
  if (flag("--write")) {
    writeFileSync(join(dir, "PROGRESS.md"), render(plan, s));
    console.log(`written: ${rel(join(dir, "PROGRESS.md"))}`);
  }
  if (flag("--json")) console.log(JSON.stringify(s, null, 1));
  else if (!flag("--write")) console.log(render(plan, s));
  if (problems.length) console.error(`${problems.length} file problem(s) — run release:check`);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? "")) {
  process.exit(main());
}
