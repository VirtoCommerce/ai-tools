// One adapter per pipeline's MACHINE record → one ReportModel, so a template never reads a
// pipeline's own file shape and a comment is derived, never re-typed. Case `notes` are dropped
// here on purpose: they carry account emails and fixture detail (reference.md §Sources).
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";

export class SourceError extends Error {}

export const VERDICTS = {
  test: ["PASS", "PASS_WITH_NOTES", "FAIL", "BLOCKED"],
  fix: ["VERIFIED", "VERIFIED_WITH_NOTES", "FIX_INCOMPLETE", "NEW_REGRESSION", "INTERMITTENT", "BLOCKED"],
  regression: ["GO", "CONDITIONAL_GO", "NO_GO"],
  smoke: ["GO", "CONDITIONAL_GO", "NO_GO"],
};
const TONE = {
  PASS: "pass", VERIFIED: "pass", GO: "pass",
  PASS_WITH_NOTES: "notes", VERIFIED_WITH_NOTES: "notes", CONDITIONAL_GO: "notes", NEW_REGRESSION: "notes",
  FAIL: "fail", FIX_INCOMPLETE: "fail", INTERMITTENT: "fail", NO_GO: "fail",
  BLOCKED: "blocked",
};
const ICON = { pass: "✅", notes: "⚠️", fail: "❌", blocked: "⛔" };
const EXTRA_KEYS = ["title", "lede", "rows", "areas", "questions", "notTested", "context", "shots"];

export function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, "")); }
  catch (e) { throw new SourceError(`cannot read ${p}: ${e.message}`); }
}

function verdictOf(kind, raw) {
  const v = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!VERDICTS[kind].includes(v)) {
    throw new SourceError(`${kind}: verdict "${raw ?? ""}" is not one of ${VERDICTS[kind].join(" | ")}`);
  }
  const tone = TONE[v];
  return { kind, verdict: v, verdictLabel: v.replace(/_/g, " "), tone, icon: ICON[tone] };
}

/** Deployed facts win over declared ones — the build a reader cares about is the one that ran. */
export function buildLine(build) {
  if (!build) return "unknown";
  if (typeof build === "string") return build;
  const parts = [];
  const live = build.deployed?.platform && build.deployed.platform !== "UNKNOWN" ? build.deployed.platform : null;
  const platform = live ?? build.platform;
  if (platform) parts.push(`platform ${platform}`);
  if (build.theme) parts.push(`theme ${build.theme}`);
  const mods = { ...(build.relevant_modules ?? {}), ...(build.deployed?.relevant_modules ?? {}) };
  for (const [name, v] of Object.entries(mods)) parts.push(`${name} ${v}`);
  if (build.pr_build) parts.push(`PR build ${build.pr_build}`);
  return parts.join(" · ") || "unknown";
}

const empty = () => ({ rows: [], areas: [], questions: [], notTested: [], context: [], shots: [], lede: "", issues: [], failures: null, beforeAfter: [], notFiled: [] });

