#!/usr/bin/env -S npx tsx
/**
 * `npm run bl:fresh` — BL 2.0 freshness (M5, `docs/bug-detection-requirements.md` §7.3 item 3–4, REQ-11): the
 * events that make a rule `SUSPECT`, and the runs that make it `ACTIVE` again. No person queues anything; the
 * full-cycle pipeline calls this twice per run (before Phase 1 and after the regression), so a change at a
 * rule's `code_ref` is re-checked in the same run that saw it.
 *
 * What marks a rule SUSPECT (only an ACTIVE one; the text is never touched):
 *   [code]    a change touches its `scope.code_ref` (`--change "<CHANGE_SOURCE>"` or `--changed repo[:path],…`); a
 *             change known only by its repo (`module <name>`, a bare `--changed <repo>`) touches every rule there
 *   [closed]  a bug closed since the last pass names its id (`--closed`: Jira, `freshness.closed_bugs_jql` from
 *             `freshness.closed_checked_through`, which a written pass moves to today; or `--bugs`)
 *   [age]     its `verified.date` is older than `freshness.verified_max_age_days`, for the `age_trust` levels
 *   [case]    a case citing it failed (`--results <regression run dir>`) — the bug path; `/qa-bug` files it
 *   [check]   its executable check found a violation (`--rerun`) — the bug path as well
 *   [bug]     written by the bug path, not here: `[bug] <KEY> …` once the bug is filed
 *
 * What clears it:
 *   - a `[code]` / `[closed]` / `[age]` suspicion clears on a pass: every case citing the rule in `--results`
 *     passed, or its `check.run` passed under `--rerun`. The pass is stamped into `verified` with the run id.
 *   - a `[bug] <KEY>` suspicion clears only on the Jira decision (`--resolve`): a `freshness.resolutions.holds`
 *     resolution makes it ACTIVE and adds the resolution to `source`; a `rewrite` one is listed for the agent
 *     that rewrites the rule from the resolution (`bl-audit-criteria.md` RESOLVE). Anything else changes nothing.
 *   - `[case]` / `[check]` wait for the bug to be filed. A suspicion written by a person (no tag) is never
 *     cleared by this script.
 *
 * The settings (age threshold, JQL, which resolutions decide what) live in `bl/_oracle.yaml` `freshness`, never
 * here. Edits go through the yaml Document API, so only the changed fields of a record change on disk; the
 * generated views are re-rendered after a write.
 *
 * Usage:
 *   npm run bl:fresh -- --change "module catalog" --age --closed            # dry run: what would change
 *   npm run bl:fresh -- --results reports/regression/<RUN> --rerun --write
 *   npm run bl:fresh -- --resolve --write [--bugs bugs.json]               # bugs.json: [{key, resolution, resolved?, text?}]
 *   flags: --run-id <id> (default: the --results dir name) · --version <build> · --today YYYY-MM-DD · --json
 *
 * Exit codes: 0 done (with or without changes) · 3 an input that was asked for could not be read (no Jira
 * credentials, Jira refused, no such results dir, no `freshness` block) · 1 is `config.js` refusing a missing core
 * env var on the Jira or check path. Neither 1 nor 3 writes anything.
 */
