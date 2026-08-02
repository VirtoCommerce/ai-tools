#!/usr/bin/env node
/**
 * skills/vc-self-check/deliver.mjs — the contribution step of the vc-fix self-diagnostics
 * subsystem (VCST-5478 → VCST-5509 → the PR #172 rework). It turns a validated FINDING STRUCT
 * into ONE GitHub Issue PER FINDING on `VirtoCommerce/vc-mcp-testing-module` (the plugin's OWN
 * repo), routed by the GitHub token's ACTUAL rights and gated on explicit consent.
 *
 * Kept BYTE-IDENTICAL across the `plugins/vc-fix/` (canonical) and `.claude/` trees — the
 * containment core must ship on both surfaces or one of them silently reopens the leak class.
 *
 * ─── WHAT CHANGED IN THE REWORK, AND WHY ─────────────────────────────────────
 *
 * 1. **Input is a struct on STDIN, not a report on disk.** `--diag <path>` and the whole
 *    markdown/regex recovery path are GONE. `deliver` used to re-derive a CLOSED VOCABULARY by
 *    parsing a human-written `DIAG-*.md`, which failed in every direction at once (header
 *    backticks swallowed, `skill` collapsed to `other`, the filename stamp unmatched). With a typed
 *    struct on stdin that code is dead by construction, not hardened.
 *
 * 2. **No local report artifacts.** No `DIAG-*.md`, no `DIAG-*.json`, no `DELIVERY-*.md` — none are
 *    written and none are read. The only persistence is a COMPACT machine record per finding in the
 *    session's own `state.json`, which is what stops the same defect being re-asked every session
 *    and what lets a send that died on the network be retried.
 *
 * 3. **Dedup is PER FINDING, against open AND closed issues.** Defect identity is exactly
 *    `(skill, subject)` (`findingKey`) — nothing else. Severity, verdict, outcome, errorCode and
 *    occurrence counts are per-session JUDGEMENTS about the same bug: two sessions 26 minutes apart
 *    filed #173 and #174 for the same `project-init/tracker_field_contract` defect, graded
 *    `S2 / UNKNOWN` in one and `S1 / HTTP_4XX` in the other. A report-level fingerprint missed it,
 *    and any key folding severity would have missed it too. An OPEN match gets a `+1 occurrence`
 *    comment (and a title upgrade when the severity grew); a CLOSED match is reported back to the
 *    operator as already fixed — an upgrade, not a refile; only a genuine miss is filed.
 *
 * HARD INVARIANTS (quality-gates §2a client-code containment + per-action consent):
 *   - NEVER touches the client-installed plugin (read-only w.r.t. the install).
 *   - NEVER leaks client data upstream. Every enum field is closed-vocabulary; every v3 STRING
 *     field must prove **vendor provenance** (it is a substring of the vendor's own shipped plugin
 *     file) or pass a boundary validator that DENIES — never coerces — anything carrying a URL
 *     host, an absolute path, an email, a token-shaped run, a GUID, a value read from `.env.*` /
 *     `project-profile.json`, or a work-item field outside `System.*` / `Microsoft.VSTS.*`.
 *     See knowledge/diagnostics/upstream-schema.md + adr-upstream-default-deny.md.
 *   - DRAFT-AND-CONFIRM: the run is DRY unless `--confirm` (or `feedback.mode: auto`), and the only
 *     thing it ever sends is a GitHub Issue. There is no PR route — a telemetry report is not a
 *     code change.
 *
 * Usage:
 *   <struct.json  node deliver.mjs [--session <sid>] [--repo <owner/name>] [--as issue|local]
 *                                  [--confirm] [--dry] [--assert-nonempty] [--keep] [--json]
 *   node deliver.mjs --batch  [--confirm] [--json]      # consolidate the state.json records
 *   node deliver.mjs --purge  [--session <sid>] [--json]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, unlinkSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolveGithubToken, probeGithubUpstream, GITHUB_UPSTREAM_REMEDY } from "../project-init/probe-lib.mjs";
import {
  validateUpstream, fingerprintStruct, findingKey, severityRank, verdictRank, subjectEnum,
} from "./upstream-reduce.mjs";
import { loadExpected, findExpected } from "../../hooks/expected.mjs";

const PLUGIN_REPO = "VirtoCommerce/vc-mcp-testing-module";
const ISSUE_TITLE_PREFIX = "[vc-fix self-check]";
/** The searchable, stable, PER-FINDING marker. Identity is `(skill, subject)` and nothing else. */
export const FINDING_MARKER = "vc-fix-finding:";
/** Severity is recorded as a separate marker so a later run can tell whether it GREW. */
export const SEVERITY_MARKER = "vc-fix-severity:";
/**
 * A content hash of the "## Where" evidence block (VCST-5582 B1). Embedded in the issue body AND in
 * the FIRST occurrence comment that carries the block, so a later occurrence can tell the evidence
 * already travelled and stay a short `+1` counter. Its ABSENCE (a legacy enum-only issue like #174,
 * or an evidence-less issue) is exactly what makes the first comment carry full detail.
 */
export const WHERE_MARKER = "vc-fix-where:";

