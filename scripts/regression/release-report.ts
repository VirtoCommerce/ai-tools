#!/usr/bin/env node
/**
 * release-report — what a release regression tells the tracker, one report per finished wave.
 *
 *   npm run release:report -- <release> --wave <W>              # build the reports, write nothing outward
 *   npm run release:report -- <release> --wave <W> --as-of <W>  # the release as it stood when <W> finished
 *   npm run release:report -- <release> --subtasks [--apply]    # one Subtask per wave under the release ticket
 *   npm run release:report -- <release> --wave <W> --post       # comment on the wave sub-task and the release ticket
 *   … [--reports <dir>]   the run folders (default reports/regression) · [--out <dir>] where the reports are written
 *
 * WHY A NEW COMMENT PER WAVE, NOT ONE AMENDED COMMENT. A wave is its own run, so a new comment is the rule
 * (rules/reports.md §0: one comment per ticket per RUN), and only a new comment notifies anybody — an amend is
 * silent. Each release-ticket comment carries the WHOLE release as of that wave, so the latest one is always
 * the current state and the earlier ones are its history. Re-running `--post` for the same wave amends that
 * wave's own comments (their ids are kept in `state.json` `reports`), never posts a second copy.
 *
 * WHAT GOES WHERE.
 *   wave sub-task   — the run's own dashboard (`regression-report.html`, its summary part as an inline PNG; the
 *                     HTML attached), the wave's numbers, its real bugs, what was not run and why.
 *   release ticket  — the release dashboard (every wave, its status, numbers, owner; real bugs; decisions) as an
 *                     inline PNG, then "what this wave added", then the full real-bug list.
 * Everything is DERIVED — release.json, the waves' state.json and ledger.csv, the run folders. Nothing is typed.
 *
 * Outward-facing: `--post` and `--subtasks --apply` write to the shared tracker, so /qa-run asks first
 * (skills/qa-run/waves.md Step 7). Without them this script only writes files under `--out`.
 *
 * Exit codes: 0 done · 1 usage / missing input · 2 a tracker write failed.
 */
import "../lib/sync-stdio.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";

const ROOT = process.env.QA_RUN_HOME || process.cwd();

interface WaveDef { id: string; title?: string; suites?: string[]; subtask?: string; tier?: string }
interface Release { release: string; ticket: string; baseline?: string; bundle?: { from?: string; to?: string }; env?: { testEnv?: string; platform?: string; theme?: string }; waves: WaveDef[] }
interface Totals { planned: number; executed: number; pass: number; fail: number; blocked: number; skipped: number; ambiguous: number }
interface State {
  wave: string; owner: string | null; status: string; runIds: string[]; totals?: Partial<Totals>; untriaged?: number;
  notRun?: { suites: string[]; cases: number; reason: string }[];
  reports?: Record<string, { subtask?: string; release?: string }>;
  [k: string]: unknown;
}
interface Row { case_id: string; suite: string; verdict: string; new_in_release: string; summary: string; follow_up: string; [k: string]: string }

const RUN_STATES = new Set(["RUN_DONE", "TRIAGED", "DONE"]);
const ISSUE = /^[A-Z][A-Z0-9]+-\d+$/;

function args(argv: string[]) {
  const a = { release: "", wave: "", asOf: "", subtasks: false, apply: false, post: false, reports: join(ROOT, "reports", "regression"), out: "" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i], next = () => argv[++i] ?? "";
    if (v === "--wave") a.wave = next(); else if (v === "--as-of") a.asOf = next();
    else if (v === "--subtasks") a.subtasks = true; else if (v === "--apply") a.apply = true; else if (v === "--post") a.post = true;
    else if (v === "--reports") a.reports = resolve(next()); else if (v === "--out") a.out = resolve(next());
    else if (v.startsWith("--")) fail(`unknown argument ${v}`);
    else if (!a.release) a.release = v; else fail(`unexpected argument ${v}`);
  }
  if (!a.release) fail("give the release folder name (e.g. stable-16)");
  if (!a.subtasks && !a.wave) fail("--wave <W> or --subtasks");
  return a;
}
function fail(m: string): never { console.error(`release:report: ${m}`); process.exit(1); }