export function fromQaTest(path) {
  const s = readJson(path);
  const est = s.ac_analysis?.ac_dod_estimate ?? {};
  const c1 = s.regression?.c1;
  return {
    ...empty(), ...verdictOf("test", s.verdict),
    ticket: s.ticket ?? null, title: s.ticket ?? "", runLabel: s.path ? `path ${s.path}` : "",
    env: s.environment ?? "", build: buildLine(s.build), date: s.date ?? "",
    counts: { total: s.total_cases ?? 0, passed: s.passed ?? 0, failed: s.failed ?? 0, blocked: s.blocked ?? 0, notRun: 0 },
    lines: {
      // ONE line, and EMPTY when neither half has a number. "n/a - none stated" is two
      // non-answers occupying a line a reader has to read before learning nothing.
      AC_DOD: [
        est.ac_coverage_pct == null ? null : `${est.ac_coverage_pct}% of acceptance conditions carry evidence`,
        est.dod_total ? `DoD ${est.dod_met ?? 0}/${est.dod_total}` : null,
      ].filter(Boolean).join(" · "),
      // The reader's question is "did anything else break", so lead with a percentage.
      // Suite ids are internal routing and belong on the page, not in a tracker comment.
      REGRESSION: c1?.run_id
        ? `${c1.pass_rate == null ? "?" : `${Math.round(c1.pass_rate * 100)}%`}`
          + `${c1.passed != null && c1.ids != null ? ` (${c1.passed} of ${c1.ids} cases)` : ""}`
          + ` — ${c1.run_id}`
        : `not run${c1?.skipped_reason ? ` — ${c1.skipped_reason}` : ""}`,
      BL: (s.business_rules_verified ?? []).join(", ") || "none",
      // No machine record carries the account a run signed in as, so this is the caller's to --set.
      AS_USER: "not recorded",
      NEW_CASES: s.new_cases_authored
        ? `${s.new_cases_authored} authored — PR not linked`
        : "none — the existing suites already cover this",
      RELEASE_GATE: "not assessed",
      RELEASE_NOTE: s.release?.fragment ? `${(s.release.layers ?? []).join("/")} — ${s.release.fragment}`
        : `none — ${s.release?.refusal ?? "not resolved"}`,
    },
    // `title` is what the row is ABOUT; a key alone makes the reader open the ticket to find out.
    bugs: (s.bugs_filed ?? []).map(b => bugEntry(
      b.key, b.title ?? "", b.severity ?? "", (b.relationship ?? "").replace(/\s+(?:of\s+)?[A-Z]+-\d+$/, ""))),
    // The schema says `summary`/`report`; live artifacts write `draft` and often no summary at all.
    // Read both and fall back to the file name, because a blank row is worse than a terse one.
    // One identifier per row, never two: with no `summary` the title WAS the file name, so printing
    // the path beside it duplicated ~70 chars. The draft is recoverable from the severity folder
    // plus the name, and the page carries the full path.
    notFiled: (s.bugs_not_filed ?? []).map(b => {
      const path = b.report ?? b.draft ?? "";
      return b.summary
        ? { severity: b.severity ?? "Low", title: b.summary, path }
        : { severity: b.severity ?? "Low", title: path ? basename(path, ".md") : "(untitled)", path: "" };
    }),
    evidence: s.screenshots ?? "", imageRoot: dirname(path), pageUrl: s.report?.page_url ?? null,
  };
}

const NEEDS_PAIR = ["VERIFIED", "VERIFIED_WITH_NOTES", "NEW_REGRESSION"];

export function fromVerifyFix(path) {
  const s = readJson(path);
  const v = verdictOf("fix", s.verdict);
  const pairs = (s.before_after ?? []).map(p => ({ check: p.check ?? "", before: p.before ?? "", after: p.after ?? "" }));
  if (!pairs.length && NEEDS_PAIR.includes(v.verdict)) {
    throw new SourceError(`fix: ${v.verdict} needs before_after[] — a fix is proven by a RED→GREEN pair (qa-verify-fix Step 2A)`);
  }
  const shots = (s.before_after ?? []).flatMap(p => [p.before_shot, p.after_shot]).filter(Boolean);
  return {
    ...empty(), ...v,
    ticket: s.ticket ?? null, title: s.ticket ?? "", runLabel: "",
    env: s.environment ?? "", build: buildLine(s.build), date: s.date ?? "",
    counts: { total: s.checklist_total ?? 0, passed: s.checklist_passed ?? 0, failed: s.checklist_failed ?? 0, blocked: 0, notRun: 0 },
    lines: {
      STR: s.str_result ?? "n/a",
      BASELINE: s.baseline_reproduction ?? "n/a",
      BL: (s.business_rules_verified ?? []).join(", ") || "none",
    },
    beforeAfter: pairs, shots,
    // Each side effect carries its DISPOSITION, like /qa-test's findings do. A bare string is the
    // legacy shape and has none, so the cell says `not recorded` rather than reading as "not filed":
    // a finding nobody triaged must not be indistinguishable from one deliberately left alone.
    issues: [...(s.regression_issues ?? []), ...(s.side_effects ?? [])].map(x => {
      if (typeof x === "string") return { what: compact(x), severity: "", ticket: "not recorded" };
      const what = compact(x?.summary ?? x?.title ?? x?.check ?? "(unspecified)");
      return { what, severity: x?.severity ?? "", ticket: x?.ticket || x?.why || "not recorded" };
    }),
    bugs: (s.bugs_filed ?? []).map(b => typeof b === "string" ? bugEntry(b, "") 
      : bugEntry(b.key ?? "", b.title ?? "", b.severity ?? "")),
    evidence: s.artifacts ?? "", imageRoot: dirname(path), pageUrl: s.evidence_artifact ?? null,
  };
}