/** Stable, Date-free djb2 → base36 hash of the rendered Where block (matches upstream-reduce's). */
function hashWhere(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// outputRoot — where the local diagnostics live. Same rule as skills/project-init/lib/paths.mjs
// `outputRoot()` (VC_FIX_HOME || cwd); inlined so this file stays byte-identical across trees.
// NEVER the plugin install dir.
function outputRoot() {
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}
function diagDir() {
  return join(outputRoot(), ".vc-fix", "diagnostics");
}
/** This file lives at <pluginRoot>/skills/vc-self-check/deliver.mjs. */
function pluginRootOfThisFile() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

// ─── consent (VCST-5509) — feedback.mode gates OUTBOUND delivery only ─────────
//   off  — nothing leaves the machine; refuse to send and say why.
//   ask  — DEFAULT: DRY plan; the ORCHESTRATOR asks one binary question and re-runs with --confirm.
//   auto — files directly (a hand-set CI/consent value; /project-init no longer asks for it).
function readProfileObj() {
  try {
    const p = join(outputRoot(), "project-profile.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    /* null */
  }
  return null;
}
export function feedbackMode() {
  const m = readProfileObj()?.feedback?.mode;
  return m === "off" || m === "auto" || m === "ask" ? m : "ask"; // default = ask
}

// ─── the ONLY local persistence: compact per-finding records in state.json ─────
/**
 * `<sid>.state.json` gains a `selfCheckFindings[]` array of COMPACT records:
 *
 *   { key, skill, subject, severity, verdict, decision: "sent"|"declined"|"pending",
 *     issueNumber?, ts }
 *
 * This replaces the DIAG/DELIVERY files entirely and exists for exactly three jobs:
 *   • stop re-asking the operator about a defect they already declined,
 *   • let a send that failed on the network be retried (`decision: "pending"`),
 *   • give `--batch` something to consolidate across sessions.
 *
 * A CONFIRMED SEND CLEARS THE ENTRY. Once the Issue exists, the Issue is the source of truth and
 * the per-finding marker is the dedup key — a local copy of "already sent" could only go stale.
 * (`"sent"` therefore appears in the plan/JSON of the run that sent it, not on disk afterwards.)
 * Never throws: a state-file problem must never break delivery.
 */
function statePathFor(sid) {
  return sid ? join(diagDir(), `${sid}.state.json`) : "";
}
function readState(sid) {
  const p = statePathFor(sid);
  if (!p || !existsSync(p)) return null;
  try {
    const st = JSON.parse(readFileSync(p, "utf8"));
    return st && typeof st === "object" ? st : null;
  } catch {
    return null;
  }
}
export function readFindingRecords(sid) {
  const st = readState(sid);
  const list = st && Array.isArray(st.selfCheckFindings) ? st.selfCheckFindings : [];
  return list.filter((r) => r && typeof r === "object" && typeof r.key === "string");
}
function writeFindingRecords(sid, list) {
  const p = statePathFor(sid);
  if (!p || !existsSync(p)) return false; // capture off / no state file ⇒ no guard available
  try {
    const st = readState(sid) || {};
    st.selfCheckFindings = list;
    writeFileSync(p, JSON.stringify(st), "utf8");
    return true;
  } catch {
    return false;
  }
}
/** Upsert one finding's record; `decision: "sent"` CLEARS it (see the note above). */
export function recordFindingDecision(sid, finding, { decision, issueNumber = null, ts = null } = {}) {
  const key = findingKey(finding);
  const list = readFindingRecords(sid).filter((r) => r.key !== key);
  if (decision !== "sent") {
    list.push({
      key,
      skill: finding.skill,
      subject: finding.subject,
      severity: finding.severity,
      verdict: finding.verdict,
      decision,
      ...(issueNumber != null ? { issueNumber } : {}),
      ts: ts || new Date().toISOString(),
    });
  }
  return writeFindingRecords(sid, list);
}
/** Has the operator already been asked about this exact defect in this session? */
export function findingAlreadyDecided(sid, finding) {
  const key = findingKey(finding);
  return readFindingRecords(sid).some((r) => r.key === key && (r.decision === "declined" || r.decision === "sent"));
}

// ─── the provenance context (v3) — the PROOF that a string is the vendor's own ──
/**
 * `upstream-reduce.mjs` stays pure and does no I/O, so the proof material is loaded HERE and passed
 * in. Two halves:
 *
 *   • `files` — the content of each plugin file a finding cites, read from the INSTALLED plugin
 *     (read-only). `codeExcerpt` / `offendingLiteral` must be literal substrings of it.
 *   • `denyValues` / `states` — every value we can name from `.env.*` and `project-profile.json`.
 *     A model-authored string containing one of them is DENIED, not scrubbed.
 *
 * Without this context every v3 string is dropped (fail closed), which is why it is threaded through
 * every `validateUpstream` call on the send path rather than applied once.
 */
const DENY_STOPWORDS = new Set([
  "true", "false", "null", "none", "ask", "auto", "off", "jira", "azure", "github", "gitlab",
  "main", "master", "dev", "http", "https", "client", "platform", "direct", "fork", "unknown",
  "other", "chrome", "firefox", "edge", "linux", "win32", "darwin", "node", "npm", "test",
  "local", "localhost", "admin", "user", "email", "token", "repo", "issue", "bug", "task",
]);
function pushDeny(set, raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length < 4) return;
  if (DENY_STOPWORDS.has(s.toLowerCase())) return;
  if (/^\d+(?:\.\d+)*$/.test(s)) return; // a version or a number denies nothing useful
  // A short, separator-free, all-alphabetic word is a generic term, not an identifier; denying it
  // would silently eat legitimate plugin prose (`proposedFix` mentioning "fields", "request", …).
  if (s.length < 8 && /^[A-Za-z]+$/.test(s)) return;
  set.add(s);
  try {
    const h = new URL(s).host;
    if (h && h.length >= 4) set.add(h);
  } catch {
    /* not a URL */
  }
}
function collectEnvDenyValues(root, set) {
  let names = [];
  try { names = readdirSync(root); } catch { return; }
  for (const f of names) {
    if (!/^\.env(?:\..+)?$/.test(f)) continue;
    let text = "";
    try { text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      pushDeny(set, m[1].trim().replace(/^["']|["']$/g, ""));
    }
  }
}
function collectProfileDenyValues(profile, set, states) {
  const walk = (node, keyPath) => {
    if (typeof node === "string") {
      pushDeny(set, node);
      // Work-item STATE names are the client's process definition and never travel — collected
      // separately because they are often short, generic words the deny filter would otherwise skip.
      if (/state/i.test(keyPath) && node.trim().length >= 3) states.add(node.trim());
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, keyPath); return; }
    if (node && typeof node === "object") { for (const [k, v] of Object.entries(node)) walk(v, `${keyPath}.${k}`); }
  };
  walk(profile, "");
  // `clientOrg` is called out explicitly: it is THE client identifier, and it may well be shorter
  // than the generic-word floor above.
  const org = profile?.clientOrg ?? profile?.upstream?.clientGithubAccount ?? profile?.vcs?.clientOrg;
  if (typeof org === "string" && org.trim().length >= 3) set.add(org.trim());
}
/**
 * VCST-5582 (confabulation gate) — the lowercased corpus of everything the COLLECTOR actually
 * captured this session: obs evidence snippets + span error-detail snippets, plus the obs HTTP-class
 * codes. Threaded into the provenance ctx so `upstream-reduce` can DROP a vendor error IDENTITY
 * (typeKey / name / code / http-status) the diagnostician supplied but that appears NOWHERE in the
 * telemetry — i.e. a fabricated "Vendor error identity: TF401174 · HTTP 404" for an operation that
 * never ran. A real error's raw text is captured verbatim by the collector, so a genuine identity is
 * always grounded; only invented ones fail. Returns `evidence:""` (not null) when a sid is given but
 * the jsonl is missing, so a real send with lost telemetry FAILS CLOSED (identity dropped), matching
 * the ADR default-deny stance.
 */
function loadSessionEvidence(sid) {
  const empty = { evidence: "", httpClasses: new Set() };
  if (!sid) return empty;
  const p = join(diagDir(), `${sid}.jsonl`);
  let text = "";
  try {
    if (!existsSync(p)) return empty;
    text = readFileSync(p, "utf8");
  } catch {
    return empty;
  }
  const parts = [];
  const httpClasses = new Set();
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let r;
    try { r = JSON.parse(s); } catch { continue; }
    if (r && r.type === "obs") {
      const ev = r.evidence || {};
      if (typeof ev.snippet === "string") parts.push(ev.snippet);
      if (ev.httpStatus != null) parts.push(String(ev.httpStatus));
      if (typeof r.code === "string" && /^HTTP_\dXX$/.test(r.code)) httpClasses.add(r.code);
    }
    if (r && r.type === "span" && Array.isArray(r.details)) {
      for (const d of r.details) if (d && typeof d.snippet === "string") parts.push(d.snippet);
    }
  }
  return { evidence: parts.join("\n").toLowerCase(), httpClasses };
}
export function buildProvenanceCtx(struct, { pluginRoot = pluginRootOfThisFile(), root = outputRoot(), sid = "" } = {}) {
  const files = new Map();
  for (const f of struct?.findings ?? []) {
    const rel = typeof f?.pluginFile === "string" ? f.pluginFile : "";
    if (!rel || files.has(rel)) continue;
    if (rel.includes("..") || /^[/\\]/.test(rel) || /^[A-Za-z]:/.test(rel)) continue; // never escape the plugin
    const abs = resolve(pluginRoot, rel);
    if (!abs.startsWith(resolve(pluginRoot))) continue;
    try {
      if (existsSync(abs) && statSync(abs).isFile()) files.set(rel, readFileSync(abs, "utf8"));
    } catch {
      /* unreadable ⇒ unproven ⇒ the field is dropped */
    }
  }
  const deny = new Set();
  const states = new Set();
  collectEnvDenyValues(root, deny);
  const profile = readProfileObj();
  if (profile) collectProfileDenyValues(profile, deny, states);
  // Grounding corpus (VCST-5582): loaded ONLY when a session id is known. With no sid (e.g. batch
  // aggregation across sessions) `evidence` stays null and provenanceFields keeps its prior
  // shape-only vendor-identity behavior; with a sid it is a string (possibly "") and every vendor
  // error identity must appear in the captured telemetry or it is dropped as `ungrounded`.
  const ground = sid ? loadSessionEvidence(sid) : { evidence: null, httpClasses: new Set() };
  return { files, denyValues: [...deny], states: [...states], evidence: ground.evidence, httpClasses: ground.httpClasses };
}

// ─── route resolution ────────────────────────────────────────────────────────
/**
 * Decide the delivery route from the probed permission on the plugin repo.
 *   issue — any authenticated token with issue rights → GitHub Issue (the ONLY sending route)
 *   local — no token / auth failed / nothing upstream is possible → report + remedy
 *
 * ONLY TWO ROUTES. `push`/`maintain`/`admin` used to resolve to `pr` and a fork-capable token to
 * `fork-pr`, and BOTH were hand-offs that printed commands and sent nothing — so the MORE rights a
 * token had, the LESS was delivered. A self-check contribution is a telemetry report, not a code
 * change: no patch to review, no working tree to build one in. `--as pr` is rejected.
 *
 * NO OPTIMISTIC DEFAULT (VCST-5582 A): an UNREADABLE capability is never assumed capable.
 */
export function resolveRoute({ token, probe, scopes, override }) {
  if (override) return { route: override, reason: "operator override (--as)" };
  if (!token) return { route: "local", reason: "no GitHub token or gh session" };
  if (!probe || !probe.ok) {
    const retried = probe && probe.retried ? " (retried once)" : "";
    return { route: "local", reason: `token present but GitHub authentication failed${retried}` };
  }
  const perm = probe.perm;
  const remedy = probe.remedy || GITHUB_UPSTREAM_REMEDY;
  if (["push", "maintain", "admin"].includes(perm)) {
    return { route: "issue", reason: `push access (${perm}) — a self-check report is filed as an Issue, not a code PR` };
  }
  const kind = probe.tokenKind || "";
  const scopeList = String(scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const upstreamCapable = probe.forkCapable
    || (scopeList.length ? (scopeList.some((s) => /^(repo|public_repo)$/i.test(s)) ? "yes" : "no") : "unknown");
  if (upstreamCapable === "no" && kind !== "fine-grained") {
    return { route: "local", reason: `authenticated but the token has no upstream rights (no repo/public_repo scope) — ${remedy}` };
  }
  const why = upstreamCapable === "yes"
    ? `authenticated as ${probe.login || "user"} with upstream rights`
    : kind === "fine-grained"
    ? "fine-grained token — Issue is the only upstream route it can take"
    : "upstream capability could not be confirmed for this token";
  return { route: "issue", reason: `${why} — filing an Issue (least-privileged upstream route). If GitHub refuses it: ${remedy}` };
}

// ─── probe with one retry ────────────────────────────────────────────────────
/**
 * Probe the plugin repo, retrying ONCE before declaring the token unusable. A dry run once reported
 * `route: local` / "authentication failed" while a confirm run minutes later on the SAME token
 * reported `perm: maintain` — a transient blip read as a permissions problem. `retried` is threaded
 * into the reason so a genuine failure stays distinguishable.
 */
export async function probeWithRetry({ token, repo, via, scopes }, { probe = probeGithubUpstream, delayMs = 750 } = {}) {
  const first = await probe({ token, repo, via, scopes }).catch(() => null);
  if (first && first.ok) return first;
  await new Promise((r) => setTimeout(r, delayMs));
  const second = await probe({ token, repo, via, scopes }).catch(() => null);
  if (second && second.ok) return { ...second, retried: true };
  return { ...(second || first || { ok: false }), retried: true };
}

// ─── per-finding issue identity + search ─────────────────────────────────────
export function findingMarkerFor(finding) {
  return `<!-- ${FINDING_MARKER} ${findingKey(finding)} -->`;
}
export function findingTitleFor(finding, verdict) {
  return `${ISSUE_TITLE_PREFIX} ${findingKey(finding)} ${verdict || finding.verdict}`;
}

/** The severity an existing issue was last filed/updated at — from our own marker, else its body. */
export function severityOfIssue(issue) {
  const text = `${issue?.title ?? ""}\n${issue?.body ?? ""}`;
  const m = new RegExp(`${SEVERITY_MARKER}\\s*(S[0-3])`).exec(text) || /\bS([0-3])\b/.exec(text);
  if (!m) return null;
  return m[1].startsWith("S") ? m[1] : `S${m[1]}`;
}
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "User-Agent": "vc-self-check",
  Accept: "application/vnd.github+json",
});

/**
 * Find the issue that already tracks this defect — OPEN **or CLOSED**.
 *
 * State matters in both directions and for different reasons:
 *   • an OPEN match must not be refiled (that is how #173/#174 happened),
 *   • a CLOSED match must not be refiled either — it is FIXED upstream, and the honest answer to the
 *     operator is "upgrade", not a new ticket. Silently commenting `+1` on a closed issue would bury
 *     the recurrence; silently filing a new one would hide that a fix already exists.
 *
 * LEGACY COMPATIBILITY IS REQUIRED, not optional: #173/#174 are BUNDLED issues carrying a
 * report-level fingerprint and no per-finding marker. Without the text fallback the first run after
 * this change refiles every finding they already contain. So the search is, in order:
 *   1. the exact per-finding marker (`state: all`),
 *   2. the bare `<skill>/<subject>` key as TEXT in title or body (`state: all`) — the legacy bridge,
 *   3. a paged list scan, for when Search is rate-limited or not yet indexed.
 */
export async function findFindingIssue({ repo, token, key, fetchImpl = fetch }) {
  if (!token) return null;
  const marker = `${FINDING_MARKER} ${key}`;
  const headers = ghHeaders(token);
  const shape = (it) => ({
    number: it.number,
    url: it.html_url,
    state: it.state === "closed" ? "closed" : "open",
    title: it.title || "",
    body: it.body || "",
    closedAt: it.closed_at || null,
    milestone: it.milestone?.title || null,
    legacy: !(it.body || "").includes(marker),
  });
  const exact = (it) => it && !it.pull_request && (it.body || "").includes(marker);
  // A legacy/bundled issue: our own self-check title prefix AND the key mentioned anywhere. Both
  // halves are required — the key alone could match an unrelated human issue quoting it.
  const legacy = (it) =>
    it && !it.pull_request
    && String(it.title || "").includes(ISSUE_TITLE_PREFIX)
    && `${it.title || ""}\n${it.body || ""}`.includes(key);

  const search = async (q) => {
    try {
      const r = await fetchImpl(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=30`, { headers });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.items) ? j.items : [];
    } catch {
      return [];
    }
  };

  // 1 + 2 — Search OPEN issues ONLY (`is:open`). VCST-5582: dedup looks at open issues only — a
  // CLOSED issue is not proof the defect is gone (a "fixed"-and-closed bug that RECURS was being
  // silently swallowed as "already fixed upstream" instead of surfacing as a fresh occurrence). So a
  // recurrence whose prior issue is closed files a NEW issue rather than deduping onto the closed one.
  const items = [
    ...(await search(`repo:${repo} is:issue is:open "${marker}"`)),
    ...(await search(`repo:${repo} is:issue is:open "${key}"`)),
  ];
  const pick = (list) => {
    // OPEN-only: closed issues never count as a dedup match. Exact-marker hit preferred over the
    // legacy text bridge.
    const hits = list.map(shape).filter((h) => h.state === "open");
    return hits.find((h) => !h.legacy) || hits[0] || null;
  };
  const fromSearch = pick(items.filter((it) => exact(it) || legacy(it)));
  if (fromSearch) return fromSearch;

  // 3 — list fallback (Search unavailable / a just-filed issue not yet indexed), OPEN only.
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&sort=created&direction=desc`, { headers });
    if (!r.ok) return null;
    const list = await r.json();
    return pick((Array.isArray(list) ? list : []).filter((it) => exact(it) || legacy(it)));
  } catch {
    return null;
  }
}

// ─── issue body (§7) ────────────────────────────────────────────────────────
/**
 * ONE issue per finding, so the body describes ONE defect.
 *
 * What the old table got wrong, and is fixed here:
 *   • `Outcome` is GONE. For an observation-derived finding it always rendered `success` next to
 *     `BROKEN`, which a maintainer reads as a contradiction. It stays in the struct (the fingerprint
 *     folds it) and is simply not rendered.
 *   • `Struggle` and `Repo` render ONLY when populated. They are structurally empty for every
 *     observation-derived finding, so as fixed columns they were pure noise.
 *   • A **Where** block carries the v3 provenance: `pluginFile:pluginLine`, the code excerpt, the
 *     offending literal, the vendor API shape, the vendor error identity, and the proposed fix.
 *   • The containment note is ACCURATE to the new rule. It used to claim "NO free text, NO file
 *     paths", which is no longer true — and a containment note that overclaims is worse than none.
 */
/**
 * The "## Where" evidence block — the plugin file:line, code excerpt, offending literal, vendor API
 * shape, vendor error identity, vendor docs/message, and the proposed fix. Built ONCE here so the
 * issue body AND the occurrence comment carry byte-for-byte the SAME evidence (VCST-5582 B1): a
 * deduped finding used to reach the maintainer as a bare `+1` counter with no root cause, because
 * this block lived only in the issue-body template. Returns `{ lines, hash, marker }`:
 *   - `lines`  — the rendered block (`[]` when the finding carries no provenance);
 *   - `hash`   — a content hash of the block (`""` when empty);
 *   - `marker` — `<!-- vc-fix-where: <hash> -->` (`""` when empty), embedded wherever the block is
 *                rendered so a later occurrence can detect the evidence already travelled.
 */
export function buildWhereBlock(finding) {
  const f = finding;
  const fence = "```";
  const where = [];
  if (f.pluginFile) where.push(`- Location: \`${f.pluginFile}${f.pluginLine ? `:${f.pluginLine}` : ""}\``);
  if (f.codeExcerpt) where.push(`- Plugin source at that location:\n\n${fence}\n${f.codeExcerpt}\n${fence}\n`);
  if (f.offendingLiteral) where.push(`- Offending literal: \`${f.offendingLiteral}\``);
  if (f.apiShape) where.push(`- Vendor API shape: \`${f.apiShape}\``);
  const vendorId = [
    f.vendorErrorTypeKey ? `typeKey \`${f.vendorErrorTypeKey}\`` : "",
    f.vendorErrorName ? `typeName \`${f.vendorErrorName}\`` : "",
    f.vendorErrorCode ? `errorCode \`${f.vendorErrorCode}\`` : "",
    f.vendorHttpStatus ? `HTTP ${f.vendorHttpStatus}` : "",
  ].filter(Boolean).join(" · ");
  if (vendorId) where.push(`- Vendor error identity: ${vendorId}`);
  if (f.vendorDocUrl) where.push(`- Vendor docs: ${f.vendorDocUrl}`);
  if (f.vendorErrorMessage) where.push(`- Vendor error message (normalized, operator-disclosed): \`${f.vendorErrorMessage}\``);
  if (f.proposedFix) where.push(`- Proposed fix: ${f.proposedFix}`);
  const hash = where.length ? hashWhere(where.join("\n")) : "";
  return { lines: where, hash, marker: hash ? `<!-- ${WHERE_MARKER} ${hash} -->` : "" };
}

// B5 — would filing a NEW issue for this finding tell a maintainer anything they could act on? A
// finding with no cited plugin file, no proven code excerpt/literal, and no vendor error identity is
// a severity table plus boilerplate and nothing else (#183). It may still comment "+1" on an
// EXISTING issue (that issue already carries the evidence), but it must never be FILED fresh.
export function hasLocatableEvidence(f) {
  return Boolean(
    f?.pluginFile || f?.codeExcerpt || f?.offendingLiteral
    || f?.vendorErrorTypeKey || f?.vendorErrorName || f?.vendorErrorCode || f?.vendorHttpStatus,
  );
}

// B6 — one line naming every string the boundary validator withheld, so a maintainer can tell "no
// fix was proposed" from "a fix was proposed and did not survive the boundary". `finding.withheld`
// is a closed-vocabulary list ({field, reason}); this renders it, never a value.
export function withheldLine(finding) {
  const w = Array.isArray(finding?.withheld) ? finding.withheld : [];
  if (!w.length) return "";
  return `Withheld by boundary validator: ${w.map((x) => `${x.field} (${x.reason})`).join(", ")}`;
}

export function buildFindingIssue({ finding, struct, route = "issue" }) {
  const f = finding;
  const key = findingKey(f);
  const marker = findingMarkerFor(f);
  const title = findingTitleFor(f);

  const { lines: where, marker: whereMarker } = buildWhereBlock(f);

  const extras = [
    f.struggle?.length ? `Struggle: \`${f.struggle.join(", ")}\`` : "",
    f.repoKind && f.repoKind !== "unknown" ? `Repo kind: \`${f.repoKind}\`` : "",
    f.retries > 0 ? `Retries: ${f.retries}` : "",
  ].filter(Boolean);

  const body = [
    marker,
    `<!-- ${SEVERITY_MARKER} ${f.severity} -->`,
    ...(whereMarker ? [whereMarker] : []),
    `Automated quality report from the vc-fix self-diagnostics subsystem (\`/vc-self-check\`).`,
    ``,
    `| Sev | Skill | Subject | Verdict | Impact | Signal | Error |`,
    `|-----|-------|---------|---------|--------|--------|-------|`,
    `| ${f.severity} | ${f.skill} | ${f.subject} | ${f.verdict} | ${f.blockedDeliverable ? "blocked the deliverable" : "completed, rule violated"} | ${f.signalClass} | ${f.errorCode} |`,
    ``,
    `Observed in ${struct.sessionCount} session(s)${f.occurrences > 1 ? ` · ${f.occurrences} occurrence(s)` : ""} · plugin \`${struct.pluginVersion}\` · node \`${struct.nodeVersion}\` · ${struct.os}`,
    ...(extras.length ? [``, extras.map((e) => `- ${e}`).join("\n")] : []),
    ...(where.length ? [``, `## Where`, ...where] : []),
    ...(withheldLine(f) ? [``, `> ${withheldLine(f)}`] : []),
    ...(struct.feedback.up + struct.feedback.down > 0 ? [``, `## Operator feedback`, `👍 ${struct.feedback.up} · 👎 ${struct.feedback.down} (counts only — the note never leaves the client machine)`] : []),
    ``,
    // D1 — the ~200-word containment paragraph used to be LONGER than the actual finding in three of
    // #180–#183, drowning the content. It is a stable, per-repo fact, so it lives in the ADR now; the
    // body carries a one-line link instead.
    `<sub>Containment (closed enum vocabulary · vendor-provenance strings only · default-deny boundary): \`knowledge/diagnostics/adr-upstream-default-deny.md\` · quality-gates §2a.</sub>`,
    ``,
    `<sub>${FINDING_MARKER} ${key} · route ${route}</sub>`,
  ].join("\n");

  return { key, marker, title, body };
}

// ─── GitHub writes ───────────────────────────────────────────────────────────
async function createIssue({ repo, token, title, body, fetchImpl = fetch }) {
  const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({ title, body }),
  });
  if (!r.ok) throw new Error(`GitHub issue create failed: ${r.status} ${await r.text().catch(() => "")}`);
  const j = await r.json();
  return { number: j.number, url: j.html_url };
}