import "../lib/sync-stdio.mjs";
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml, parseDocument } from "yaml";
import { BL_DIR, loadBl, renderViews, type BlRule, type BlSource } from "./bl-yaml.ts";
import { buildCoverage, extractReferencedBlIds } from "./lint-bl.ts";
import { adfText, jiraSearch } from "../lib/jira-search.ts";
import { flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";
import { normalizeStatus, readRunSuites } from "../lib/regression-triage.ts";
import { placeChange } from "../../ci/lib/affected-suites.ts";

const SUITES_DIR = "regression/suites";
/** `npx` is `npx.cmd` on Windows and execFileSync has no shell: run tsx's CLI under this node instead. */
const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
/** The bug key a `[bug]` reason waits on: the first token after the tag, nothing found later in the prose. */
const BUG_KEY_RE = /^\[bug\]\s+([A-Z][A-Z0-9]+-\d+)\b/;

export type Tag = "code" | "closed" | "age" | "case" | "check" | "bug";
/** Suspicions raised because something around the rule moved, not because it failed: a pass clears them. */
const CLEARABLE: ReadonlySet<Tag> = new Set(["code", "closed", "age"]);

export interface Freshness {
  verified_max_age_days: number;
  age_trust: string[];
  closed_bugs_jql: string;
  /** The day the last `--closed --write` pass read through; the next pass asks Jira for bugs resolved since then. */
  closed_checked_through?: string;
  resolutions: { holds: string[]; rewrite: string[] };
}
export type Op = "MARK-SUSPECT" | "RE-VERIFIED" | "RESOLVE" | "REWRITE" | "NO-DECISION" | "NOT-RUN";
export interface Edit {
  id: string;
  op: Op;
  note: string;
  /** Absent for a report-only op. `null` removes the field. */
  set?: { status?: BlRule["status"]; suspect_reason?: string | null; verified?: BlRule["verified"] };
  addSource?: BlSource;
}
export interface ClosedBug { key: string; resolution: string | null; resolved?: string; text?: string }
export interface CaseOutcome { caseId: string; status: string }
export interface Stamp { runId: string; today: string; version?: string }

export function reasonTag(reason: string | null | undefined): Tag | null {
  const m = /^\[(code|closed|age|case|check|bug)\]\s/.exec(reason ?? "");
  return m ? (m[1] as Tag) : null;
}

const clearable = (r: BlRule) => r.status === "SUSPECT" && CLEARABLE.has(reasonTag(r.suspect_reason) as Tag);
const verifiedBy = (s: Stamp): NonNullable<BlRule["verified"]> => ({ date: s.today, ...(s.version ? { version: s.version } : {}), by: s.runId });
const suspect = (id: string, reason: string): Edit => ({ id, op: "MARK-SUSPECT", note: reason, set: { status: "SUSPECT", suspect_reason: reason } });
const cleared = (id: string, s: Stamp, why: string): Edit => ({ id, op: "RE-VERIFIED", note: why, set: { status: "ACTIVE", suspect_reason: null, verified: verifiedBy(s) } });
const normPath = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "");