export function readRunSuites(runDir) {
  if (!existsSync(runDir)) throw new SourceError(`run folder not found: ${runDir}`);
  const files = readdirSync(runDir).filter(f => /^suite-.*results.*\.json$/.test(f));
  if (!files.length) throw new SourceError(`no suite-*-results.json in ${runDir}`);
  const bySuite = new Map();
  for (const f of files) {
    const full = join(runDir, f);
    const raw = readJson(full);
    const id = String(raw.suiteId ?? f.replace(/^suite-|-results.*$/g, ""));
    const cases = Array.isArray(raw.testCases) ? raw.testCases : [];
    const mtime = statSync(full).mtimeMs;
    const prev = bySuite.get(id);
    if (!prev || cases.length > prev.cases.length || (cases.length === prev.cases.length && mtime > prev.mtime)) {
      bySuite.set(id, { id, name: raw.suiteName ?? id, env: raw.environment ?? "", startedAt: raw.startedAt ?? "",
        completedAt: String(raw.completedAt ?? "").trim(), cases, mtime });
    }
  }
  const suites = [...bySuite.values()].sort((a, b) => a.id.localeCompare(b.id));
  const open = suites.filter(s => !s.completedAt).map(s => s.id);
  if (open.length) {
    throw new SourceError(`suite ${open.join(", ")} has no completedAt — the run is not consolidated; finish it (qa-regression Step 6) before reporting`);
  }
  return suites;
}

const statusOf = s => {
  const v = String(s ?? "").toUpperCase();
  if (v.startsWith("PASS")) return "passed";
  if (v.startsWith("FAIL")) return "failed";
  if (v.startsWith("BLOCK")) return "blocked";
  return "notRun";
};

export function fromRun(runDir, kind, verdict, ticket = null) {
  const v = verdictOf(kind, verdict);
  const suites = readRunSuites(runDir);
  const counts = { total: 0, passed: 0, failed: 0, blocked: 0, notRun: 0 };
  const failures = [];
  const rows = suites.map(s => {
    const c = { passed: 0, failed: 0, blocked: 0, notRun: 0 };
    for (const tc of s.cases) {
      const st = statusOf(tc.status);
      c[st]++;
      if (st === "failed" || st === "blocked") {
        failures.push({ id: String(tc.id ?? ""), title: String(tc.title ?? ""), result: st === "failed" ? "FAIL" : "BLOCKED", suite: s.id });
      }
    }
    for (const k of Object.keys(c)) counts[k] += c[k];
    counts.total += s.cases.length;
    return { id: s.id, text: s.name, result: c.failed ? "FAIL" : c.blocked ? "BLOCKED" : c.passed > 0 ? "PASS" : "NOT_RUN", evidence: `${c.passed}/${s.cases.length}` };
  });
  const evaluated = counts.total - counts.notRun;
  const runLabel = basename(runDir.replace(/[\\/]+$/, ""));
  return {
    ...empty(), ...v,
    ticket, title: runLabel, runLabel,
    env: suites[0]?.env ?? "", build: "", date: (suites[0]?.startedAt ?? "").slice(0, 10),
    counts,
    lines: {
      SUITES: suites.map(s => s.id).join(", "),
      PASS_RATE: evaluated ? `${Math.round((counts.passed / evaluated) * 100)}%` : "n/a",
      GATES: "see the report page",
    },
    rows, failures, bugs: [],
    evidence: runDir, imageRoot: runDir, pageUrl: null,
  };
}