/**
 * `+1 occurrence` on an OPEN match. The comment carries what a maintainer actually needs to judge
 * prevalence and urgency: how many sessions, which plugin version, and the severity observed NOW —
 * plus an explicit escalation note when this occurrence is WORSE than the one the issue was filed at
 * (the #173/#174 pair differed by exactly that, and nothing said so).
 *
 * TEMPLATE PARITY (VCST-5582 B1). When `includeWhere` is set, the comment ALSO carries the full
 * `## Where` evidence block — the same block the issue body has — so a deduped finding reaches the
 * maintainer with its root cause (location, excerpt, offending literal, proposed fix), not a bare
 * counter. The caller sets `includeWhere` only when the target issue does NOT already carry that
 * evidence (matched on `WHERE_MARKER` + the block's content hash), so the FIRST comment on an
 * evidence-less/legacy issue is full and repeat occurrences stay short. When the block IS included,
 * its own `## Where` lines already carry the vendor identity, so the standalone identity line is
 * dropped to avoid duplication.
 */
export function occurrenceCommentBody({ finding, struct, escalatedFrom = null, includeWhere = false }) {
  const lines = [
    `+1 occurrence — another vc-fix session hit \`${findingKey(finding)}\`.`,
    ``,
    `- Sessions in this report: ${struct.sessionCount}`,
    `- Plugin version: \`${struct.pluginVersion}\` · node \`${struct.nodeVersion}\` · ${struct.os}`,
    `- Severity observed now: **${finding.severity}** (${finding.verdict})`,
  ];
  if (escalatedFrom) {
    lines.push(
      `- ⚠ **Severity escalated** from ${escalatedFrom} to ${finding.severity} — this occurrence was worse than the one this issue was filed at. Title verdict updated to ${finding.verdict}.`,
    );
  }
  const { lines: whereLines, marker: whereMarker } = buildWhereBlock(finding);
  if (includeWhere && whereLines.length) {
    lines.push(``, whereMarker, `## Where`, ...whereLines);
  } else if (finding.vendorErrorTypeKey || finding.vendorErrorCode || finding.vendorHttpStatus) {
    lines.push(`- Vendor error identity: ${[
      finding.vendorErrorTypeKey ? `typeKey \`${finding.vendorErrorTypeKey}\`` : "",
      finding.vendorErrorCode ? `errorCode \`${finding.vendorErrorCode}\`` : "",
      finding.vendorHttpStatus ? `HTTP ${finding.vendorHttpStatus}` : "",
    ].filter(Boolean).join(" · ")}`);
  }
  if (withheldLine(finding)) lines.push(`- ${withheldLine(finding)}`);
  return lines.join("\n");
}

/**
 * Does any EXISTING comment on the issue already carry this Where-evidence marker? `findFindingIssue`
 * returns the issue title+body but not its comments, so a Where block a PRIOR occurrence added in a
 * comment lives only here. Fail OPEN (return false ⇒ "not carried" ⇒ include the evidence): under
 * uncertainty, over-informing the maintainer beats silently dropping the root cause (B1's bias).
 */
export async function commentsCarryMarker({ repo, token, number, marker, fetchImpl = fetch }) {
  if (!marker) return true; // no evidence to carry ⇒ nothing to add
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${number}/comments?per_page=100`, { headers: ghHeaders(token) });
    if (!r.ok) return false;
    const list = await r.json();
    return (Array.isArray(list) ? list : []).some((c) => String(c?.body || "").includes(marker));
  } catch {
    return false;
  }
}
async function addComment({ repo, token, number, body, fetchImpl = fetch }) {
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${number}/comments`, {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({ body }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
async function updateIssueTitle({ repo, token, number, title, fetchImpl = fetch }) {
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${number}`, {
      method: "PATCH",
      headers: ghHeaders(token),
      body: JSON.stringify({ title }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * ONE-OFF BACKFILL (`--backfill`): add the per-finding marker as a COMMENT to already-open bundled
 * self-check issues, so the legacy text bridge in `findFindingIssue` can retire. Read-mostly and
 * idempotent — an issue that already carries the marker anywhere is skipped. Never filed, never
 * closed, never re-titled.
 */
async function backfillMarkers({ repo, token, json, fetchImpl = fetch }) {
  const out = { action: "backfill", repo, scanned: 0, commented: [], skipped: [] };
  if (!token) {
    out.error = "no GitHub token — cannot backfill";
    emit(json, out, out.error);
    process.exitCode = 2;
    return;
  }
  let items = [];
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers: ghHeaders(token) });
    if (r.ok) items = await r.json();
  } catch {
    items = [];
  }
  for (const it of Array.isArray(items) ? items : []) {
    if (it.pull_request || !String(it.title || "").includes(ISSUE_TITLE_PREFIX)) continue;
    out.scanned++;
    const text = `${it.title || ""}\n${it.body || ""}`;
    if (text.includes(FINDING_MARKER)) { out.skipped.push(it.number); continue; }
    // Recover `<skill>/<subject>` pairs from the bundled table: they are the only `a/b` tokens in it
    // whose halves are both closed-vocabulary members, which `findingKey` re-validates.
    const keys = new Set();
    for (const m of text.matchAll(/\b([a-z][a-z0-9-]{2,})\/([a-z][a-z0-9_]{2,})\b/g)) {
      const k = findingKey({ skill: m[1], subject: m[2] });
      if (!k.startsWith("other/") && !k.endsWith("/other")) keys.add(k);
    }
    if (!keys.size) { out.skipped.push(it.number); continue; }
    const body = [
      `Per-finding markers for the self-diagnostics dedup index (added by \`deliver.mjs --backfill\`).`,
      `This bundled issue predates one-issue-per-finding; the markers below let dedup recognise it`,
      `without matching on free text.`,
      ``,
      ...[...keys].map((k) => `<!-- ${FINDING_MARKER} ${k} -->`),
    ].join("\n");
    if (await addComment({ repo, token, number: it.number, body, fetchImpl })) out.commented.push({ number: it.number, keys: [...keys] });
    else out.skipped.push(it.number);
  }
  emit(json, out, `Backfilled ${out.commented.length} of ${out.scanned} open self-check issue(s); skipped ${out.skipped.length}.`);
}

