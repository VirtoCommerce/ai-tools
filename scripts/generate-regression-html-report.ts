/**
 * Regression HTML Report Generator (all suites)
 *
 * Reads every suite-*-results.json under a regression run directory, normalizes
 * the three known shapes (browser / GraphQL / smoke), pairs each case with
 * matching screenshots in evidence/ and screenshots/, and renders a single
 * self-contained HTML file (inline CSS + JS, no external assets).
 *
 * Usage:
 *   npx tsx scripts/generate-regression-html-report.ts                    # latest run
 *   npx tsx scripts/generate-regression-html-report.ts --run-id REG-...
 *   npx tsx scripts/generate-regression-html-report.ts --run-id REG-... --open
 *   npx tsx scripts/generate-regression-html-report.ts --embed-images     # base64-inline screenshots (portable)
 *   npx tsx scripts/generate-regression-html-report.ts --watch --open     # live dashboard: auto-refresh until the run completes
 *
 * Live mode (--watch) reads the shared reports/regression/test-run-status.json to show
 * pending/running suites before they write results, injects a <meta refresh> while the run
 * is in progress, and exits with a final static render once the run is marked completed.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { spawn } from "node:child_process";

type Verdict = "PASS" | "FAIL" | "SKIPPED" | "BLOCKED" | "EMPTY" | "UNKNOWN";

interface NormCase {
  id: string;
  title: string;
  status: Verdict;
  evidenceText: string;
  evidenceFile: string | null;
  screenshots: string[];
  consoleErrors: string[];
}

interface NormSuite {
  suiteId: string;
  suiteName: string;
  category: "GraphQL" | "Frontend" | "Backend" | "Other";
  browser: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
  bugs: BugLike[];
  cases: NormCase[];
  liveStatus?: "pending" | "running" | "done";
  isPlaceholder?: boolean;
}

type LiveState = "pending" | "running" | "done";

interface RunStatusSuite {
  id: string;
  name?: string;
  status?: string; // pending | running | done | ...
  browser?: string;
  agent?: string;
  testCount?: number;
  pass?: number | null;
  fail?: number | null;
  blocked?: number | null;
  lane?: string;
}

interface RunStatus {
  runId?: string;
  selection?: string;
  startedAt?: string;
  windowStartUtc?: string;
  finishedAt?: string | null;
  env?: string;
  build?: Record<string, string>;
  status?: string; // in_progress | running | completed
  mode?: string;
  outputDir?: string;
  suites?: RunStatusSuite[];
}

interface BugLike {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  testCaseId: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
}

interface Args {
  runId?: string;
  out?: string;
  openInBrowser: boolean;
  reportsRoot: string;
  embedImages: boolean;
  watch: boolean;
  intervalSec: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    openInBrowser: false,
    reportsRoot: "reports/regression",
    embedImages: false,
    watch: false,
    intervalSec: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--reports-root") args.reportsRoot = argv[++i];
    else if (a === "--open") args.openInBrowser = true;
    else if (a === "--embed-images") args.embedImages = true;
    else if (a === "--watch") args.watch = true;
    else if (a === "--interval") args.intervalSec = Math.max(2, parseInt(argv[++i], 10) || 10);
    else if (a.startsWith("--interval=")) args.intervalSec = Math.max(2, parseInt(a.slice("--interval=".length), 10) || 10);
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage: npx tsx scripts/generate-regression-html-report.ts [options]",
          "  --run-id <ID>        Specific run (default: latest REG-*/SMOKE-* or the in-progress run)",
          "  --out <path>         Output file (default: <run>/regression-report.html)",
          "  --reports-root <p>   Reports root (default: reports/regression)",
          "  --embed-images       Inline screenshots as base64 (single-file portable)",
          "  --watch              Live mode: regenerate on an interval until the run completes",
          "  --interval <sec>     Watch refresh interval in seconds (default: 10)",
          "  --open               Open generated file in default browser",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  return args;
}