// The COMMENT's header answers "where, on what, as whom". A machine-written env/build string
// carries its explanation in parentheses, which is page material: strip the asides and collapse
// the whitespace. This is a structural removal, never a mid-line cut — the renderer's whole
// doctrine is that it fails loudly rather than truncating. Applied in templateData only, so the
// HTML page (renderPage reads m.env / m.build) still shows every string in full.
export const compact = (v) => String(v ?? "").replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim();

// A bug key alone makes the reader open the ticket to find out whether it matters. Every kind
// that lists filed bugs shows what each one is ABOUT; `label` is that rendering, built here so
// the inline templates need no conditional (the engine has no nested sections).
export function bugEntry(key, what = "", severity = "", relation = "") {
  const w = compact(what);
  return { key, what: w, severity, relation, label: w ? `${key} — ${w}` : key };
}

const SHAPES = { rows: "{ id, text, result, evidence }", areas: "{ area, cases, result }", notTested: "{ item, reason }", context: "{ label, value }" };

export function applyExtras(m, extra = {}, sets = {}) {
  const unknown = Object.keys(extra).filter(k => !EXTRA_KEYS.includes(k));
  if (unknown.length) throw new SourceError(`--extra: unknown key(s) ${unknown.join(", ")} — allowed: ${EXTRA_KEYS.join(", ")}`);
  const list = k => {
    if (extra[k] == null) return m[k];
    if (!Array.isArray(extra[k])) throw new SourceError(`--extra: "${k}" must be an array`);
    const shape = SHAPES[k];
    if (shape) extra[k].forEach((e, i) => {
      if (e === null || typeof e !== "object" || Array.isArray(e)) {
        throw new SourceError(`--extra: "${k}"[${i}] must be an object ${shape}, got ${Array.isArray(e) ? "an array" : e === null ? "null" : typeof e}`);
      }
    });
    return extra[k];
  };
  const out = { ...m, rows: list("rows"), areas: list("areas"), questions: list("questions"), notTested: list("notTested"), context: list("context"),
    shots: [...m.shots, ...(extra.shots ?? [])], lines: { ...m.lines } };
  if (extra.title) out.title = String(extra.title);
  if (extra.lede) out.lede = String(extra.lede);
  for (const [k, v] of Object.entries(sets)) {
    if (!(k in m.lines)) throw new SourceError(`--set ${k}: not a line of a ${m.kind} report (${Object.keys(m.lines).join(", ")})`);
    out.lines[k] = v;
  }
  return out;
}

// D7. The lede is the only slot no machine record can supply, so it is the only one validated here
// rather than defaulted. Called after applyExtras, because --lede and --extra.lede are both legal doors.
export function requireLede(m, ledeMax) {
  const s = String(m.lede ?? "").trim().replace(/\s+/g, " ");
  if (!s) {
    throw new SourceError(
      `a ${m.kind} comment needs a lede: one to three sentences saying what happened, not the counts in words. ` +
      `Pass --lede "<text>" or set "lede" in --extra.`);
  }
  if (s.length > ledeMax) {
    throw new SourceError(`--lede is ${s.length} chars, over this template's lede_max of ${ledeMax}. Shorten the sentences; the renderer will not cut them.`);
  }
  return { ...m, lede: s };
}

export function templateData(m, dialect = "markdown") {
  return {
    ICON: m.icon, VERDICT_LABEL: m.verdictLabel, LEDE: m.lede, TICKET: m.ticket ?? "", RUN_ID: m.runLabel ?? "",
    ENV: compact(m.env), BUILD: compact(m.build), DATE: m.date ?? "",
    TOTAL: m.counts.total, PASSED: m.counts.passed, FAILED: m.counts.failed, BLOCKED: m.counts.blocked, NOT_RUN: m.counts.notRun,
    ...m.lines,
    AREAS: m.areas ?? [], QUESTIONS: m.questions ?? [], BUGS: m.bugs, NOT_FILED: m.notFiled, BEFORE_AFTER: m.beforeAfter, ISSUES: m.issues, FAILURES: m.failures ?? [],
    SHOTS: dialect === "wiki" ? m.shots.map(s => basename(s)) : [],
    PAGE_URL: m.pageUrl ?? null,
  };
}