// ─── the information-free-payload guard (--assert-nonempty) ──────────────────
/**
 * Would this contribution carry any information at all?
 *
 * The incident this guard exists for produced a syntactically perfect, fully contained, completely
 * useless report: every column reduced to `other` / `none` / `UNKNOWN`, so an S1 blocker and an S2
 * gap were indistinguishable from each other and from noise. Nothing detected it — the containment
 * tests assert what must NOT be present, and an empty report is perfectly contained.
 *
 * v3 widens the "informative" test to the provenance fields: a finding that names a plugin
 * file/line or carries a vendor error identity is informative even if its enums are coarse.
 * Pure + offline + deterministic, so it works as a CI gate and as a test oracle.
 */
export function assertNonEmpty(struct) {
  const findings = struct?.findings ?? [];
  const rows = findings.filter((f) => f.verdict === "BROKEN" || f.verdict === "DEGRADED");
  const degenerate = (f) =>
    f.skill === "other" && (f.subject === "other" || f.subject === "none" || f.subject == null)
    && f.signalClass === "none" && f.errorCode === "UNKNOWN"
    && !f.pluginFile && !f.offendingLiteral && !f.vendorErrorTypeKey && !f.vendorErrorCode && !f.vendorHttpStatus;
  if (!findings.length) {
    return { ok: false, reason: "the struct carries NO findings — the contribution would say nothing", rows: 0, findings: 0 };
  }
  if (!rows.length) {
    return { ok: true, reason: "no BROKEN/DEGRADED finding — nothing is expected upstream", rows: 0, findings: findings.length };
  }
  const informative = rows.filter((f) => !degenerate(f));
  if (!informative.length) {
    return {
      ok: false,
      reason: `all ${rows.length} actionable finding(s) are skill:other + signalClass:none + errorCode:UNKNOWN with no provenance — the contribution would name neither the skill nor the failure`,
      rows: rows.length,
      findings: findings.length,
    };
  }
  return { ok: true, reason: `${informative.length}/${rows.length} actionable finding(s) carry an identifying dimension`, rows: rows.length, findings: findings.length };
}