function findLatestRun(root: string): string {
  if (!existsSync(root)) throw new Error(`Reports root not found: ${root}`);
  const runs = readdirSync(root)
    .filter((d) => (d.startsWith("REG-") || d.startsWith("SMOKE-")) && statSync(join(root, d)).isDirectory())
    .map((d) => ({ name: d, mtime: statSync(join(root, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (runs.length === 0) throw new Error(`No REG-*/SMOKE-* runs found in ${root}`);
  return runs[0].name;
}

function loadRunStatus(root: string): RunStatus | null {
  const p = join(root, "test-run-status.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RunStatus;
  } catch {
    return null;
  }
}

/** A run is "live" (still executing) when the shared status says so. */
function statusIsInProgress(status: RunStatus | null): boolean {
  const s = (status?.status ?? "").toLowerCase();
  return s === "in_progress" || s === "running";
}

function normalizeLiveState(s: unknown): LiveState {
  const u = String(s ?? "").toLowerCase();
  if (u === "running") return "running";
  if (u === "done" || u === "completed" || u === "passed" || u === "failed") return "done";
  return "pending";
}

/**
 * Resolve which run to render.
 *  - explicit --run-id wins
 *  - else, if a run is in progress per test-run-status.json, use its runId
 *  - else, newest REG- or SMOKE- dir by mtime
 */
function resolveRunId(root: string, explicit: string | undefined, status: RunStatus | null): string {
  if (explicit) return explicit;
  if (statusIsInProgress(status) && status?.runId) return status.runId;
  return findLatestRun(root);
}

function normalizeStatus(s: unknown): Verdict {
  if (typeof s !== "string") return "UNKNOWN";
  const u = s.toUpperCase();
  if (u === "PASS" || u === "PASSED") return "PASS";
  if (u === "FAIL" || u === "FAILED") return "FAIL";
  if (u === "SKIP" || u === "SKIPPED") return "SKIPPED";
  if (u === "BLOCK" || u === "BLOCKED") return "BLOCKED";
  if (u === "EMPTY") return "EMPTY";
  return "UNKNOWN";
}

function categorize(suiteId: string): NormSuite["category"] {
  if (/^050/.test(suiteId)) return "GraphQL";
  const n = parseInt(suiteId, 10);
  if (Number.isFinite(n)) {
    // Frontend suite IDs: 001-016, 028-048, 070-080
    if ((n >= 1 && n <= 16) || (n >= 28 && n <= 48) || (n >= 70 && n <= 80)) return "Frontend";
    if ((n >= 17 && n <= 27) || (n >= 49 && n <= 67)) return "Backend";
  }
  return "Other";
}

function buildScreenshotIndex(runDir: string): Map<string, string[]> {
  // Returns: suiteId -> [relative paths] and case-id -> [relative paths]
  // Files like "039-PAY-CS-001-foo.png" → keyed under "039" and "PAY-CS-001"
  const idx = new Map<string, string[]>();
  const add = (k: string, v: string) => {
    const arr = idx.get(k) ?? [];
    arr.push(v);
    idx.set(k, arr);
  };
  for (const dir of ["evidence", "screenshots"]) {
    const dirPath = join(runDir, dir);
    if (!existsSync(dirPath)) continue;
    for (const f of readdirSync(dirPath)) {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(f)) continue;
      const rel = `${dir}/${f}`;
      const m = f.match(/^(\d+[a-z0-9]*)-(.+)\.(png|jpe?g|gif|webp)$/i);
      if (!m) {
        add("_orphan", rel);
        continue;
      }
      const suiteId = m[1];
      add(`suite:${suiteId}`, rel);
      // Extract a case-like ID anywhere in the remainder
      const caseMatch = m[2].match(/[A-Z][A-Z0-9]+-[A-Z0-9]+(?:-\d+)?/);
      if (caseMatch) add(`case:${caseMatch[0]}`, rel);
    }
  }
  return idx;
}

function normalizeSuite(raw: any, screenshotIdx: Map<string, string[]>): NormSuite {
  const suiteId = String(raw.suiteId ?? "??");
  const cases: NormCase[] = [];
  const suiteShots = screenshotIdx.get(`suite:${suiteId}`) ?? [];

  if (Array.isArray(raw.cases)) {
    // Smoke shape: cases[{id, title, verdict, notes}]
    for (const c of raw.cases) {
      cases.push({
        id: String(c.id ?? ""),
        title: String(c.title ?? ""),
        status: normalizeStatus(c.verdict),
        evidenceText: String(c.notes ?? ""),
        evidenceFile: null,
        screenshots: screenshotIdx.get(`case:${c.id}`) ?? [],
        consoleErrors: [],
      });
    }
  } else if (Array.isArray(raw.testCases)) {
    for (const c of raw.testCases) {
      const evidenceFieldIsFilename = typeof c.notes === "string" && /\.json$/i.test(c.notes);
      const evidenceFile = evidenceFieldIsFilename ? `graphql-evidence/${c.notes}` : null;
      const evidenceText = evidenceFieldIsFilename
        ? ""
        : String(c.evidence ?? c.notes ?? "");
      cases.push({
        id: String(c.id ?? ""),
        title: String(c.title ?? ""),
        status: normalizeStatus(c.status),
        evidenceText,
        evidenceFile,
        screenshots: screenshotIdx.get(`case:${c.id}`) ?? [],
        consoleErrors: Array.isArray(c.consoleErrors) ? c.consoleErrors : [],
      });
    }
  }

  const bugs: BugLike[] = Array.isArray(raw.bugs)
    ? raw.bugs.map((b: any) => ({
        id: String(b.id ?? ""),
        title: String(b.title ?? ""),
        severity: (b.severity ?? "Medium") as BugLike["severity"],
        testCaseId: String(b.testCaseId ?? ""),
        stepsToReproduce: String(b.stepsToReproduce ?? ""),
        expected: String(b.expected ?? ""),
        actual: String(b.actual ?? ""),
      }))
    : [];

  // Append suite-level screenshots that weren't matched to a specific case
  if (suiteShots.length > 0 && cases.length > 0) {
    const matchedSet = new Set(cases.flatMap((c) => c.screenshots));
    const unmatched = suiteShots.filter((s) => !matchedSet.has(s));
    if (unmatched.length > 0) {
      cases.push({
        id: "_suite",
        title: "Suite-level evidence",
        status: "UNKNOWN",
        evidenceText: "",
        evidenceFile: null,
        screenshots: unmatched,
        consoleErrors: [],
      });
    }
  }

  const totalCases = Number(raw.totalCases ?? cases.length);
  const passed = Number(raw.passed ?? 0);
  const failed = Number(raw.failed ?? 0);
  const blocked = Number(raw.blocked ?? 0);
  const skipped = Number(raw.skipped ?? 0);
  const passRate = totalCases > 0 ? (passed / totalCases) * 100 : 0;

  return {
    suiteId,
    suiteName: String(raw.suiteName ?? suiteId),
    category: categorize(suiteId),
    browser: String(raw.browser ?? ""),
    environment: String(raw.environment ?? ""),
    startedAt: String(raw.startedAt ?? raw.executedAt ?? ""),
    completedAt: String(raw.completedAt ?? ""),
    totalCases,
    passed,
    failed,
    blocked,
    skipped,
    passRate: typeof raw.passRate === "number" ? raw.passRate : parseFloat(String(raw.passRate ?? passRate.toFixed(1))),
    bugs,
    cases,
  };
}

function loadAllSuites(runDir: string): NormSuite[] {
  const shotIdx = buildScreenshotIndex(runDir);
  // Broadened to catch browser-suffixed files (suite-072b-…-results-chrome.json)
  // as well as the canonical suite-{ID}-results.json.
  const files = readdirSync(runDir).filter((f) => /^suite-.*results.*\.json$/.test(f));

  // Dedupe by suiteId: a run may hold both `…-results.json` and `…-results-chrome.json`.
  // Keep the record with the most test cases; tie-break on newest mtime.
  const bySuite = new Map<string, { suite: NormSuite; cases: number; mtime: number }>();
  for (const f of files) {
    const full = join(runDir, f);
    const suite = normalizeSuite(JSON.parse(readFileSync(full, "utf-8")), shotIdx);
    const cases = suite.cases.length;
    const mtime = statSync(full).mtimeMs;
    const prev = bySuite.get(suite.suiteId);
    if (!prev || cases > prev.cases || (cases === prev.cases && mtime > prev.mtime)) {
      bySuite.set(suite.suiteId, { suite, cases, mtime });
    }
  }
  return [...bySuite.values()]
    .map((v) => {
      v.suite.liveStatus = "done";
      return v.suite;
    })
    .sort((a, b) => a.suiteId.localeCompare(b.suiteId));
}

/**
 * Merge the shared run-status file into the loaded suites so a live/early run
 * shows pending/running suites that have not yet written a results JSON.
 * Real results always win — status only supplies placeholders for missing suites.
 */
function mergeStatus(suites: NormSuite[], status: RunStatus | null, runId: string): NormSuite[] {
  if (!status || status.runId !== runId || !Array.isArray(status.suites)) return suites;
  const have = new Set(suites.map((s) => s.suiteId));
  const placeholders: NormSuite[] = [];
  for (const st of status.suites) {
    const id = String(st.id ?? "");
    if (!id || have.has(id)) continue;
    const state = normalizeLiveState(st.status);
    placeholders.push({
      suiteId: id,
      suiteName: String(st.name ?? id),
      category: categorize(id),
      browser: String(st.browser ?? ""),
      environment: String(status.env ?? ""),
      startedAt: "",
      completedAt: "",
      totalCases: Number(st.testCount ?? 0),
      passed: Number(st.pass ?? 0),
      failed: Number(st.fail ?? 0),
      blocked: Number(st.blocked ?? 0),
      skipped: 0,
      passRate: 0,
      bugs: [],
      cases: [],
      liveStatus: state,
      isPlaceholder: true,
    });
  }
  return [...suites, ...placeholders].sort((a, b) => a.suiteId.localeCompare(b.suiteId));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDuration(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "n/a";
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  if (!Number.isFinite(ms) || ms === 0) return "n/a";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function imgSrc(rel: string, runDir: string, embed: boolean): string {
  if (!embed) return rel;
  const full = join(runDir, rel);
  if (!existsSync(full)) return rel;
  const ext = extname(rel).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" ? "jpeg" : ext;
  const b64 = readFileSync(full).toString("base64");
  return `data:image/${mime};base64,${b64}`;
}

function statusBadge(v: Verdict): string {
  return `<span class="badge b-${v.toLowerCase()}">${v}</span>`;
}

function liveBadge(state: LiveState): string {
  const label = state === "running" ? "● RUNNING" : state === "done" ? "DONE" : "PENDING";
  return `<span class="badge live-${state}">${label}</span>`;
}

function severityBadge(sev: BugLike["severity"]): string {
  return `<span class="badge sev-${sev.toLowerCase()}">${sev}</span>`;
}

function progressBar(p: number, f: number, s: number, b: number, total: number): string {
  if (total === 0) return `<div class="bar"><div class="bar-empty">no data</div></div>`;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return `<div class="bar" title="${p}P / ${f}F / ${s}S / ${b}B">
      ${p ? `<div class="bar-pass" style="width:${pct(p)}"></div>` : ""}
      ${f ? `<div class="bar-fail" style="width:${pct(f)}"></div>` : ""}
      ${b ? `<div class="bar-blocked" style="width:${pct(b)}"></div>` : ""}
      ${s ? `<div class="bar-skip" style="width:${pct(s)}"></div>` : ""}
    </div>`;
}

function renderDonut(p: number, f: number, s: number, b: number): string {
  const total = p + f + s + b;
  if (total === 0) return "";
  const r = 60;
  const c = 2 * Math.PI * r;
  const segs = [
    { val: p, color: "var(--pass)" },
    { val: f, color: "var(--fail)" },
    { val: s, color: "var(--skip)" },
    { val: b, color: "var(--blocked)" },
  ];
  let offset = 0;
  const circles = segs
    .filter((x) => x.val > 0)
    .map((x) => {
      const len = (x.val / total) * c;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${x.color}" stroke-width="18"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
      offset += len;
      return el;
    })
    .join("");
  const pct = ((p / total) * 100).toFixed(0);
  return `<svg class="donut" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="18"/>
    ${circles}
    <text x="70" y="68" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="700">${pct}%</text>
    <text x="70" y="86" text-anchor="middle" fill="var(--text-dim)" font-size="10">PASS RATE</text>
  </svg>`;
}

function renderCaseRow(c: NormCase, runDir: string, embed: boolean): string {
  const evidenceCell: string[] = [];
  if (c.evidenceText) evidenceCell.push(`<div class="ev-text">${escapeHtml(c.evidenceText)}</div>`);
  if (c.evidenceFile) {
    evidenceCell.push(
      `<div class="ev-link"><a href="${escapeHtml(c.evidenceFile)}" target="_blank">${escapeHtml(c.evidenceFile)}</a></div>`
    );
  }
  if (c.screenshots.length > 0) {
    evidenceCell.push(
      `<div class="ev-shots">${c.screenshots
        .map(
          (s) =>
            `<a href="${escapeHtml(s)}" target="_blank" class="shot"><img loading="lazy" src="${imgSrc(s, runDir, embed)}" alt="${escapeHtml(s)}"></a>`
        )
        .join("")}</div>`
    );
  }
  if (c.consoleErrors && c.consoleErrors.length > 0) {
    evidenceCell.push(
      `<details class="ce"><summary>${c.consoleErrors.length} console error(s)</summary><pre>${escapeHtml(c.consoleErrors.join("\n"))}</pre></details>`
    );
  }
  return `<tr class="tc-row" data-status="${c.status}">
    <td class="mono small">${escapeHtml(c.id)}</td>
    <td>${escapeHtml(c.title)}</td>
    <td>${statusBadge(c.status)}</td>
    <td class="ev">${evidenceCell.join("") || '<span class="muted">—</span>'}</td>
  </tr>`;
}

function suiteAttachmentCounts(s: NormSuite): { shots: number; ev: number } {
  let shots = 0;
  let ev = 0;
  for (const c of s.cases) {
    shots += c.screenshots.length;
    if (c.evidenceFile) ev += 1;
  }
  return { shots, ev };
}

function renderSuiteRow(s: NormSuite, runDir: string, embed: boolean, openByDefault: boolean): string {
  // Placeholder row for a suite that has not yet written results (pending/running).
  if (s.isPlaceholder) {
    const state = s.liveStatus ?? "pending";
    return `
    <tr class="suite-row placeholder" data-suite="${s.suiteId}" data-category="${s.category}" data-rate="-1">
      <td></td>
      <td class="mono">${s.suiteId}</td>
      <td><span class="cat-pill cat-${s.category.toLowerCase()}">${s.category}</span></td>
      <td>${escapeHtml(s.suiteName)}</td>
      <td class="mono small">${escapeHtml(s.browser)}</td>
      <td class="num">${s.totalCases || ""}</td>
      <td class="num" colspan="5">${liveBadge(state)}</td>
      <td class="num muted">—</td>
    </tr>`;
  }
  const rate = s.passRate;
  const rateClass = rate >= 90 ? "rate-good" : rate >= 70 ? "rate-warn" : "rate-bad";
  const att = suiteAttachmentCounts(s);
  const attBadge =
    att.shots + att.ev > 0
      ? `<span class="att-badge" title="${att.shots} screenshot(s), ${att.ev} evidence file(s)">📎 ${att.shots + att.ev}</span>`
      : "";
  const openCls = openByDefault ? " open" : "";
  const hiddenCls = openByDefault ? "" : " hidden";
  return `
    <tr class="suite-row" data-suite="${s.suiteId}" data-category="${s.category}" data-rate="${rate}">
      <td><button class="toggle${openCls}" aria-label="Expand">▶</button></td>
      <td class="mono">${s.suiteId}</td>
      <td><span class="cat-pill cat-${s.category.toLowerCase()}">${s.category}</span></td>
      <td>${escapeHtml(s.suiteName)} ${attBadge}</td>
      <td class="mono small">${escapeHtml(s.browser)}</td>
      <td class="num">${s.totalCases}</td>
      <td class="num pass">${s.passed}</td>
      <td class="num fail">${s.failed || ""}</td>
      <td class="num skip">${s.skipped || ""}</td>
      <td class="num blocked">${s.blocked || ""}</td>
      <td>${progressBar(s.passed, s.failed, s.skipped, s.blocked, s.totalCases)}</td>
      <td class="num ${rateClass}"><strong>${rate.toFixed(1)}%</strong></td>
    </tr>
    <tr class="suite-detail${hiddenCls}" data-detail-for="${s.suiteId}">
      <td colspan="12">
        <div class="detail-wrap">
          ${s.cases.length === 0 ? '<div class="muted">No case records.</div>' : `
          <table class="cases">
            <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>${s.cases.map((c) => renderCaseRow(c, runDir, embed)).join("")}</tbody>
          </table>`}
        </div>
      </td>
    </tr>`;
}

interface AttachmentItem {
  suiteId: string;
  suiteName: string;
  caseId: string;
  caseTitle: string;
  caseStatus: Verdict;
  path: string;
}

function collectAttachments(suites: NormSuite[]): AttachmentItem[] {
  const items: AttachmentItem[] = [];
  for (const s of suites) {
    for (const c of s.cases) {
      for (const p of c.screenshots) {
        items.push({
          suiteId: s.suiteId,
          suiteName: s.suiteName,
          caseId: c.id,
          caseTitle: c.title,
          caseStatus: c.status,
          path: p,
        });
      }
    }
  }
  return items;
}

function renderGallery(items: AttachmentItem[], runDir: string, embed: boolean): string {
  if (items.length === 0) {
    return `<div class="empty-gallery">No screenshot attachments captured for this run. GraphQL evidence (JSON payloads) is linked inside each suite's case rows below.</div>`;
  }
  return `<div class="gallery">${items
    .map(
      (it) => `<figure class="g-card" data-suite="${it.suiteId}" data-status="${it.caseStatus}">
        <a href="${escapeHtml(it.path)}" target="_blank" class="shot"><img loading="lazy" src="${imgSrc(it.path, runDir, embed)}" alt="${escapeHtml(it.path)}"></a>
        <figcaption>
          <div class="g-line1"><span class="mono">${escapeHtml(it.suiteId)}</span> · ${statusBadge(it.caseStatus)}</div>
          <div class="g-line2">${escapeHtml(it.caseId === "_suite" ? it.suiteName : it.caseTitle)}</div>
          <div class="g-line3 mono small">${escapeHtml(it.path)}</div>
        </figcaption>
      </figure>`
    )
    .join("")}</div>`;
}

interface RenderOpts {
  status: RunStatus | null;
  live: boolean;
  intervalSec: number;
}

function renderHtml(runId: string, allSuites: NormSuite[], runDir: string, embed: boolean, opts: RenderOpts): string {
  // Numeric aggregates come from suites that actually produced results;
  // placeholders (pending/running) only appear as live rows in the table.
  const suites = allSuites.filter((s) => !s.isPlaceholder);
  const inProgress = statusIsInProgress(opts.status) && opts.status?.runId === runId;
  const refreshMeta = opts.live && inProgress ? `\n<meta http-equiv="refresh" content="${opts.intervalSec}">` : "";
  const total = suites.reduce(
    (a, s) => ({
      cases: a.cases + s.totalCases,
      pass: a.pass + s.passed,
      fail: a.fail + s.failed,
      blocked: a.blocked + s.blocked,
      skip: a.skip + s.skipped,
      bugs: a.bugs + s.bugs.length,
    }),
    { cases: 0, pass: 0, fail: 0, blocked: 0, skip: 0, bugs: 0 }
  );
  const executed = total.cases - total.skip - total.blocked;
  const overallRate = executed > 0 ? (total.pass / executed) * 100 : 0;
  const inclusiveRate = total.cases > 0 ? (total.pass / total.cases) * 100 : 0;
  const cleanSuites = suites.filter((s) => s.failed === 0 && s.totalCases > 0).length;
  const failingSuites = suites.length - cleanSuites;
  const gateThreshold = 95;
  const gateVerdict = overallRate >= gateThreshold ? "PASSED" : "BLOCKED";
  const env = suites[0]?.environment ?? opts.status?.env ?? "unknown";
  const browsers = [...new Set(suites.map((s) => s.browser).filter(Boolean))].join(", ");

  // Live run header (shown whenever the shared status file describes THIS run).
  const statusMatches = opts.status?.runId === runId;
  const suitesTotal = allSuites.length;
  const suitesDone = suites.length; // non-placeholder = has results
  const runningCount = allSuites.filter((s) => s.isPlaceholder && s.liveStatus === "running").length;
  const pendingCount = allSuites.filter((s) => s.isPlaceholder && s.liveStatus === "pending").length;
  const elapsed = statusMatches
    ? formatDuration(opts.status?.startedAt ?? "", opts.status?.finishedAt || new Date().toISOString())
    : "";
  const donePct = suitesTotal > 0 ? ((suitesDone / suitesTotal) * 100).toFixed(0) : "0";
  const liveBanner = statusMatches
    ? `<div class="live-banner ${inProgress ? "running" : "done"}">
        <span class="live-state">${inProgress ? "● RUNNING" : "✓ COMPLETED"}</span>
        <span class="live-progress">${suitesDone}/${suitesTotal} suites
          ${runningCount ? `· ${runningCount} running` : ""}${pendingCount ? ` · ${pendingCount} pending` : ""}</span>
        <div class="bar live-bar" title="${suitesDone}/${suitesTotal} suites done">
          <div class="bar-pass" style="width:${donePct}%"></div>
        </div>
        <span class="live-elapsed">${elapsed}${inProgress ? ` · auto-refresh ${opts.intervalSec}s` : ""}</span>
      </div>`
    : "";
  const earliest = suites.reduce((m, s) => (s.startedAt && (!m || s.startedAt < m) ? s.startedAt : m), "");
  const latest = suites.reduce((m, s) => (s.completedAt && (!m || s.completedAt > m) ? s.completedAt : m), "");

  const byCategory: Record<string, NormSuite[]> = { Frontend: [], Backend: [], GraphQL: [], Other: [] };
  for (const s of suites) byCategory[s.category].push(s);
  const catCounts = Object.entries(byCategory).map(([k, v]) => ({
    name: k,
    count: v.length,
    cases: v.reduce((a, s) => a + s.totalCases, 0),
    pass: v.reduce((a, s) => a + s.passed, 0),
    fail: v.reduce((a, s) => a + s.failed, 0),
    skip: v.reduce((a, s) => a + s.skipped, 0),
  }));

  const allBugs = suites.flatMap((s) => s.bugs.map((b) => ({ ...b, suiteId: s.suiteId })));

  const attachments = collectAttachments(suites);
  const graphqlEvidenceCount = suites.reduce(
    (a, s) => a + s.cases.filter((c) => c.evidenceFile).length,
    0
  );
  const suiteRows = allSuites
    .map((s) => renderSuiteRow(s, runDir, embed, s.failed > 0))
    .join("\n");

  const bugRows = allBugs
    .map(
      (b) => `<tr>
        <td class="mono small">${escapeHtml(b.id)}</td>
        <td class="mono small">${escapeHtml(b.suiteId)}</td>
        <td>${severityBadge(b.severity)}</td>
        <td class="mono small">${escapeHtml(b.testCaseId)}</td>
        <td>${escapeHtml(b.title)}</td>
      </tr>`
    )
    .join("\n");

  const catBars = catCounts
    .filter((c) => c.count > 0)
    .map((c) => {
      const tot = c.pass + c.fail + c.skip;
      const rate = tot > 0 ? ((c.pass / tot) * 100).toFixed(1) : "0.0";
      return `<div class="cat-card">
        <div class="cat-head"><span class="cat-pill cat-${c.name.toLowerCase()}">${c.name}</span>
          <span class="cat-count">${c.count} suites · ${c.cases} cases</span></div>
        <div class="cat-rate">${rate}%</div>
        ${progressBar(c.pass, c.fail, c.skip, 0, tot)}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">${refreshMeta}
<title>Regression Report — ${escapeHtml(runId)}</title>
<style>
  :root {
    --bg: #f6f8fa;
    --surface: #ffffff;
    --surface-2: #eef1f5;
    --border: #d8dee6;
    --text: #1b2733;
    --text-dim: #5e6c7c;
    --muted: #94a3b8;
    --pass: #16a34a;
    --fail: #dc2626;
    --skip: #d97706;
    --blocked: #9333ea;
    --info: #2563eb;
    --accent: #0284c7;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px; line-height: 1.5; }
  .container { max-width: 1440px; margin: 0 auto; padding: 32px 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 32px 0 12px; font-weight: 600; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
  .gate { display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px;
    letter-spacing: 0.05em; text-transform: uppercase; }
  .gate.ok { background: rgba(22, 163, 74, 0.12); color: var(--pass); border: 1px solid rgba(22, 163, 74, 0.4); }
  .gate.bad { background: rgba(220, 38, 38, 0.10); color: var(--fail); border: 1px solid rgba(220, 38, 38, 0.4); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; box-shadow: var(--shadow); }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 6px; }
  .card-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .card-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
  .card.pass .card-value { color: var(--pass); }
  .card.fail .card-value { color: var(--fail); }
  .card.skip .card-value { color: var(--skip); }
  .card.info .card-value { color: var(--info); }
  .donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: var(--shadow); }
  .donut { width: 140px; height: 140px; flex-shrink: 0; }
  .legend { display: flex; gap: 16px; font-size: 12px; color: var(--text-dim); flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  .cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .cat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; box-shadow: var(--shadow); }
  .cat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .cat-count { color: var(--text-dim); font-size: 11px; }
  .cat-rate { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
  .cat-pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .cat-frontend { background: rgba(37, 99, 235, 0.12); color: var(--info); }
  .cat-backend { background: rgba(147, 51, 234, 0.12); color: var(--blocked); }
  .cat-graphql { background: rgba(2, 132, 199, 0.12); color: var(--accent); }
  .cat-other { background: var(--surface-2); color: var(--text-dim); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); box-shadow: var(--shadow); }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--surface-2); font-weight: 600; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-dim); }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.pass { color: var(--pass); }
  td.fail { color: var(--fail); font-weight: 600; }
  td.skip { color: var(--skip); }
  td.blocked { color: var(--blocked); }
  td.mono, .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; }
  .small { font-size: 12px; }
  .muted { color: var(--muted); font-style: italic; }
  .rate-good { color: var(--pass); }
  .rate-warn { color: var(--skip); }
  .rate-bad { color: var(--fail); }
  .bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-2); min-width: 120px; }
  .bar > div { height: 100%; }
  .bar-pass { background: var(--pass); }
  .bar-fail { background: var(--fail); }
  .bar-skip { background: var(--skip); }
  .bar-blocked { background: var(--blocked); }
  .bar-empty { color: var(--text-dim); font-size: 11px; padding: 0 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.03em; }
  .b-pass { background: rgba(22, 163, 74, 0.12); color: var(--pass); }
  .b-fail { background: rgba(220, 38, 38, 0.10); color: var(--fail); }
  .b-skipped { background: rgba(217, 119, 6, 0.12); color: var(--skip); }
  .b-blocked { background: rgba(147, 51, 234, 0.12); color: var(--blocked); }
  .b-empty, .b-unknown { background: var(--surface-2); color: var(--text-dim); }
  .live-pending { background: var(--surface-2); color: var(--text-dim); }
  .live-running { background: rgba(2, 132, 199, 0.12); color: var(--accent); }
  .live-done { background: rgba(22, 163, 74, 0.12); color: var(--pass); }
  tr.placeholder td { color: var(--text-dim); }
  .live-banner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 16px; margin-bottom: 24px; box-shadow: var(--shadow); }
  .live-banner.running { border-color: rgba(2, 132, 199, 0.45); }
  .live-banner.done { border-color: rgba(22, 163, 74, 0.4); }
  .live-state { font-weight: 700; font-size: 13px; letter-spacing: 0.04em; }
  .live-banner.running .live-state { color: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  .live-banner.done .live-state { color: var(--pass); }
  .live-progress { font-size: 13px; color: var(--text-dim); }
  .live-bar { flex: 1; min-width: 160px; height: 10px; }
  .live-elapsed { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
  .sev-critical { background: rgba(185, 28, 28, 0.14); color: #b91c1c; }
  .sev-high { background: rgba(220, 38, 38, 0.10); color: var(--fail); }
  .sev-medium { background: rgba(217, 119, 6, 0.12); color: var(--skip); }
  .sev-low { background: rgba(37, 99, 235, 0.10); color: var(--info); }
  .toggle { background: transparent; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 10px; padding: 0; width: 18px; transition: transform 0.15s; }
  .toggle.open { transform: rotate(90deg); color: var(--accent); }
  .suite-detail.hidden { display: none; }
  .detail-wrap { padding: 8px 24px 20px; background: var(--bg); }
  .cases { background: transparent; }
  .cases th { background: transparent; border-bottom: 1px solid var(--border); }
  .ev { max-width: 600px; }
  .ev-text { color: var(--text-dim); font-size: 12px; margin-bottom: 6px; line-height: 1.45; }
  .ev-link { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; margin-bottom: 6px; }
  .ev-shots { display: flex; flex-wrap: wrap; gap: 6px; }
  .shot { display: block; }
  .shot img { width: 120px; height: 80px; object-fit: cover; border-radius: 4px;
    border: 1px solid var(--border); cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
  .shot:hover img { border-color: var(--accent); transform: scale(1.02); }
  .ce { margin-top: 6px; font-size: 12px; }
  .ce pre { background: var(--bg); padding: 8px; border-radius: 4px; overflow-x: auto; color: var(--fail); }
  .controls { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
  .controls input, .controls select { background: var(--surface); border: 1px solid var(--border);
    color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; font-family: inherit; }
  .controls input { min-width: 240px; }
  .controls label { font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
  .controls button { background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .controls button:hover { background: var(--surface-2); }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
    color: var(--text-dim); font-size: 12px; text-align: center; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: none;
    align-items: center; justify-content: center; z-index: 1000; cursor: zoom-out; padding: 24px; }
  .lightbox.on { display: flex; }
  .lightbox img { max-width: 95%; max-height: 95%; border-radius: 4px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .h2-sub { font-size: 12px; font-weight: 400; color: var(--text-dim); margin-left: 12px; letter-spacing: 0; text-transform: none; }
  .att-badge { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 10px;
    background: rgba(2, 132, 199, 0.12); color: var(--accent); font-size: 11px; font-weight: 600; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .g-card { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden; display: flex; flex-direction: column; }
  .g-card .shot img { width: 100%; height: 140px; object-fit: cover; border: none; border-radius: 0;
    border-bottom: 1px solid var(--border); display: block; }
  .g-card figcaption { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .g-line1 { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
  .g-line2 { font-size: 13px; color: var(--text); line-height: 1.35; }
  .g-line3 { color: var(--muted); word-break: break-all; }
  .empty-gallery { background: var(--surface); border: 1px dashed var(--border); border-radius: 8px;
    padding: 24px; text-align: center; color: var(--text-dim); margin-bottom: 24px; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>Regression Test Report</h1>
      <div class="subtitle">Run <span class="mono">${escapeHtml(runId)}</span> &middot; ${escapeHtml(env)} &middot; ${escapeHtml(browsers || "n/a")}
        &middot; Duration: ${formatDuration(earliest, latest)}</div>
    </div>
    <div class="gate ${gateVerdict === "PASSED" ? "ok" : "bad"}">Gate: ${gateVerdict}</div>
  </header>

  ${liveBanner}

  <div class="cards">
    <div class="card">
      <div class="card-label">Suites</div>
      <div class="card-value">${suites.length}</div>
      <div class="card-sub">${cleanSuites} clean &middot; ${failingSuites} with failures</div>
    </div>
    <div class="card info">
      <div class="card-label">Test Cases</div>
      <div class="card-value">${total.cases}</div>
      <div class="card-sub">${executed} executed &middot; ${total.skip} skipped</div>
    </div>
    <div class="card pass">
      <div class="card-label">Passed</div>
      <div class="card-value">${total.pass}</div>
      <div class="card-sub">${overallRate.toFixed(1)}% of executed</div>
    </div>
    <div class="card fail">
      <div class="card-label">Failed</div>
      <div class="card-value">${total.fail}</div>
      <div class="card-sub">${total.bugs} bugs filed</div>
    </div>
    <div class="card skip">
      <div class="card-label">Skipped</div>
      <div class="card-value">${total.skip}</div>
      <div class="card-sub">Blocked: ${total.blocked}</div>
    </div>
    <div class="card">
      <div class="card-label">Inclusive Rate</div>
      <div class="card-value">${inclusiveRate.toFixed(1)}%</div>
      <div class="card-sub">Gate threshold: ${gateThreshold}%</div>
    </div>
  </div>

  <div class="donut-wrap">
    ${renderDonut(total.pass, total.fail, total.skip, total.blocked)}
    <div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background: var(--pass)"></span>Pass (${total.pass})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--fail)"></span>Fail (${total.fail})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--skip)"></span>Skip (${total.skip})</div>
        ${total.blocked ? `<div class="legend-item"><span class="legend-dot" style="background: var(--blocked)"></span>Blocked (${total.blocked})</div>` : ""}
      </div>
      <div class="subtitle" style="margin-top: 8px;">Pass rate excludes skipped &amp; blocked cases.</div>
    </div>
  </div>

  <h2>By Category</h2>
  <div class="cat-grid">${catBars}</div>

  <h2>Attachments &amp; Evidence
    <span class="h2-sub">${attachments.length} screenshot(s) · ${graphqlEvidenceCount} GraphQL evidence JSON file(s)</span>
  </h2>
  ${renderGallery(attachments, runDir, embed)}

  <h2>Suite Results
    <span class="h2-sub">Suites with failures are pre-expanded</span>
  </h2>
  <div class="controls">
    <input type="text" id="filter" placeholder="Filter by suite name or ID..."/>
    <select id="cat-filter">
      <option value="">All categories</option>
      <option value="Frontend">Frontend</option>
      <option value="Backend">Backend</option>
      <option value="GraphQL">GraphQL</option>
      <option value="Other">Other</option>
    </select>
    <label><input type="checkbox" id="failed-only"/> Failed only</label>
    <button id="expand-all">Expand all</button>
    <button id="collapse-all">Collapse all</button>
  </div>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Suite</th>
        <th>Category</th>
        <th>Name</th>
        <th>Browser</th>
        <th class="num">Total</th>
        <th class="num">Pass</th>
        <th class="num">Fail</th>
        <th class="num">Skip</th>
        <th class="num">Blocked</th>
        <th>Distribution</th>
        <th class="num">Rate</th>
      </tr>
    </thead>
    <tbody>${suiteRows}</tbody>
  </table>

  ${
    allBugs.length > 0
      ? `<h2>Bugs (${allBugs.length})</h2>
  <table>
    <thead><tr><th>Bug ID</th><th>Suite</th><th>Severity</th><th>Test Case</th><th>Title</th></tr></thead>
    <tbody>${bugRows}</tbody>
  </table>`
      : ""
  }

  <footer>
    Generated ${new Date().toISOString()} &middot;
    Source: <span class="mono">reports/regression/${escapeHtml(runId)}/</span> &middot;
    ${embed ? "Images embedded (portable)" : "Images linked (relative paths)"}
  </footer>
</div>

<div class="lightbox" id="lightbox"><img alt=""/></div>

<script>
  document.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      const row = e.target.closest('tr');
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + row.dataset.suite + '"]');
      detail.classList.toggle('hidden');
      btn.classList.toggle('open');
    });
  });

  document.getElementById('expand-all').addEventListener('click', () => {
    document.querySelectorAll('.suite-detail').forEach(d => d.classList.remove('hidden'));
    document.querySelectorAll('.toggle').forEach(b => b.classList.add('open'));
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    document.querySelectorAll('.suite-detail').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.toggle').forEach(b => b.classList.remove('open'));
  });

  const filterInput = document.getElementById('filter');
  const catFilter = document.getElementById('cat-filter');
  const failedOnly = document.getElementById('failed-only');
  function applyFilters() {
    const q = filterInput.value.toLowerCase();
    const cat = catFilter.value;
    const onlyFailed = failedOnly.checked;
    document.querySelectorAll('tr.suite-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      const rate = parseFloat(row.dataset.rate);
      const matchQ = !q || text.includes(q);
      const matchCat = !cat || row.dataset.category === cat;
      const matchFail = !onlyFailed || rate < 100;
      const show = matchQ && matchCat && matchFail;
      row.style.display = show ? '' : 'none';
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + row.dataset.suite + '"]');
      if (detail) detail.style.display = show && !detail.classList.contains('hidden') ? '' : 'none';
    });
  }
  filterInput.addEventListener('input', applyFilters);
  catFilter.addEventListener('change', applyFilters);
  failedOnly.addEventListener('change', applyFilters);

  // Lightbox for screenshots
  const lb = document.getElementById('lightbox');
  const lbImg = lb.querySelector('img');
  document.querySelectorAll('.shot').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      lbImg.src = a.querySelector('img').src;
      lb.classList.add('on');
    });
  });
  lb.addEventListener('click', () => lb.classList.remove('on'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('on'); });
</script>
</body>
</html>`;
}

function openInBrowser(path: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", path] : [path];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Render one snapshot. Returns the run-level status ("in_progress"/"completed"/absent)
 * so the watch loop knows when to stop. Never exits the process itself.
 */
function renderOnce(args: Args, reportsRoot: string): { status: RunStatus | null; runId: string; outPath: string; suitesWithResults: number } {
  const status = loadRunStatus(reportsRoot);
  const runId = resolveRunId(reportsRoot, args.runId, status);
  const runDir = join(reportsRoot, runId);
  const dirExists = existsSync(runDir);

  const resultSuites = dirExists ? loadAllSuites(runDir) : [];
  const suites = mergeStatus(resultSuites, status, runId);

  // In one-shot mode with nothing to show, fail loudly (unchanged behavior).
  // In watch mode, an empty/early run is fine — the status placeholders carry the view.
  if (suites.length === 0) {
    if (args.watch) {
      console.log(`[watch] ${runId}: no suite results yet — waiting…`);
      return { status, runId, outPath: "", suitesWithResults: 0 };
    }
    if (!dirExists) throw new Error(`Run directory not found: ${runDir}`);
    console.error(`No suite results (suite-*-results.json) found in ${runDir}`);
    process.exit(1);
  }

  const outPath = args.out ? resolve(args.out) : join(runDir, "regression-report.html");
  const live = args.watch && statusIsInProgress(status) && status?.runId === runId;
  const html = renderHtml(runId, suites, runDir, args.embedImages, {
    status,
    live,
    intervalSec: args.intervalSec,
  });
  writeFileSync(outPath, html, "utf-8");

  return { status, runId, outPath, suitesWithResults: resultSuites.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportsRoot = resolve(args.reportsRoot);

  if (!args.watch) {
    const { runId, outPath } = renderOnce(args, reportsRoot);
    const runDir = join(reportsRoot, runId);
    const suites = loadAllSuites(runDir);
    const totals = suites.reduce(
      (a, s) => ({ c: a.c + s.totalCases, p: a.p + s.passed, f: a.f + s.failed, s: a.s + s.skipped }),
      { c: 0, p: 0, f: 0, s: 0 }
    );
    const shotCount = suites.reduce((a, s) => a + s.cases.reduce((b, c) => b + c.screenshots.length, 0), 0);
    console.log(`Regression HTML report written: ${outPath}`);
    console.log(`  Suites: ${suites.length}  Cases: ${totals.c}  Pass: ${totals.p}  Fail: ${totals.f}  Skip: ${totals.s}  Screenshots: ${shotCount}`);
    if (args.openInBrowser) openInBrowser(outPath);
    return;
  }

  // Watch mode: regenerate on an interval until the run completes.
  // Safety valve: stop after a long idle with no status/results so a stray watcher can't run forever.
  const idleLimitMs = 45 * 60 * 1000;
  let opened = false;
  let lastProgressAt = Date.now();
  let lastSignature = "";
  console.log(`[watch] live dashboard, refresh ${args.intervalSec}s — Ctrl+C to stop`);

  for (;;) {
    let result: ReturnType<typeof renderOnce>;
    try {
      result = renderOnce(args, reportsRoot);
    } catch (e) {
      console.error(`[watch] ${(e as Error).message}`);
      await sleep(args.intervalSec * 1000);
      continue;
    }

    if (result.outPath && args.openInBrowser && !opened) {
      openInBrowser(result.outPath);
      opened = true;
    }

    const inProgress = statusIsInProgress(result.status) && result.status?.runId === result.runId;
    const signature = `${result.runId}:${result.status?.status ?? "?"}:${result.suitesWithResults}`;
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = Date.now();
    }

    if (result.suitesWithResults > 0 && !inProgress) {
      // Not in progress + results present → nothing left to watch. renderOnce already
      // emitted the final static render (live=false → no refresh meta).
      console.log(`[watch] ${result.runId} settled — final report: ${result.outPath}`);
      return;
    }

    if (Date.now() - lastProgressAt > idleLimitMs) {
      console.log(`[watch] no progress for ${idleLimitMs / 60000} min — stopping.`);
      return;
    }

    await sleep(args.intervalSec * 1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