const relDir = (r: string) => join(ROOT, "regression", "releases", r);
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Jira wiki: a literal { [ ] | would open a macro, a link or a cell. */
const wiki = (s: string) => s.replace(/[{}[\]|]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");

function load(release: string) {
  const dir = relDir(release);
  if (!existsSync(join(dir, "release.json"))) fail(`no ${join(dir, "release.json")}`);
  const rel = readJson<Release>(join(dir, "release.json"));
  const states = new Map<string, State>();
  const ledgers = new Map<string, Row[]>();
  for (const w of rel.waves) {
    const sp = join(dir, "waves", w.id, "state.json");
    states.set(w.id, existsSync(sp) ? readJson<State>(sp) : { wave: w.id, owner: null, status: "NOT_STARTED", runIds: [] });
    const lp = join(dir, "waves", w.id, "ledger.csv");
    ledgers.set(w.id, existsSync(lp) ? (parseCsv(readFileSync(lp, "utf-8").replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true }) as Row[]) : []);
  }
  return { dir, rel, states, ledgers };
}

/** One entry per defect: a filed key once, a DRAFT once; "DRAFT: same defect as X" folds into X. */
function realBugs(rows: Row[]) {
  const out = new Map<string, { id: string; filed: boolean; isNew: boolean; summary: string; suite: string }>();
  for (const r of rows) {
    if (r.verdict !== "REAL_BUG") continue;
    const f = (r.follow_up ?? "").trim();
    if (/^DRAFT:\s*same defect as/i.test(f)) continue;
    const id = ISSUE.test(f) ? f : r.case_id;
    if (!out.has(id)) out.set(id, { id, filed: ISSUE.test(f), isNew: r.new_in_release === "yes", summary: r.summary, suite: r.suite });
  }
  return [...out.values()];
}

/** The release as it stood when `asOf` finished: later waves are shown as not started. */
function snapshot(L: ReturnType<typeof load>, asOf: string) {
  const idx = L.rel.waves.findIndex((w) => w.id === asOf);
  if (idx < 0) fail(`no wave ${asOf} in release.json`);
  const waves = L.rel.waves.map((w, i) => {
    const s = L.states.get(w.id)!;
    const later = i > idx;
    const st: State = later ? { wave: w.id, owner: null, status: "NOT_STARTED", runIds: [] } : s;
    const t = { planned: 0, executed: 0, pass: 0, fail: 0, blocked: 0, skipped: 0, ambiguous: 0, ...(st.totals ?? {}) } as Totals;
    return { def: w, st, t, rows: later ? [] : L.ledgers.get(w.id)! };
  });
  const run = waves.filter((w) => RUN_STATES.has(w.st.status));
  const sum = (k: keyof Totals) => run.reduce((n, w) => n + w.t[k], 0);
  const bugs = realBugs(run.flatMap((w) => w.rows));
  const decisions = run.flatMap((w) => w.rows.filter((r) => r.verdict === "PENDING_DECISION"));
  return { waves, run, executed: sum("executed"), planned: sum("planned"), pass: sum("pass"), bugs, decisions };
}

function releaseHtml(rel: Release, snap: ReturnType<typeof snapshot>, asOf: string): string {
  const bar = (t: Totals) => {
    const n = t.executed || 1, seg = (v: number, c: string) => (v ? `<div class="${c}" style="width:${(v / n) * 100}%"></div>` : "");
    return `<div class="bar">${t.executed ? seg(t.pass, "p") + seg(t.fail, "f") + seg(t.blocked, "bl") + seg(t.executed - t.pass - t.fail - t.blocked, "o") : ""}</div>`;
  };
  const tile = (w: (typeof snap.waves)[number]) => {
    const ran = RUN_STATES.has(w.st.status);
    const n = ran
      ? `${fmt(w.t.executed)}${w.t.planned > w.t.executed ? ` / ${fmt(w.t.planned)}` : ""} · ${esc(w.st.owner ?? "—")}${w.st.untriaged ? ` · ${w.st.untriaged} without a verdict` : ""}`
      : w.st.status === "NOT_STARTED" ? `${w.def.suites?.length ?? 0} suites · ${w.st.owner ? esc(w.st.owner) : "free"}` : `${esc(w.st.owner ?? "—")}`;
    return `<div class="tile"><div class="t"><b>${esc(w.def.id)} ${esc(short(w.def.title ?? ""))}</b><span class="st ${w.st.status}">${w.st.status.replace("_", " ")}</span></div>${bar(w.t)}<div class="n">${n}</div></div>`;
  };
  const newBugs = snap.bugs.filter((b) => b.isNew);
  const bugLine = newBugs.slice(0, 2).map((b) => `<span class="new">NEW</span> ${esc(b.filed ? `${b.id} ` : "")}${esc(trim(b.summary, 58))}`).join(" · ");
  const rest = snap.bugs.length - Math.min(2, newBugs.length);
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font-family:Inter,"Segoe UI",Arial,sans-serif}
.db{color:#1b1f2a;border:1px solid #e3e6ee;border-radius:10px;padding:18px;font-size:13px;width:760px;background:#fff}
.db h4{margin:0 0 2px;font-size:16px}.sub{color:#667;font-size:12px;margin-bottom:12px}
.kpis{display:flex;gap:10px;margin-bottom:14px}.kpi{flex:1;border:1px solid #e3e6ee;border-radius:8px;padding:8px 10px}
.kpi b{display:block;font-size:20px}.kpi span{color:#667;font-size:11px}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:#eef0f5}
.p{background:#2e9e5b}.f{background:#d64545}.bl{background:#e8a33a}.o{background:#a7adbb}
.st{font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;letter-spacing:.03em;white-space:nowrap}
.DONE{background:#dff3e6;color:#1f7a45}.TRIAGED{background:#e0ecff;color:#2456b5}.RUN_DONE{background:#fff1d9;color:#9a6200}
.NOT_STARTED,.BLOCKED{background:#eef0f5;color:#667}.RUNNING,.CLAIMED{background:#ffe4e4;color:#b03030}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tile{border:1px solid #e3e6ee;border-radius:8px;padding:8px}
.tile .t{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px}.tile .n{color:#667;font-size:11px;margin-top:4px}
.bugs{margin-top:12px;border-top:1px solid #e3e6ee;padding-top:8px;font-size:12px}.new{color:#b03030;font-weight:700}
.legend{color:#667;font-size:11px;margin-top:6px}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 3px 0 8px;vertical-align:-1px}
</style><div class="db" id="db">
<h4>${esc(title(rel))} · regression</h4>
<div class="sub">${esc([rel.bundle?.from && rel.bundle?.to ? `bundles/${rel.bundle.from} → ${rel.bundle.to}` : "", rel.env?.testEnv ?? "", `updated after ${asOf}`].filter(Boolean).join(" · "))}</div>
<div class="kpis">
<div class="kpi"><b>${snap.run.length} / ${snap.waves.length}</b><span>waves run</span></div>
<div class="kpi"><b>${fmt(snap.executed)}</b><span>executed (of ${fmt(snap.planned)} planned in those waves)</span></div>
<div class="kpi"><b>${pct(snap.pass, snap.executed)}%</b><span>PASS</span></div>
<div class="kpi"><b style="color:#b03030">${snap.bugs.length}${newBugs.length ? ` · ${newBugs.length} new` : ""}</b><span>real bugs · ${snap.bugs.filter((b) => b.filed).length} filed, ${snap.bugs.filter((b) => !b.filed).length} to file</span></div>
</div>
<div class="grid">${snap.waves.map(tile).join("")}</div>
<div class="legend"><i class="p"></i>PASS<i class="f"></i>FAIL<i class="bl"></i>BLOCKED<i class="o"></i>other</div>
<div class="bugs"><b>Real bugs:</b> ${bugLine || "none new in this release"}${rest > 0 ? ` · ${rest} more → in the comment` : ""}<br><b>Pending decisions:</b> ${snap.decisions.length}</div>
</div>`;
}
/** A tile has room for about two words: "Theme cross-cutting + gap sessions" → "Theme cross-cutting". */
const short = (t: string) => t.split(/[,&(+]| and /)[0].trim().split(/\s+/).slice(0, 2).join(" ");
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const title = (rel: Release) => rel.release.replace(/^stable-(\d+)$/, "Stable $1");

async function png(html: string | null, file: string | null, out: string, opts: { clipBefore?: string; selector?: string; width: number }) {
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: opts.width, height: 900 } });
    if (html !== null) await p.setContent(html, { waitUntil: "load" });
    else await p.goto(pathToFileURL(file!).href, { waitUntil: "load" });
    await p.waitForTimeout(500);
    if (opts.selector) { await p.locator(opts.selector).screenshot({ path: out }); return; }
    // The run dashboard's summary is everything above its evidence gallery.
    const bottom = await p.evaluate((needle) => {
      const h = [...document.querySelectorAll("h1,h2,h3")].find((e) => e.textContent?.includes(needle!));
      return h ? Math.round(h.getBoundingClientRect().top + window.scrollY) - 12 : 900;
    }, opts.clipBefore ?? "");
    await p.setViewportSize({ width: opts.width, height: Math.max(300, bottom) });
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: opts.width, height: Math.max(300, bottom) } });
  } finally { await b.close(); }
}

function waveTotalsLine(t: Totals) {
  return `${fmt(t.executed)}${t.planned > t.executed ? ` of ${fmt(t.planned)}` : ""} executed · ${fmt(t.pass)} PASS · ${fmt(t.fail)} FAIL · ${fmt(t.blocked)} BLOCKED · ${fmt(t.skipped)} skipped${t.ambiguous ? ` · ${t.ambiguous} ambiguous` : ""}`;
}
function bugTable(bugs: ReturnType<typeof realBugs>) {
  if (!bugs.length) return "No real bug.";
  return ["||Bug||New in this release||Suite||Summary||", ...bugs.map((b) => `|${b.filed ? b.id : `${b.id} (not filed yet)`}|${b.isNew ? "*yes*" : "no"}|${b.suite}|${wiki(trim(b.summary, 160))}|`)].join("\n");
}
function verdictCounts(rows: Row[]) {
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.verdict, (n.get(r.verdict) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([v, k]) => `${v} ${k}`).join(" · ") || "no row yet";
}

async function build(a: ReturnType<typeof args>) {
  const L = load(a.release);
  const asOf = a.asOf || a.wave;
  const snap = snapshot(L, asOf);
  const w = snap.waves.find((x) => x.def.id === a.wave);
  if (!w) fail(`no wave ${a.wave}`);
  if (!RUN_STATES.has(w.st.status)) fail(`${a.wave} is ${w.st.status} — a report is written once the wave has run`);
  const out = a.out || join(ROOT, "reports", "regression", "releases", a.release, a.wave);
  mkdirSync(out, { recursive: true });
  const base = `${a.release}-${a.wave}`;

  // 1. The release dashboard.
  const relHtml = releaseHtml(L.rel, snap, asOf);
  writeFileSync(join(out, `${base}-release.html`), relHtml);
  const relPng = join(out, `${base}-release.png`);
  await png(relHtml, null, relPng, { selector: "#db", width: 800 });

  // 2. The wave's own run dashboards — one per run id, generated when the run folder has none yet.
  const runPngs: string[] = [], runHtml: string[] = [];
  for (const id of w.st.runIds) {
    const h = join(a.reports, id, "regression-report.html");
    if (!existsSync(h) && existsSync(join(a.reports, id))) {
      spawnSync(process.execPath, [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(ROOT, "scripts", "regression", "generate-regression-html-report.ts"), "--run-id", id], { cwd: resolve(a.reports, "..", ".."), stdio: "ignore" });
    }
    if (!existsSync(h)) { console.warn(`  ! ${id}: no regression-report.html under ${a.reports} — the sub-task comment goes without its dashboard`); continue; }
    const p = join(out, `${base}-${id}.png`);
    await png(null, h, p, { clipBefore: "Attachments", width: 1280 });
    runPngs.push(p); runHtml.push(h);
  }

  // 3. The two comment bodies (Jira wiki: an inline image forces the v2 API — tracker-ops.md §5c).
  const sub = L.rel.waves.find((x) => x.id === a.wave)?.subtask;
  const waveBugs = realBugs(w.rows);
  const prevBugs = new Set(realBugs(snap.run.filter((x) => L.rel.waves.findIndex((d) => d.id === x.def.id) < L.rel.waves.findIndex((d) => d.id === a.wave)).flatMap((x) => x.rows)).map((b) => b.id));
  const added = waveBugs.filter((b) => !prevBugs.has(b.id));
  const label = `${a.wave} ${w.def.title ?? ""}`.trim();
  const runs = w.st.runIds.join(", ");
  const notRun = (w.st.notRun ?? []).map((n) => `* ${n.cases} case(s) in ${n.suites.join(", ")}: ${wiki(n.reason)}`).join("\n");

  const releaseBody = [
    `h3. ${title(L.rel)} regression — ${wiki(label)} finished`,
    `!${base}-release.png|width=760!`,
    `*Release so far:* ${snap.run.length} of ${snap.waves.length} waves run · ${fmt(snap.executed)} cases executed · ${pct(snap.pass, snap.executed)}% PASS · ${snap.bugs.length} real bug(s), ${snap.bugs.filter((b) => b.isNew).length} new in this release · ${snap.decisions.length} pending decision(s)`,
    `h4. What ${a.wave} added`,
    `${wiki(label)}${sub ? ` (${sub})` : ""}: ${waveTotalsLine(w.t)}. Run ${runs}.`,
    added.length ? `New real bugs in this wave: ${added.map((b) => (b.filed ? b.id : `${b.id} (not filed yet)`)).join(", ")}.` : "No new real bug in this wave.",
    `h4. Real bugs — whole release`,
    bugTable(snap.bugs),
    snap.decisions.length ? `h4. Waiting for a decision\n${snap.decisions.map((d) => `* ${d.case_id} (${d.suite}): ${wiki(trim(d.summary, 160))} — ${wiki(d.decided_by ?? "")}`).join("\n")}` : "",
    `_Generated by release:report from regression/releases/${a.release}/ (state, ledger) — the latest comment of this kind is the current state._`,
  ].filter(Boolean).join("\n\n");

  const subtaskBody = [
    `h3. ${wiki(label)} — run results`,
    ...runPngs.map((p) => `!${p.split(/[\\/]/).pop()}|width=760!`),
    `||Executed||PASS||FAIL||BLOCKED||Skipped||Without a verdict||\n` +
    `|${fmt(w.t.executed)}${w.t.planned > w.t.executed ? ` of ${fmt(w.t.planned)}` : ""}|${fmt(w.t.pass)}|${fmt(w.t.fail)}|${fmt(w.t.blocked)}|${fmt(w.t.skipped)}|${w.st.untriaged ?? 0}|`,
    `*Run:* ${runs} · *owner:* ${wiki(w.st.owner ?? "—")} · *status:* ${w.st.status}`,
    `h4. Real bugs found in this wave`,
    bugTable(waveBugs),
    `h4. Triage`,
    `${w.rows.length} ledger row(s): ${verdictCounts(w.rows)}. Every row, including the findings that are not filed: regression/releases/${a.release}/waves/${a.wave}/ledger.csv.`,
    notRun ? `h4. Not run\n${notRun}` : "",
    runHtml.length ? `_The full interactive dashboard is attached (${runHtml.map((h) => `regression-report-${h.split(/[\\/]/).slice(-2, -1)[0]}.html`).join(", ")}); its screenshots stay in the run folder._` : "",
  ].filter(Boolean).join("\n\n");

  writeFileSync(join(out, `${base}-release.wiki`), releaseBody + "\n");
  writeFileSync(join(out, `${base}-subtask.wiki`), subtaskBody + "\n");
  // The attached HTML is named after its run, so two runs of one wave do not overwrite each other on the issue.
  const htmlCopies = runHtml.map((h) => { const id = h.split(/[\\/]/).slice(-2, -1)[0]; const c = join(out, `regression-report-${id}.html`); writeFileSync(c, readFileSync(h)); return c; });
  console.log(`release:report ${a.release} ${a.wave} (as of ${asOf}) → ${out}`);
  console.log(`  release ticket ${L.rel.ticket}: ${base}-release.png + ${base}-release.wiki`);
  console.log(`  wave sub-task ${sub ?? "(none yet — run --subtasks)"}: ${runPngs.length} dashboard(s) + ${base}-subtask.wiki`);
  return { L, out, base, relPng, runPngs, htmlCopies, sub, label };
}

/** `tracker:comment`, which owns the round guard, the uploads and the renderedBody check. Returns the comment id. */
function comment(ticket: string, body: string, images: string[], files: string[], artifact: string, amend?: string): string {
  const argv = [join(ROOT, "scripts", "tracker", "comment.mjs"), "--ticket", ticket, "--body-file", body, "--artifact", artifact,
    ...(amend ? ["--amend", amend] : []), ...images.flatMap((p) => ["--attach", p]), ...files.flatMap((p) => ["--attach-file", p])];
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf-8" });
  process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
  const id = (r.stdout ?? "").match(/✓ (?:posted|amended) comment (\d+)/)?.[1];
  if (r.status !== 0 || !id) { console.error(`release:report: the comment on ${ticket} did not go through`); process.exit(2); }
  return id;
}

async function post(a: ReturnType<typeof args>) {
  const r = await build(a);
  if (!r.sub) fail(`${a.wave} has no sub-task — run --subtasks --apply first`);
  const statePath = join(r.L.dir, "waves", a.wave, "state.json");
  const state = readJson<State>(statePath);
  const key = a.asOf || a.wave;
  const prev = state.reports?.[key] ?? {};
  const artifact = `${a.release} ${a.wave}`;
  const subId = comment(r.sub, join(r.out, `${r.base}-subtask.wiki`), r.runPngs, r.htmlCopies, artifact, prev.subtask);
  const relId = comment(r.L.rel.ticket, join(r.out, `${r.base}-release.wiki`), [r.relPng], [], artifact, prev.release);
  state.reports = { ...(state.reports ?? {}), [key]: { subtask: subId, release: relId } };
  writeFileSync(statePath, JSON.stringify(state, null, 1) + "\n");
  console.log(`  recorded in waves/${a.wave}/state.json reports.${key}: sub-task comment ${subId}, release comment ${relId}`);
}

async function jira(method: string, path: string, body?: unknown) {
  const base = (process.env.JIRA_BASE_URL ?? process.env.JIRA_BASE ?? "").replace(/\/+$/, "");
  const auth = "Basic " + Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  if (!base || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) fail("JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN are not set (.env.local)");
  const res = await fetch(`${base}${path}`, { method, headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) { console.error(`release:report: Jira ${method} ${path} → ${res.status} ${text.slice(0, 300)}`); process.exit(2); }
  return text ? JSON.parse(text) : null;
}

/** One `Subtask` per wave under the release ticket; the key goes into release.json (the planner's file). */
async function subtasks(a: ReturnType<typeof args>) {
  await import(pathToFileURL(join(ROOT, "config.js")).href);
  const L = load(a.release);
  const parent = await jira("GET", `/rest/api/3/issue/${L.rel.ticket}?fields=subtasks,project`);
  const existing = new Map<string, string>((parent.fields.subtasks ?? []).map((s: any) => [String(s.fields.summary), String(s.key)]));
  const types = await jira("GET", `/rest/api/3/issue/createmeta/${parent.fields.project.key}/issuetypes`);
  const type = (types.issueTypes ?? types.values ?? []).find((t: any) => t.subtask);
  if (!type) fail(`project ${parent.fields.project.key} has no sub-task issue type`);
  const me = await jira("GET", "/rest/api/3/myself");
  let changed = false;
  for (const w of L.rel.waves) {
    const summary = `${title(L.rel)} regression · ${w.id} ${w.title ?? ""}`.trim();
    const have = w.subtask ?? existing.get(summary);
    if (have) { if (!w.subtask) { w.subtask = have; changed = true; } console.log(`  ${w.id}: ${have} (exists)`); continue; }
    if (!a.apply) { console.log(`  ${w.id}: would create "${summary}"`); continue; }
    const st = L.states.get(w.id)!;
    const ownerIsMe = st.owner && me.displayName && st.owner.toLowerCase() === String(me.displayName).toLowerCase();
    const created = await jira("POST", "/rest/api/3/issue", { fields: {
      project: { key: parent.fields.project.key }, parent: { key: L.rel.ticket }, issuetype: { id: type.id }, summary,
      ...(ownerIsMe ? { assignee: { accountId: me.accountId } } : {}),
      description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text",
        text: `Wave ${w.id} of the ${title(L.rel)} regression: ${(w.suites ?? []).length} suite(s) (${(w.suites ?? []).join(", ")}). Claiming the wave = assigning this sub-task. Plan and state: regression/releases/${a.release}/.` }] }] },
    } });
    w.subtask = created.key; changed = true;
    console.log(`  ${w.id}: created ${created.key}${ownerIsMe ? ` (assigned to ${me.displayName})` : ""}`);
  }
  if (changed) { writeFileSync(join(L.dir, "release.json"), JSON.stringify(L.rel, null, 1) + "\n"); console.log(`  wrote the sub-task keys into release.json`); }
}

const a = args(process.argv.slice(2));
if (a.subtasks) await subtasks(a);
else if (a.post) { await import(pathToFileURL(join(ROOT, "config.js")).href); await post(a); }
else await build(a);