// ─── local artifact lifecycle (no report files any more) ──────────────────────
/**
 * The session's local artifacts are now exactly two files: the collector's `<sid>.jsonl` and its
 * `<sid>.state.json`. `DIAG-*.md` / `DIAG-*.json` / `DELIVERY-*.md` no longer exist, so the purge
 * surface shrank with them. Best-effort per file; never throws. Returns the basenames removed.
 */
export function purgeSession({ dir, sid }) {
  const removed = [];
  if (!sid || sid.length < 6 || !existsSync(dir)) return removed;
  const rm = (p) => { try { if (existsSync(p)) { unlinkSync(p); removed.push(String(p).split(/[\\/]/).pop()); } } catch { /* ignore */ } };
  for (const f of [`${sid}.jsonl`, `${sid}.state.json`]) rm(join(dir, f));
  return removed;
}

// ─── CLI plumbing ────────────────────────────────────────────────────────────
function emit(json, obj, human) {
  if (json) process.stdout.write(JSON.stringify(obj) + "\n");
  else process.stdout.write(`${human}\n`);
}

function parseArgs(argv) {
  const a = { repo: PLUGIN_REPO, confirm: false, json: false, purge: false, keep: false, dry: false, assertNonEmpty: false, batch: false, backfill: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--confirm" || t === "--send") a.confirm = true;
    else if (t === "--json") a.json = true;
    else if (t === "--dry") a.dry = true;
    else if (t === "--assert-nonempty") { a.assertNonEmpty = true; a.dry = true; }
    else if (t === "--repo") a.repo = argv[++i];
    else if (t === "--as") a.override = argv[++i];
    else if (t === "--session") a.session = argv[++i];
    else if (t === "--input") a.input = argv[++i];
    else if (t === "--purge") a.purge = true;
    else if (t === "--keep") a.keep = true;
    else if (t === "--batch") a.batch = true;
    else if (t === "--backfill") a.backfill = true;
  }
  return a;
}