/** `<repo>:<path>[#symbol]` — null when the record carries no parseable code_ref. */
export function parseCodeRef(ref: string | undefined): { repo: string; path: string } | null {
  const m = /^([A-Za-z0-9._-]+):([^#\s]+)(?:#.+)?$/.exec(ref ?? "");
  return m ? { repo: m[1].toLowerCase(), path: normPath(m[2]) } : null;
}

/**
 * [code]: an ACTIVE rule whose code_ref the change touches. A ref ending in `/` is a directory. `paths: "all"` is a
 * change known only by its repo (`module <name>`, a release of that module): every rule implemented there is touched.
 */
export function markCode(rules: readonly BlRule[], change: { repo: string; paths: readonly string[] | "all"; label: string }): Edit[] {
  const repo = change.repo.toLowerCase();
  const paths = change.paths === "all" ? null : change.paths.map(normPath);
  const out: Edit[] = [];
  for (const r of rules) {
    const ref = parseCodeRef(r.scope?.code_ref);
    if (r.status !== "ACTIVE" || !ref || ref.repo !== repo) continue;
    const hit = paths ? paths.find((p) => p === ref.path || (ref.path.endsWith("/") && p.startsWith(ref.path))) : ref.path;
    if (hit) out.push(suspect(r.id, `[code] ${change.label} changed ${repo}${paths ? `:${hit}` : ""}`));
  }
  return out;
}

/** [age]: an ACTIVE rule of an `age_trust` level whose last verification is older than the threshold. */
export function markAge(rules: readonly BlRule[], today: string, cfg: Pick<Freshness, "verified_max_age_days" | "age_trust">): Edit[] {
  const now = Date.parse(today);
  return rules
    .filter((r) => r.status === "ACTIVE" && cfg.age_trust.includes(r.trust) && r.verified?.date)
    .filter((r) => (now - Date.parse(r.verified!.date)) / 86_400_000 > cfg.verified_max_age_days)
    .map((r) => suspect(r.id, `[age] verified ${r.verified!.date}, more than ${cfg.verified_max_age_days} days ago`));
}

/**
 * [closed]: an ACTIVE rule named by a closed bug. Skipped when the rule already cites the bug in `source` (it was
 * resolved from it) or was verified on or after the bug closed — so a bug inside the JQL window marks once.
 */
export function markClosed(rules: readonly BlRule[], bugs: readonly ClosedBug[]): Edit[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const out = new Map<string, Edit>();
  for (const b of bugs) {
    if (!b.resolution) continue;
    for (const id of new Set(extractReferencedBlIds(b.text ?? ""))) {
      const r = byId.get(id);
      if (!r || r.status !== "ACTIVE" || out.has(id)) continue;
      const cited = new RegExp(`(^|[^A-Z0-9-])${b.key}(?![0-9])`);
      if (r.source.some((s) => cited.test(s.ref))) continue;
      if (r.verified && b.resolved && r.verified.date >= b.resolved.slice(0, 10)) continue;
      out.set(id, suspect(id, `[closed] ${b.key} (${b.resolution}) names this rule`));
    }
  }
  return [...out.values()];
}

/** The bug keys the `[bug]` suspicions wait on. */
export function pendingBugKeys(rules: readonly BlRule[]): string[] {
  return [...new Set(rules.filter((r) => r.status === "SUSPECT").map((r) => BUG_KEY_RE.exec(r.suspect_reason ?? "")?.[1]).filter((k): k is string => !!k))];
}

/** RESOLVE: the Jira decision on the bug a `[bug]` suspicion names. `decisions`: key → resolution (null = open). */
export function resolve(rules: readonly BlRule[], decisions: ReadonlyMap<string, string | null>, cfg: Pick<Freshness, "resolutions">): Edit[] {
  const out: Edit[] = [];
  for (const r of rules) {
    if (r.status !== "SUSPECT" || reasonTag(r.suspect_reason) !== "bug") continue;
    const key = BUG_KEY_RE.exec(r.suspect_reason!)?.[1];
    const res = key ? decisions.get(key) : undefined;
    if (!key || !res) continue;
    if (cfg.resolutions.holds.includes(res)) {
      out.push({ id: r.id, op: "RESOLVE", note: `${key} ${res}`, set: { status: "ACTIVE", suspect_reason: null }, addSource: { kind: "resolution", ref: `${key} (${res}) — the violation was fixed; the rule holds` } });
    } else if (cfg.resolutions.rewrite.includes(res)) {
      out.push({ id: r.id, op: "REWRITE", note: `${key} ${res}: rewrite the rule from the resolution, then RESOLVE (bl-audit-criteria.md §1)` });
    } else {
      out.push({ id: r.id, op: "NO-DECISION", note: `${key} ${res} is not a decision on the rule; it stays SUSPECT` });
    }
  }
  return out;
}

/**
 * A regression run: a failing citing case marks the rule `[case]` (a clearable suspicion is replaced — a
 * failure is the stronger signal); all citing cases passing clears a clearable suspicion and stamps `verified`
 * on an ACTIVE rule. BLOCKED / SKIPPED cases say nothing. A rule waiting on a bug is left alone.
 */
export function fromResults(rules: readonly BlRule[], outcomes: readonly CaseOutcome[], blByCase: ReadonlyMap<string, readonly string[]>, s: Stamp): Edit[] {
  const pass = new Map<string, string[]>();
  const fail = new Map<string, string[]>();
  for (const o of outcomes) {
    const v = normalizeStatus(o.status);
    const into = v === "PASS" ? pass : v === "FAIL" ? fail : null;
    if (!into) continue;
    for (const id of blByCase.get(o.caseId) ?? []) into.set(id, [...(into.get(id) ?? []), o.caseId]);
  }
  const out: Edit[] = [];
  for (const r of rules) {
    const failed = fail.get(r.id);
    if (failed && (r.status === "ACTIVE" || clearable(r))) out.push(suspect(r.id, `[case] ${failed.join(", ")} failed in ${s.runId}`));
    else if (!failed && pass.has(r.id)) {
      const why = `${pass.get(r.id)!.join(", ")} passed in ${s.runId}`;
      if (clearable(r)) out.push(cleared(r.id, s, why));
      else if (r.status === "ACTIVE") out.push({ id: r.id, op: "RE-VERIFIED", note: why, set: { verified: verifiedBy(s) } });
    }
  }
  return out;
}

/** RE-RUN: each clearably SUSPECT rule with a `check.run`. `run` returns the inv:run exit code (0 pass · 2 violated · else could not run). */
export function rerun(rules: readonly BlRule[], run: (args: readonly string[]) => number, s: Stamp): Edit[] {
  const out: Edit[] = [];
  for (const r of rules) {
    if (!clearable(r) || r.check.kind !== "executable" || !r.check.run) continue;
    const label = `inv:run ${r.check.run.join(" ")}`;
    const code = run(r.check.run);
    if (code === 0) out.push(cleared(r.id, s, `${label} passed in ${s.runId}`));
    else if (code === 2) out.push(suspect(r.id, `[check] ${label} found a violation in ${s.runId}`));
    else out.push({ id: r.id, op: "NOT-RUN", note: `${label} could not run (exit ${code}); nothing changes` });
  }
  return out;
}

/** Apply edits to records in memory, in order. Returns the ids that changed. */
export function applyEdits(rules: Map<string, BlRule>, edits: readonly Edit[]): Set<string> {
  const changed = new Set<string>();
  for (const e of edits) {
    const r = rules.get(e.id);
    if (!r || (!e.set && !e.addSource)) continue;
    const next: BlRule = { ...r, source: [...r.source] };
    for (const [k, v] of Object.entries(e.set ?? {})) {
      if (v === null) delete (next as unknown as Record<string, unknown>)[k];
      else (next as unknown as Record<string, unknown>)[k] = v;
    }
    if (e.addSource && !next.source.some((x) => x.ref === e.addSource!.ref)) next.source.push(e.addSource);
    rules.set(e.id, next);
    changed.add(e.id);
  }
  return changed;
}

const FIELDS = ["status", "suspect_reason", "verified", "source"] as const;

/** Write the changed fields of the changed records into their domain files, leaving every other byte alone. */
export function writeRecords(next: ReadonlyMap<string, BlRule>, changed: ReadonlySet<string>, dir = BL_DIR): string[] {
  const touched: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml") && !x.startsWith("_"))) {
    const path = join(dir, f);
    const doc = parseDocument(readFileSync(path, "utf-8"));
    const rules = (doc.toJS() as { rules: BlRule[] }).rules ?? [];
    let dirty = false;
    rules.forEach((old, i) => {
      if (!changed.has(old.id)) return;
      const r = next.get(old.id)!;
      for (const k of FIELDS) {
        if (JSON.stringify(old[k]) === JSON.stringify(r[k])) continue;
        if (r[k] === undefined) doc.deleteIn(["rules", i, k]);
        else doc.setIn(["rules", i, k], doc.createNode(r[k]));
        dirty = true;
      }
    });
    if (dirty) {
      writeFileSync(path, doc.toString({ lineWidth: 0 }));
      touched.push(path);
    }
  }
  return touched;
}

export function readFreshness(dir = BL_DIR): Freshness {
  const cfg = (parseYaml(readFileSync(join(dir, "_oracle.yaml"), "utf-8")) as { freshness?: Freshness }).freshness;
  if (!cfg) throw new Error(`bl/_oracle.yaml has no freshness block`);
  return cfg;
}

/**
 * Every case outcome of a regression run dir, through the reader triage and `tc:promote` use (`readRunSuites`):
 * batch and lane envelopes, the live JSONL folded in, an unparseable envelope skipped rather than fatal.
 */
export function readRunOutcomes(dir: string): CaseOutcome[] {
  return readRunSuites(dir).flatMap((suite) => suite.cases.map((c) => ({ caseId: c.id, status: c.status })));
}

function invRun(args: readonly string[]): number {
  try {
    // The check's own output goes to stderr, so `--json` stays one JSON document on stdout.
    execFileSync(process.execPath, [TSX_CLI, "scripts/invariants/run.ts", ...args], { stdio: ["ignore", 2, 2] });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 3;
  }
}

/** config.js announces itself on stdout when Jira first loads it; keep stdout for the report. */
async function quietly<T>(f: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = console.error;
  try {
    return await f();
  } finally {
    console.log = log;
  }
}

async function closedBugs(jql: string): Promise<ClosedBug[]> {
  const issues = await quietly(() => jiraSearch(jql, ["summary", "description", "labels", "resolution", "resolutiondate"]));
  return issues.map((i) => {
    const f = i.fields as { summary?: string; description?: unknown; labels?: string[]; resolution?: { name?: string } | null; resolutiondate?: string };
    return { key: i.key, resolution: f.resolution?.name ?? null, resolved: f.resolutiondate, text: [f.summary ?? "", adfText(f.description), ...(f.labels ?? [])].join(" ") };
  });
}

/**
 * The Jira decisions on `keys`. One query for all of them, and per key when Jira refuses the batch (it rejects
 * the whole `key in (…)` for one unknown or invisible key), so one bad reason cannot block every other decision.
 */
async function decisionsFor(keys: readonly string[], notes: string[]): Promise<ClosedBug[]> {
  if (!keys.length) return [];
  try {
    return await closedBugs(`key in (${keys.join(",")})`);
  } catch {
    const out: ClosedBug[] = [];
    for (const k of keys) {
      try {
        out.push(...(await closedBugs(`key = ${k}`)));
      } catch (e) {
        notes.push(`${k}: Jira refused it (${(e as Error).message.slice(0, 80)}); its rule stays SUSPECT`);
      }
    }
    return out;
  }
}

/** Record how far `--closed` has read, in `bl/_oracle.yaml`, leaving every other byte alone. */
function writeCheckedThrough(day: string, dir = BL_DIR) {
  const path = join(dir, "_oracle.yaml");
  const doc = parseDocument(readFileSync(path, "utf-8"));
  doc.setIn(["freshness", "closed_checked_through"], day);
  writeFileSync(path, doc.toString({ lineWidth: 0 }));
}

async function main(argv: string[]): Promise<number> {
  const valued = ["--change", "--changed", "--results", "--bugs", "--run-id", "--version", "--today"];
  rejectUnknownFlags(argv, [...valued, "--age", "--closed", "--resolve", "--rerun", "--write", "--json"], valued);
  const today = flagValue(argv, "--today") ?? new Date().toISOString().slice(0, 10);
  const resultsDir = flagValue(argv, "--results");
  const stamp: Stamp = { today, runId: flagValue(argv, "--run-id") ?? (resultsDir ? basename(resultsDir) : `bl-fresh-${today}`), version: flagValue(argv, "--version") };
  let cfg: Freshness;
  let original: Map<string, BlRule>;
  try {
    cfg = readFreshness();
    original = new Map(loadBl().domains.flatMap((d) => d.file.rules.map((r) => [r.id, r] as const)));
  } catch (e) {
    console.error(`bl:fresh: ${(e as Error).message}; nothing written`);
    return 3;
  }
  const state = new Map(original);
  const edits: Edit[] = [];
  const notes: string[] = [];
  const step = (make: (rules: BlRule[]) => Edit[]) => {
    const e = make([...state.values()]);
    applyEdits(state, e);
    edits.push(...e);
  };

  let bugFile: ClosedBug[] | undefined;
  try {
    const bugsPath = flagValue(argv, "--bugs");
    if (bugsPath) bugFile = JSON.parse(readFileSync(bugsPath, "utf-8")) as ClosedBug[];
    if (resultsDir && !existsSync(resultsDir)) throw new Error(`no results dir ${resultsDir}`);

    // 1. Events that mark.
    const changes: { repo: string; paths: string[] | "all"; label: string }[] = [];
    const changeSource = flagValue(argv, "--change");
    if (changeSource) {
      const placed = placeChange(changeSource);
      // `module <name>` places a repo, not files (its one "path" is the module name): the whole repo changed.
      const wholeRepo = /^module\s/i.test(changeSource.trim());
      if (placed) changes.push({ repo: placed.repo, paths: wholeRepo ? "all" : [...placed.paths], label: changeSource });
      else notes.push(`"${changeSource}" could not be placed to a repo and paths; no [code] marks (pass --changed repo[:path],…)`);
    }
    for (const item of (flagValue(argv, "--changed") ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const ref = parseCodeRef(item);
      if (ref) changes.push({ repo: ref.repo, paths: [ref.path], label: "--changed" });
      else if (/^[A-Za-z0-9._-]+$/.test(item)) changes.push({ repo: item, paths: "all", label: "--changed" });
      else notes.push(`--changed "${item}" is neither repo nor repo:path; ignored`);
    }
    for (const c of changes) step((rules) => markCode(rules, c));
    if (changes.length) {
      const reachable = [...state.values()].filter((r) => parseCodeRef(r.scope?.code_ref)).length;
      notes.push(`${reachable} of ${state.size} rules carry a scope.code_ref a change can reach`);
    }
    if (argv.includes("--age")) step((rules) => markAge(rules, today, cfg));
    if (argv.includes("--closed")) {
      // From the day the last pass read through, so a cycle run weeks apart still sees every bug closed between.
      const since = cfg.closed_checked_through ?? today;
      const bugs = bugFile ?? (await closedBugs(`${cfg.closed_bugs_jql} AND resolved >= "${since}"`));
      step((rules) => markClosed(rules, bugs));
    }

    // 2. Jira decisions on the bugs SUSPECT rules wait on.
    if (argv.includes("--resolve")) {
      const keys = pendingBugKeys([...state.values()]);
      const found = bugFile ?? (await decisionsFor(keys, notes));
      const decisions = new Map(found.map((b) => [b.key, b.resolution] as const));
      step((rules) => resolve(rules, decisions, cfg));
    }

    // 3. What a run observed.
    if (resultsDir) {
      const byCase = new Map<string, string[]>();
      for (const [bl, cases] of buildCoverage(SUITES_DIR).byBl) for (const c of cases) byCase.set(c, [...(byCase.get(c) ?? []), bl]);
      step((rules) => fromResults(rules, readRunOutcomes(resultsDir), byCase, stamp));
    }
    if (argv.includes("--rerun")) step((rules) => rerun(rules, invRun, stamp));
  } catch (e) {
    console.error(`bl:fresh: ${(e as Error).message}; nothing written`);
    return 3;
  }

  const changed = new Set([...state.keys()].filter((id) => state.get(id) !== original.get(id)));
  const write = argv.includes("--write");
  const touched = write && changed.size ? writeRecords(state, changed) : [];
  if (touched.length) renderViews();
  if (write && argv.includes("--closed") && !flagValue(argv, "--bugs")) writeCheckedThrough(today);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ runId: stamp.runId, written: write, changed: [...changed], edits, notes }, null, 2));
    return 0;
  }
  for (const e of edits) console.log(`  ${e.op.padEnd(12)} ${e.id.padEnd(14)} ${e.note}`);
  for (const n of notes) console.log(`  note: ${n}`);
  const suspects = [...state.values()].filter((r) => r.status === "SUSPECT").length;
  console.log(`bl:fresh: ${changed.size} record(s) ${write ? "changed" : "would change"}${touched.length ? ` in ${touched.length} file(s), views re-rendered` : ""}; ${suspects} SUSPECT after this run${write ? "" : " (dry run — pass --write)"}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).then((c) => process.exit(c));