/** Read the finding struct from stdin. Returns null when nothing was piped. */
export async function readStdinJson(stream = process.stdin) {
  if (stream.isTTY) return null;
  let raw = "";
  try {
    for await (const chunk of stream) raw += chunk;
  } catch {
    return null;
  }
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`stdin is not valid JSON: ${e?.message ?? e}`);
  }
}

/** The self-check contribution may ONLY ever target the VirtoCommerce platform org (§2a
 *  defense-in-depth: a `--repo` override must not misroute an issue to a token-writable repo). */
export function isAllowedUpstreamRepo(repo) {
  const r = String(repo ?? "");
  if (r.includes("..")) return false;
  return /^VirtoCommerce\/[A-Za-z0-9][\w.-]*$/i.test(r);
}

/** The only routes this script knows how to act on (`pr`/`fork-pr` were removed). */
export const ROUTES = ["issue", "local"];

function nextStepsFor({ route, results, confirmed }) {
  if (route === "local") {
    return [
      "No token or no upstream rights — nothing can be sent from this machine.",
      "Authenticate, then re-run to deliver (the local telemetry is kept until then):",
      "  export GITHUB_FIX_BUGS_TOKEN=<PAT>   # or:  gh auth login",
    ];
  }
  if (confirmed) {
    const failed = results.filter((r) => r.action === "error");
    return failed.length ? [`${failed.length} finding(s) failed to deliver; the local telemetry was kept — re-run with --confirm to retry.`] : [];
  }
  const nu = results.filter((r) => r.plan === "file").length;
  const known = results.filter((r) => r.plan === "comment").length;
  const steps = [];
  if (nu || known) steps.push(`Nothing sent yet. Re-run with --confirm to file ${nu} new issue(s) and add ${known} occurrence comment(s).`);
  if (!steps.length) steps.push("Nothing to do — every finding is already tracked and up to date.");
  return steps;
}

// ─── --batch: consolidate the state.json records across sessions ──────────────
/**
 * `--batch` used to aggregate local `DIAG-*.md` files. Those are gone, so it consolidates the
 * COMPACT per-finding records instead: every session's `state.json` `selfCheckFindings[]` entry
 * still awaiting delivery (`decision: "pending"`), merged by `(skill, subject)` at max severity with
 * an occurrence count = how many sessions hit it.
 *
 * Note the deliberate limitation: a compact record carries no provenance (the plugin file, the code
 * excerpt and the vendor error identity live only in the live struct the diagnostician produced). A
 * batch therefore files a THINNER issue than an interactive run — which is the correct trade for a
 * catch-up sweep over sessions whose structs are long gone.
 */
function collectBatchFindings() {
  const dir = diagDir();
  const bySession = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return bySession; }
  for (const f of names) {
    if (!f.endsWith(".state.json")) continue;
    const sid = f.slice(0, -".state.json".length);
    const recs = readFindingRecords(sid).filter((r) => r.decision === "pending");
    if (recs.length) bySession.push({ sid, records: recs });
  }
  return bySession;
}
function mergeBatchRecords(bySession) {
  const byKey = new Map();
  for (const { records } of bySession) {
    for (const r of records) {
      const e = byKey.get(r.key);
      if (!e) {
        byKey.set(r.key, {
          skill: r.skill, subject: r.subject, severity: r.severity, verdict: r.verdict,
          blockedDeliverable: r.verdict === "BROKEN", outcome: r.verdict === "BROKEN" ? "failed" : "degraded",
          signalClass: "none", struggle: [], errorCode: "UNKNOWN", toolFamily: "none",
          repoKind: "unknown", retries: 0, occurrences: 1,
        });
        continue;
      }
      e.occurrences++;
      if (severityRank(r.severity) > severityRank(e.severity)) e.severity = r.severity;
      if (verdictRank(r.verdict) > verdictRank(e.verdict)) { e.verdict = r.verdict; e.blockedDeliverable = r.verdict === "BROKEN"; }
    }
  }
  return [...byKey.values()];
}

// ─── the send loop ───────────────────────────────────────────────────────────
/**
 * Plan (and, on `--confirm`, perform) delivery for EVERY finding independently.
 *
 * Partial overlap is the NORMAL case, not an edge case: a real session typically re-hits two known
 * defects and discovers two new ones. Each finding is therefore resolved on its own — comment on the
 * known ones, file only the genuinely new ones — and the summary states the split explicitly, so the
 * operator can see "2 already reported (#173 open, #119 closed/fixed), 2 new" rather than a single
 * opaque verdict.
 */
// D2 — cluster findings that share an IDENTITY (`findingKey` = skill/subject, +file-hash for the
// `other` subject) into ONE issue before filing. The obs path already emits one finding per
// (skill, subject), but the SPAN path can emit a SECOND finding for the same pair (a flagged span +
// an observation of the same operation), so without this two issues (or a double-file) result from a
// single run. Representative = the highest-severity/verdict member; occurrences are summed; withheld
// fields are unioned. A different subject or a different plugin site keeps a SEPARATE issue (their
// `findingKey` differs), exactly as D2 requires.
export function clusterFindingsByKey(findings) {
  const groups = new Map();
  for (const f of Array.isArray(findings) ? findings : []) {
    const k = findingKey(f);
    const g = groups.get(k);
    const occ = f.occurrences ?? 1;
    if (!g) { groups.set(k, { ...f, occurrences: occ }); continue; }
    const merged = severityRank(f.severity) > severityRank(g.severity) || verdictRank(f.verdict) > verdictRank(g.verdict)
      ? { ...f } : { ...g };
    merged.occurrences = (g.occurrences ?? 1) + occ;
    const wh = [...(Array.isArray(g.withheld) ? g.withheld : []), ...(Array.isArray(f.withheld) ? f.withheld : [])];
    const seen = new Set();
    merged.withheld = wh.filter((w) => { const key = `${w.field}|${w.reason}`; if (seen.has(key)) return false; seen.add(key); return true; });
    groups.set(k, merged);
  }
  return [...groups.values()];
}

async function deliverFindings({ struct, sid, repo, token, route, confirm, keep, json, fetchImpl = fetch }) {
  const results = [];
  // D2 — one issue per distinct identity: collapse same-key findings from a single run.
  const findings = clusterFindingsByKey(struct.findings);
  // C4 — .vc-fix/expected.json: a finding the operator declared EXPECTED (a planted fixture, a known
  // benign friction) is NEVER filed, even on an explicit `--confirm`. Matched by subject (normalized
  // to the reduced enum so a raw-slug entry still matches) + optional pluginFile.
  const expected = loadExpected(outputRoot());
  const subjectEq = (entrySubject, findingSubject) => subjectEnum(entrySubject) === findingSubject;
  for (const f of findings) {
    const key = findingKey(f);
    const suppressor = expected.entries.length
      ? findExpected(expected.entries, { subject: f.subject, pluginFile: f.pluginFile }, subjectEq)
      : null;
    if (suppressor) {
      results.push({
        key, skill: f.skill, subject: f.subject, severity: f.severity, verdict: f.verdict,
        withheldFields: Array.isArray(f.withheld) ? f.withheld : [],
        issue: null, plan: "suppressed", action: "planned", suppressReason: suppressor.reason,
      });
      continue;
    }
    const issue = route === "issue" ? await findFindingIssue({ repo, token, key, fetchImpl }) : null;
    const built = buildFindingIssue({ finding: f, struct, route });
    const r = {
      key, skill: f.skill, subject: f.subject, severity: f.severity, verdict: f.verdict,
      title: built.title, body: built.body, marker: built.marker,
      withheldFields: Array.isArray(f.withheld) ? f.withheld : [], // B6 — echoed in the result line
      issue: issue ? { number: issue.number, url: issue.url, state: issue.state, legacy: issue.legacy } : null,
      plan: "file", action: "planned",
    };
    if (issue) {
      // `findFindingIssue` returns OPEN issues only (VCST-5582 — closed issues are not a dedup
      // match), so a match here is always an open occurrence → a `+1` comment.
      r.plan = "comment";
      const was = severityOfIssue(issue);
      r.escalatedFrom = was && severityRank(f.severity) > severityRank(was) ? was : null;
      // Template parity (B1): does the target issue's TITLE/BODY already carry this finding's Where
      // evidence? A legacy/enum-only issue (#174) does not — so its first comment must be full.
      // `""` marker (finding has no provenance) ⇒ treat as "carried" (nothing to add).
      const { marker: whereMarker } = buildWhereBlock(f);
      r.whereMarker = whereMarker;
      r.bodyHasWhere = whereMarker ? `${issue.title || ""}\n${issue.body || ""}`.includes(whereMarker) : true;
    } else if (!hasLocatableEvidence(f)) {
      // B5 — no existing issue AND nothing locatable to say: do NOT file a contentless issue (#183).
      r.plan = "withhold";
      r.withholdReason = "no-locatable-evidence";
    }
    results.push(r);
  }

  // A `local` route cannot send anything (no token / no upstream rights). Record the findings as
  // pending so a later authenticated run delivers them, and never attempt a POST — a `--confirm` on
  // a route that cannot send must be a no-op, not a doomed request with a bad/absent token.
  if (!confirm || route !== "issue") {
    for (const r of results) {
      const decision = r.plan === "withhold" ? "withheld" : r.plan === "suppressed" ? "suppressed" : "pending";
      recordFindingDecision(sid, r, { decision });
    }
    return results;
  }

  for (const r of results) {
    const f = findings.find((x) => findingKey(x) === r.key);
    if (r.plan === "suppressed") {
      // C4 — declared expected in .vc-fix/expected.json: refuse to file even on --confirm. Resolved
      // (nothing to retry), recorded so the audit shows it was withheld deliberately.
      r.action = "suppressed";
      recordFindingDecision(sid, r, { decision: "suppressed" });
      continue;
    }
    if (r.plan === "withhold") {
      // B5 — nothing sent, but it IS resolved (there is nothing to retry): record + move on.
      r.action = "withheld";
      recordFindingDecision(sid, r, { decision: "withheld" });
      continue;
    }
    try {
      if (r.plan === "comment") {
        // Include the full Where block ONLY when neither the issue body NOR a prior comment already
        // carries this evidence (matched on WHERE_MARKER + content hash). So a legacy/evidence-less
        // issue gets full detail on the first comment; repeat occurrences stay a short counter.
        let includeWhere = false;
        if (r.whereMarker && !r.bodyHasWhere) {
          const inComments = await commentsCarryMarker({ repo, token, number: r.issue.number, marker: r.whereMarker, fetchImpl });
          includeWhere = !inComments;
        }
        r.includedWhere = includeWhere;
        const ok = await addComment({
          repo, token, number: r.issue.number, fetchImpl,
          body: occurrenceCommentBody({ finding: f, struct, escalatedFrom: r.escalatedFrom, includeWhere }),
        });
        r.action = ok ? "commented" : "error";
        if (ok && r.escalatedFrom) {
          r.titleUpdated = await updateIssueTitle({ repo, token, number: r.issue.number, title: findingTitleFor(f, f.verdict), fetchImpl });
        }
        recordFindingDecision(sid, r, ok ? { decision: "sent", issueNumber: r.issue.number } : { decision: "pending" });
      } else {
        const created = await createIssue({ repo, token, title: r.title, body: r.body, fetchImpl });
        r.action = "filed";
        r.issue = { number: created.number, url: created.url, state: "open", legacy: false };
        recordFindingDecision(sid, r, { decision: "sent", issueNumber: created.number });
      }
    } catch (e) {
      r.action = "error";
      r.error = String(e?.message ?? e);
      recordFindingDecision(sid, r, { decision: "pending" });
    }
  }

  // Delete the session's telemetry only when EVERY finding is resolved — a pending retry needs its
  // evidence. Nothing is deleted when nothing was delivered.
  const allResolved = results.length > 0 && results.every((r) => r.action === "filed" || r.action === "commented" || r.action === "withheld" || r.action === "suppressed");
  if (allResolved && !keep) {
    const removed = purgeSession({ dir: diagDir(), sid });
    if (removed.length) results.purged = removed;
  }
  return results;
}

function summaryLine(results) {
  const known = results.filter((r) => r.plan === "comment");
  const fresh = results.filter((r) => r.plan === "file");
  const withheld = results.filter((r) => r.plan === "withhold");
  const suppressed = results.filter((r) => r.plan === "suppressed");
  const refs = known.map((r) => `#${r.issue.number} open`); // dedup is OPEN-only (VCST-5582)
  const parts = [];
  if (refs.length) parts.push(`${refs.length} already reported (${refs.join(", ")})`);
  if (fresh.length) parts.push(`${fresh.length} new`);
  if (withheld.length) parts.push(`${withheld.length} withheld: no locatable evidence`);
  if (suppressed.length) parts.push(`${suppressed.length} suppressed by .vc-fix/expected.json`);
  return parts.length ? parts.join(", ") : "no findings";
}

export async function main(argv = process.argv.slice(2), { stdin = process.stdin, fetchImpl = fetch } = {}) {
  const args = parseArgs(argv);
  if (args.override && !ROUTES.includes(args.override)) {
    const msg = `Unknown route "${args.override}". A self-check contribution is filed as an Issue, not a code PR — valid: ${ROUTES.join(" | ")}.`;
    emit(args.json, { error: msg, route: args.override, validRoutes: ROUTES }, msg);
    process.exitCode = 2;
    return;
  }
  if (!isAllowedUpstreamRepo(args.repo)) {
    const msg = `Refusing to target "${args.repo}": self-check contributions may only go to VirtoCommerce/*.`;
    emit(args.json, { error: msg, repo: args.repo }, msg);
    process.exitCode = 2;
    return;
  }

  // --purge: clear this session's per-finding records AND its telemetry. Sends nothing.
  if (args.purge) {
    const sid = args.session || "";
    if (sid) writeFindingRecords(sid, []);
    const removed = purgeSession({ dir: diagDir(), sid });
    const out = { action: "purge", session: sid || null, removed };
    emit(args.json, out, removed.length ? `Purged ${removed.length} local artifact(s) for session ${sid || "(none given)"}.` : `Nothing to purge${sid ? ` for session ${sid}` : " — pass --session <sid>"}.`);
    return;
  }

  if (args.backfill) {
    const { token } = resolveGithubToken();
    return backfillMarkers({ repo: args.repo, token, json: args.json, fetchImpl });
  }

  const mode = feedbackMode();

  // ── assemble the struct ──
  let raw = null;
  let sid = args.session || "";
  let batchSessions = [];
  if (args.batch) {
    batchSessions = collectBatchFindings();
    raw = {
      schemaVersion: 3,
      pluginVersion: readProfileObj()?.pluginVersion ?? "unknown",
      nodeVersion: process.version,
      os: process.platform,
      findings: mergeBatchRecords(batchSessions),
      feedback: { up: 0, down: 0 },
      sessionCount: batchSessions.length || 1,
    };
  } else if (args.input) {
    // `--input <file>`: read the validated struct from a FILE instead of piped stdin. This is the
    // PREFERRED invocation (VCST-5582): the deliverer writes the struct to a scratch file and runs a
    // plain `node deliver.mjs --input <file> --confirm` — no `<json> | node …` pipe. The piped-stdin
    // form is rejected by Claude Code's auto-mode permission classifier BEFORE the script runs (a
    // pipe feeding data into an interpreter reads as arbitrary execution) and, being a pipeline, is
    // not cleanly allowlistable either. A plain non-piped command is both classifier-friendlier and
    // narrowly allowlistable via a `Bash(node …deliver.mjs …)` rule.
    try {
      raw = JSON.parse(readFileSync(resolve(args.input), "utf8"));
    } catch (e) {
      const msg = `--input: cannot read/parse ${args.input}: ${e?.message ?? e}`;
      emit(args.json, { error: msg }, msg);
      process.exitCode = 2;
      return;
    }
    if (!sid && typeof raw?.sessionId === "string") sid = raw.sessionId;
  } else {
    try {
      raw = await readStdinJson(stdin);
    } catch (e) {
      const msg = String(e?.message ?? e);
      emit(args.json, { error: msg }, msg);
      process.exitCode = 2;
      return;
    }
    if (!raw) {
      const msg = "No finding struct. Preferred: `node deliver.mjs --input <struct.json> --session <sid>` (no pipe). Piped stdin (`… | node deliver.mjs`) also works but is blocked by the auto-mode classifier.";
      emit(args.json, { error: msg }, msg);
      process.exitCode = 2;
      return;
    }
    if (!sid && typeof raw.sessionId === "string") sid = raw.sessionId;
  }

  // `sessionId` is LOCAL routing data (which state.json to touch) and is deliberately absent from
  // the validated struct, so it can never reach the outbound artifact.
  const ctx = buildProvenanceCtx(raw, { sid });
  const struct = validateUpstream(raw, ctx);

  // --assert-nonempty: offline gate — validate, judge, exit. Before any consent/token/route work so
  // it needs no network and reports on the PAYLOAD, not on this machine's ability to send it.
  if (args.assertNonEmpty) {
    const v = assertNonEmpty(struct);
    const out = { action: "assert-nonempty", session: sid || null, ok: v.ok, reason: v.reason, rows: v.rows, findings: v.findings, pluginVersion: struct.pluginVersion };
    emit(args.json, out, `${v.ok ? "OK" : "FAIL"}: ${v.reason}`);
    if (!v.ok) process.exitCode = 3;
    return;
  }

  const hasNegFeedback = struct.feedback.down > 0;
  if (!struct.findings.length && !hasNegFeedback) {
    const out = { action: "none", session: sid || null, findings: 0 };
    emit(args.json, out, "No worthwhile finding to contribute (no BROKEN/DEGRADED finding, no 👎 feedback). Nothing sent.");
    return;
  }

  if (mode === "off") {
    const out = { action: "disabled", reason: "feedback.mode=off", session: sid || null };
    emit(args.json, out,
      `Upstream delivery is disabled (feedback.mode=off). Nothing sent, nothing drafted.\n` +
      `Enable it by setting feedback.mode to "ask" or "auto" in project-profile.json.`);
    return;
  }

  const confirm = (args.confirm || mode === "auto") && !args.dry;
  const { token, via, scopes } = resolveGithubToken();
  const probe = token ? await probeWithRetry({ token, repo: args.repo, via, scopes }) : null;
  const { route, reason } = resolveRoute({ token, probe, scopes, override: args.override });

  const results = await deliverFindings({
    struct, sid, repo: args.repo, token, route, confirm, keep: args.keep, json: args.json, fetchImpl,
  });

  const plan = {
    action: args.batch ? "batch" : "deliver",
    session: sid || null,
    sessions: args.batch ? batchSessions.length : 1,
    repo: args.repo,
    tokenVia: via || null,
    perm: probe?.perm ?? null,
    route,
    reason,
    probeRetried: Boolean(probe?.retried),
    mode,
    dryRun: !confirm,
    fingerprint: fingerprintStruct(struct),
    // The struct is the DISCLOSURE surface: the orchestrator must render exactly these values (the
    // normalized vendor message included) before the operator's yes/no. If it cannot be shown, it
    // must not be sent.
    struct,
    summary: summaryLine(results),
    findings: results,
    ...(results.purged ? { purged: results.purged } : {}),
    sent: results.filter((r) => r.action === "filed" || r.action === "commented").length,
  };
  plan.nextSteps = nextStepsFor({ route, results, confirmed: confirm });

  if (args.json) {
    process.stdout.write(JSON.stringify(plan) + "\n");
    return;
  }
  const lines = [
    `Route: ${route} — ${reason}   (feedback.mode=${mode})`,
    `Repo:  ${args.repo}   Token: ${via || "none"}   Perm: ${probe?.perm ?? "n/a"}`,
    `Findings: ${plan.summary}`,
    ``,
  ];
  for (const r of results) {
    const state = r.plan === "comment"
      ? `already reported — issue #${r.issue.number} (${r.issue.url})${r.escalatedFrom ? `, severity escalated ${r.escalatedFrom} → ${r.severity}` : ""}`
      : r.plan === "withhold"
      ? `WITHHELD — no locatable evidence (no plugin file:line, no proven excerpt, no vendor error identity); not filed`
      : r.plan === "suppressed"
      ? `SUPPRESSED by .vc-fix/expected.json (${r.suppressReason}); not filed`
      : `NEW — would be filed as "${r.title}"`;
    lines.push(`• ${r.severity} ${r.key}: ${state}${r.action !== "planned" ? ` [${r.action}]` : ""}`);
    // B6 — echo the boundary validator's per-field withholds so a maintainer knows a field was
    // proposed and dropped, not simply absent.
    if (r.withheldFields?.length) lines.push(`    ↳ ${withheldLine({ withheld: r.withheldFields })}`);
  }
  lines.push(``, ...plan.nextSteps);
  process.stdout.write(lines.filter((l) => l !== undefined).join("\n") + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    process.stderr.write(`deliver error: ${e?.message ?? e}\n`);
    process.exitCode = 1;
  });
}
