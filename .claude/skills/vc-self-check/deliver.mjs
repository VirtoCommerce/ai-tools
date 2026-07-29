#!/usr/bin/env node
/**
 * skills/vc-self-check/deliver.mjs — Step 4 of the vc-fix self-diagnostics
 * subsystem (VCST-5478). Turns a confirmed local DIAG-*.md into a SCRUBBED,
 * plugin-mechanics-only quality report contributed back to
 * `VirtoCommerce/vc-mcp-testing-module` (the plugin's OWN repo), routed by the
 * GitHub token's ACTUAL rights and gated on explicit user consent.
 *
 * Mirrors `contributionPlan`, pointed at the plugin repo. Reuses
 * `../project-init/probe-lib.mjs` (`resolveGithubToken` + `probeGithubUpstream`).
 * This file is kept BYTE-IDENTICAL across the plugins/vc-fix/ (canonical) and .claude/
 * trees for the self-diagnostics subsystem: the closed-schema upstream path (PR #143 R2)
 * ships on BOTH surfaces so neither can leak. Both trees supply the sibling
 * `upstream-reduce.mjs` + `../project-init/probe-lib.mjs` (deliver no longer imports
 * `redact.mjs` — the closed schema, not scrubbing, is the upstream guard; see below).
 *
 * CONSENT (VCST-5509): outbound delivery is gated by project-profile.json
 * `feedback.mode` — off (never send, DIAG stays local) / ask (DEFAULT: DRY draft +
 * a single [Show diff]/[Send]/[Don't send] decision) / auto (Issue files
 * automatically; a PR/fork-PR is handed off as ready commands). Local capture +
 * diagnosis need no consent — only this step does.
 *
 * HARD INVARIANTS (quality-gates §2a client-code containment + per-action consent):
 *   - NEVER touches the client-installed plugin (read-only w.r.t. the install).
 *   - NEVER leaks client code/data upstream: the outbound title/body/fingerprint/comment
 *     are built SOLELY from a validated closed-vocabulary struct (`validateUpstream(reduce(...))`,
 *     enum/number only) — there is NO client-derived free text anywhere in the artifact, so
 *     there is nothing to scrub or downgrade. Leak-safety is by TYPE, not by a denylist: the
 *     LLM-authored DIAG cells and operator /vc-feedback prose never reach the struct (feedback
 *     travels as 👍/👎 counts only). See knowledge/diagnostics/upstream-schema.md + adr-upstream-default-deny.md.
 *   - DRAFT-AND-CONFIRM (mode=ask): the run is DRY (draft + show). It sends ONLY
 *     with `--confirm` (mode=auto pre-confirms), and even then auto-sends only the
 *     low-risk GitHub Issue route; a PR/fork-PR is handed off as ready commands
 *     (opening a code PR needs a working tree + a human-reviewed patch, which a
 *     telemetry script must not fabricate).
 *   - Issue dedup with OCCURRENCE COUNTING: a stable fingerprint marker converges
 *     the same defect from many clients to ONE upstream issue — a dedup hit adds a
 *     "+1 occurrence" comment instead of a new ticket.
 *
 * Usage:
 *   node deliver.mjs [--diag <path>] [--repo <owner/name>] [--as pr|fork-pr|issue|local]
 *                    [--confirm] [--keep] [--purge] [--json]
 *   (default --repo VirtoCommerce/vc-mcp-testing-module; default is a DRY draft
 *    unless feedback.mode=auto.)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveGithubToken, probeGithubUpstream, GITHUB_UPSTREAM_REMEDY } from "../project-init/probe-lib.mjs";
import { reduce, validateUpstream, fingerprintStruct, findingStructSig } from "./upstream-reduce.mjs";

const PLUGIN_REPO = "VirtoCommerce/vc-mcp-testing-module";
const ISSUE_TITLE_PREFIX = "[vc-fix self-check]";
const FP_MARKER = "vc-fix-selfcheck-fp:";

// outputRoot — where the local DIAG/DELIVERY files live. Same rule as
// skills/project-init/lib/paths.mjs `outputRoot()` (VC_FIX_HOME || cwd); inlined
// so this file stays byte-identical across trees (paths.mjs ships only in the
// plugin tree). NEVER the plugin install dir.
function outputRoot() {
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}
function diagDir() {
  return join(outputRoot(), ".vc-fix", "diagnostics");
}

// ─── consent (VCST-5509) — feedback.mode gates OUTBOUND delivery only ─────────
// Local capture + diagnosis need no consent (nothing leaves the machine). This
// script — the ONLY step that sends anything upstream — is gated by
// project-profile.json `feedback.mode`:
//   off  — nothing leaves the machine; refuse to send, DIAG stays local.
//   ask  — DEFAULT: DRY draft + a single [Show diff]/[Send]/[Don't send] decision
//          (the model shows the draft, then re-runs with --confirm on Send).
//   auto — the Issue route files automatically (scrubbed) + prints the filed URL; a PR/fork-PR
//          is prepared as ready commands (a human always opens the PR).
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

// ─── the ONE-SHOT delivery-offer guard (VCST-5582 G) ──────────────────────────
// Step 6 of the skill now OFFERS to contribute a real finding (the loop used to die in a
// local file: both paths said "do not run deliver here", so `feedback.mode: "ask"` — the
// DEFAULT — was unreachable in practice). An offer that repeats is worse than no offer, so
// it is guarded exactly like the collector's `cleanupOffered`: at most ONE per session, and
// deduped by the finding FINGERPRINT so the same defect never re-asks after a redraft.
//
// The guard lives in the collector's own `<sid>.state.json` (the same file `cleanupOffered`
// uses) — no new artifact, and it disappears with the session. Capture off / no state file ⇒
// no guard is available and `alreadyOffered` is false: the skill's own once-per-turn logic
// is then the only limit, which is the correct degraded behaviour (never a silent double-ask
// loop, because the DRY run below is what the skill gates on).
function statePathFor(sid) {
  return sid ? join(diagDir(), `${sid}.state.json`) : "";
}
export function readOfferGuard(sid, fp) {
  const p = statePathFor(sid);
  if (!p || !existsSync(p)) return { available: false, alreadyOffered: false };
  try {
    const st = JSON.parse(readFileSync(p, "utf8"));
    const list = Array.isArray(st.deliveryOffered) ? st.deliveryOffered : [];
    return { available: true, alreadyOffered: list.includes(fp) };
  } catch {
    return { available: false, alreadyOffered: false };
  }
}
export function markOffered(sid, fp) {
  const p = statePathFor(sid);
  if (!p || !existsSync(p) || !fp) return false;
  try {
    const st = JSON.parse(readFileSync(p, "utf8"));
    const list = Array.isArray(st.deliveryOffered) ? st.deliveryOffered : [];
    if (list.includes(fp)) return false;
    list.push(fp);
    st.deliveryOffered = list;
    writeFileSync(p, JSON.stringify(st), "utf8");
    return true;
  } catch {
    return false; // never throw — a guard failure must not break the delivery path
  }
}

// Read the session's STRUCTURED collector records — the ONLY source for the upstream struct
// (VCST default-deny redesign). Returns the raw span records, feedback verdicts, the finalize
// roll-up, and the pluginVersion from session_start. reduce() consumes only these enum/number
// records; the LLM-authored DIAG free text never enters the upstream path. Never throws — a
// missing/unreadable jsonl yields an empty set (deliver then falls back to parseDiag's
// enum-only fields).
export function readSessionRecords(sid) {
  const out = { spans: [], obs: [], feedback: [], finalize: null, pluginVersion: "unknown" };
  if (!sid) return out;
  try {
    const p = join(diagDir(), `${sid}.jsonl`);
    if (!existsSync(p)) return out;
    for (const line of readFileSync(p, "utf8").trim().split("\n")) {
      if (!line) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (!r || typeof r !== "object") continue;
      if (r.type === "span") out.spans.push(r);
      // `obs` records are the other half of the VCST-5582 H analysis set. They were appended by
      // the collector from the start but surfaced to NOBODY on the upstream path — see
      // upstream-reduce's `foldObservations`.
      else if (r.type === "obs") out.obs.push(r);
      else if (r.type === "feedback") out.feedback.push({ verdict: r.verdict, text: r.text || "" });
      else if (r.type === "finalize") out.finalize = r;
      else if (r.type === "session_start" && typeof r.pluginVersion === "string") out.pluginVersion = r.pluginVersion;
    }
  } catch {
    /* ignore — degraded fallback handled by the caller */
  }
  return out;
}

/** Assemble the reducer input for a session from its DIAG (fallback enums + version) + jsonl. */
function sessionLocal(md, sid) {
  const parsed = parseDiag(md);
  const records = readSessionRecords(sid);
  return {
    local: {
      spans: records.spans,
      obs: records.obs,
      feedback: records.feedback,
      pluginVersion: records.pluginVersion !== "unknown" ? records.pluginVersion : parsed.pluginVersion,
      // Drop parseDiag's synthetic "(session)" placeholder row (emitted when a DIAG has no
      // parseable findings table) — it would otherwise become a low-fidelity spurious upstream
      // finding on the jsonl-purged path (adversarial review #2). Real rows are kept.
      fallbackFindings: parsed.findings.filter((f) => f.skill !== "(session)"),
      sessionCount: 1,
    },
    parsed,
  };
}

/** Merge per-session structs: dedup findings by structural signature (occurrence-count them),
 *  sum feedback counts, keep the newest known pluginVersion. Used by --batch. Exported for tests. */
export function mergeStructs(structs, pluginVersion) {
  const byKey = new Map();
  let up = 0;
  let down = 0;
  for (const s of structs) {
    up += s.feedback.up;
    down += s.feedback.down;
    for (const f of s.findings) {
      const k = findingStructSig(f);
      const e = byKey.get(k);
      if (e) e.occurrences += f.occurrences;
      else byKey.set(k, { ...f });
    }
  }
  return validateUpstream({
    schemaVersion: 1,
    pluginVersion: pluginVersion || "unknown",
    findings: [...byKey.values()],
    feedback: { up, down },
    sessionCount: structs.length,
  });
}

// ─── DIAG parsing ────────────────────────────────────────────────────────────
/**
 * Strip inline-markdown emphasis from a value captured out of the DIAG header.
 *
 * The DIAG template renders header values as inline CODE — `- Session: \`<sid>\` · Plugin:
 * \`0.8.2\` · …` — but both header regexes captured with `[^\s·|]+`, which happily swallows the
 * BACKTICKS. That one omission is what made the delivered report information-free on a real
 * client run: the session id came back as `` `1cedb591-…` ``, so `readSessionRecords` looked for
 * a `` `<sid>`.jsonl `` that does not exist, found no spans and no observations, and the reducer
 * had nothing structured left to work from; the plugin version came back as `` `0.8.2` ``, which
 * `validPluginVersion` correctly refused and turned into `unknown` — while the exact value sat in
 * the session's own `session_start` record.
 *
 * Stripping (rather than excluding the characters in the character class) is deliberate: an
 * excluded backtick makes the whole match FAIL, because `\s*` cannot consume it — which would
 * trade a corrupted capture for no capture at all. Neither a UUID nor a numeric version can
 * legitimately contain any of these three characters, so removing them is lossless here.
 */
export function stripInlineMd(s) {
  return String(s ?? "").replace(/[`*_]/g, "").trim();
}

/**
 * Best-effort parse of a DIAG-*.md into { pluginVersion, findings[] }. Each
 * finding: { skill, verdict, sev, signal, rootcause, fix }. Split-based so it
 * handles the canonical 6-column findings table (Skill | Verdict | Sev | Signal |
 * Root-cause | Proposed fix) AND a 5-column variant — the LAST cell is always the
 * proposed fix. Falls back to a single generic finding if no table row is found.
 */
export function parseDiag(md) {
  const text = String(md ?? "");
  const verMatch = /Plugin:\s*([^\s·|]+)/i.exec(text) || /pluginVersion["\s:]+([\d.]+)/i.exec(text);
  const pluginVersion = verMatch ? stripInlineMd(verMatch[1]) || "unknown" : "unknown";
  const findings = [];
  for (const line of text.split("\n")) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split("|").map((c) => c.trim());
    // drop the empty edges from leading/trailing pipes
    if (cells.length && cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 4) continue;
    const [skillCell, verdict, sev] = cells;
    if (!/^(OK|DEGRADED|BROKEN)$/.test(verdict) || !/^S[0-3]$/.test(sev)) continue; // skip header/separator
    // Normalize the Skill cell to the bare enum name. The DIAG table renders it as
    // `/qa-fix (command)` / `/qa-bug (skill)`, but SKILLS holds bare names (`qa-fix`), so
    // without this the jsonl-purged fallback path (reduce's fallbackFindings) always coerced
    // skill → "other" — per-skill fidelity silently lost in exactly the case the fallback
    // exists for (PR #143 review round 2, Finding 3). Unknown names still fall through to
    // "other" via inSet in reduce/validateUpstream, so the fail-safe direction is preserved.
    const skill = skillCell.replace(/^\//, "").replace(/\s*\((?:command|skill|agent)\)\s*$/i, "").trim();
    const signal = cells[3] ?? "";
    // 4-col table has no separate fix cell (cells[3] is the last) — don't alias the
    // signal as the fix. fix only exists at ≥5 cols; root-cause only at ≥6.
    const fix = cells.length >= 5 ? (cells[cells.length - 1] ?? "") : "";
    const rootcause = cells.length >= 6 ? cells[4] : "";
    findings.push({ skill, verdict, sev, signal, rootcause, fix });
  }
  if (findings.length === 0) findings.push({ skill: "(session)", verdict: "DEGRADED", sev: "S2", signal: "see DIAG", rootcause: "", fix: "" });
  return { pluginVersion, findings };
}

// ─── route resolution ────────────────────────────────────────────────────────
/**
 * Decide the delivery route from the probed permission on the plugin repo.
 *   pr       — push/maintain/admin → branch + PR (handed off; not auto-sent)
 *   fork-pr  — authenticated, no push, PROVEN fork-capable → fork-PR (handed off)
 *   issue    — authenticated, cannot fork (or capability unreadable) → GitHub Issue (auto-sendable)
 *   local    — no token / auth failed / nothing upstream is possible → local report + remedy
 *
 * NO OPTIMISTIC DEFAULT (VCST-5582 A). This used to read
 *   `canFork = !scopesKnown || /(repo|public_repo)/.test(scopes)`
 * while `resolveGithubToken()` leaves `scopes` EMPTY for every PAT — so `scopesKnown` was always
 * false for a PAT, `canFork` always true, and the route was ALWAYS `fork-pr`, including for a
 * fine-grained token that GitHub structurally forbids from forking a repo it does not own ("Only
 * personal access tokens (classic) have write access for public repositories that are not owned by
 * you…"). The capability is now a PROBED tri-state (`probe.forkCapable`, from
 * probe-lib.classifyGithubTokenKind) and only an explicit "yes" earns the fork path; "unknown" and
 * "no" fall to the least-privileged route, carrying the remedy text so the operator sees WHY.
 */
export function resolveRoute({ token, probe, scopes, override }) {
  if (override) return { route: override, reason: "operator override (--as)" };
  if (!token) return { route: "local", reason: "no GitHub token or gh session" };
  if (!probe || !probe.ok) return { route: "local", reason: "token present but GitHub authentication failed" };
  const perm = probe.perm;
  if (["push", "maintain", "admin"].includes(perm)) return { route: "pr", reason: `push access (${perm})` };

  // Prefer the PROBED capability. Fall back to the raw scope string only for a probe from an older
  // shape (no `forkCapable` field) — and there too, UNREADABLE scopes are "unknown", never "yes".
  const kind = probe.tokenKind || "";
  const scopeList = String(scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const forkCapable = probe.forkCapable
    || (scopeList.length ? (scopeList.some((s) => /^(repo|public_repo)$/i.test(s)) ? "yes" : "no") : "unknown");
  const remedy = probe.remedy || GITHUB_UPSTREAM_REMEDY;

  if (forkCapable === "yes") {
    return { route: "fork-pr", reason: `authenticated as ${probe.login || "user"} without push, fork-capable — fork-PR` };
  }
  // A CLASSIC/session token whose scopes we DID read and which carries neither `repo` nor
  // `public_repo` cannot fork AND cannot create an issue on a public repo either — nothing
  // upstream is possible, so stay local and tell the operator exactly what to grant.
  if (forkCapable === "no" && kind !== "fine-grained") {
    return { route: "local", reason: `authenticated but the token has no upstream rights (no repo/public_repo scope) — ${remedy}` };
  }
  // Fine-grained (or a capability we could not read): the fork path is out. An Issue is the
  // least-privileged upstream action, so try that instead of a route we know will 403. A
  // fine-grained token may still be refused here — if it is, the reason carries the fix.
  const why = kind === "fine-grained"
    ? "fine-grained token cannot fork or open a fork-PR upstream"
    : "fork capability could not be confirmed for this token";
  return { route: "issue", reason: `${why} — filing an Issue instead (least-privileged upstream route). If GitHub refuses it: ${remedy}` };
}

// ─── fingerprint / dedup ─────────────────────────────────────────────────────
// The fingerprint is computed over the STRUCTURED upstream tuple via `fingerprintStruct`
// (upstream-reduce.mjs) — enum fields + feedback COUNTS only, never raw/LLM text — so dedup
// can no longer smuggle client bytes into the hash, and a feedback-only struct still yields a
// distinct fingerprint (up/down counts differ). The old text-derived `fingerprint`/`findingSig`
// were removed together with the free-text upstream path.

/** List open self-check issues on the repo and return one whose body carries `fp`, else null. */
export async function findDuplicateIssue({ repo, token, fp }) {
  if (!token) return null;
  const marker = `${FP_MARKER} ${fp}`;
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "vc-self-check", Accept: "application/vnd.github+json" };
  const hit = (it) => it && !it.pull_request && (it.body || "").includes(marker); // exact-marker confirm
  // Primary: the Search API targets the fingerprint DIRECTLY, so dedup works no matter how many
  // open issues the repo has. The old first-100 `GET /issues` scan silently broke once the repo had
  // ≥100 open issues (ordinary dev issues crowd out the window) and `auto` mode then re-filed a
  // DUPLICATE instead of a +1 comment (PR #143 R2 DED1). Search tokenizes, so its hit is a candidate
  // that we still body-confirm via `hit()`.
  //
  // `is:open` only (code review #4): match OPEN issues exclusively, consistent with the `state=open`
  // fallback below. A defect a maintainer already CLOSED (fixed upstream) that then recurs on a
  // not-yet-upgraded client is a NEW open signal — it must surface as a fresh issue, NOT get buried
  // as a "+1 occurrence" comment on the closed one (after which `deliver` would purge the local
  // artifacts and lose the recurrence). Search and fallback now agree on state, so the result no
  // longer depends on whether Search happens to be indexed/rate-limited.
  try {
    const q = encodeURIComponent(`repo:${repo} is:issue is:open "${marker}"`);
    const r = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=20`, { headers });
    if (r.ok) {
      const j = await r.json();
      for (const it of Array.isArray(j.items) ? j.items : []) if (hit(it)) return { number: it.number, url: it.html_url };
    }
  } catch {
    /* search unavailable / rate-limited — fall through to the list scan */
  }
  // Fallback: first page of open issues — catches a very-recently-filed dup not yet search-indexed,
  // and the whole dedup when Search is rate-limited. Best-effort; any failure ⇒ "no known dup".
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers });
    if (!r.ok) return null;
    for (const it of await r.json()) if (hit(it)) return { number: it.number, url: it.html_url };
  } catch {
    /* network — treat as no known dup */
  }
  return null;
}

// ─── draft assembly ──────────────────────────────────────────────────────────
/**
 * Build the outbound draft PURELY from a validated `UpstreamSignal` struct
 * (upstream-reduce.mjs). Every rendered value is a closed-vocabulary enum or a number —
 * there is NO client-derived free text anywhere in the body, so no text scrubber guards
 * this path: the closed schema (validateUpstream, enum-only) is the SOLE guard, and it
 * makes a leak impossible by TYPE. The old free-text client-shape scrubbers
 * (`scrubText`/`isClientSpecific`/`containsClientShape`) were removed as dead code once the
 * upstream artifact stopped carrying any free text (PR #143 review round 2, Finding 1);
 * `redact()` still lives in the COLLECTOR (hooks/redact.mjs) for the local persist path.
 * The whole body is safe by construction (default-deny closed schema; see
 * knowledge/diagnostics/upstream-schema.md + adr-upstream-default-deny.md).
 */
export function buildDraft({ struct, route }) {
  const s = validateUpstream(struct); // idempotent re-check at the boundary (belt-and-suspenders)
  const fp = fingerprintStruct(s);
  const rows = s.findings.map((f) => {
    const occ = f.occurrences > 1 ? ` _(×${f.occurrences} sessions)_` : "";
    const struggle = f.struggle.length ? f.struggle.join(",") : "—";
    return `| ${f.skill} | ${f.verdict} | ${f.severity} | ${f.outcome} | ${f.signalClass} | ${f.errorCode} | ${struggle} | ${f.toolFamily} | ${f.repoKind}${occ} |`;
  });
  const skills = [...new Set(s.findings.map((f) => `${f.skill} ${f.verdict}`))].slice(0, 3).join(", ");
  const fbMark = s.feedback.down > 0 ? "👎" : s.feedback.up > 0 ? "👍" : "";
  const hasFb = s.feedback.up + s.feedback.down > 0;
  // Title never says a bare "OK": a feedback-only report reflects the operator verdict (D2).
  const title = `${ISSUE_TITLE_PREFIX} ${skills || (hasFb ? `operator feedback ${fbMark}`.trim() : "no findings")}`;

  const body = [
    `<!-- ${FP_MARKER} ${fp} -->`,
    `Automated quality report from the vc-fix self-diagnostics subsystem (\`/vc-self-check\`).`,
    `Plugin version: ${s.pluginVersion}. Sessions: ${s.sessionCount}. Generated from local session telemetry.`,
    ...(rows.length
      ? [``, `## Findings`, `| Skill | Verdict | Sev | Outcome | Signal | Error | Struggle | Tool | Repo |`, `|-------|---------|-----|---------|--------|-------|----------|------|------|`, ...rows]
      : []),
    // Operator /vc-feedback: COUNTS ONLY. The free-form note never leaves the machine — it
    // is not read into the struct (upstream-reduce reads only the `verdict`), so there is
    // no prose to include here (default-deny closed schema).
    ...(hasFb ? [``, `## Operator feedback`, `👍 ${s.feedback.up} · 👎 ${s.feedback.down}`] : []),
    ``,
    `## Containment`,
    `This report is built ONLY from a closed, plugin-authored vocabulary of enum/number fields`,
    `(see \`knowledge/diagnostics/upstream-schema.md\`). It carries NO free text, NO file paths,`,
    `NO identifiers, NO client source, and NO secrets — safe by construction, not by scrubbing`,
    `(quality-gates §2a; ADR \`adr-upstream-default-deny.md\`).`,
    ``,
    // The dedup fingerprint ALSO appears as a VISIBLE line, not only in the HTML comment above:
    // GitHub's issue Search does not reliably index `<!-- … -->` text, so a comment-only marker made
    // `findDuplicateIssue`'s Search branch always miss and silently degrade to the first-100-issues
    // fallback scan — the exact DED1 failure the Search path was added to fix, re-filing a new issue
    // every session once the repo has ≥100 open issues (code review suggestion #1). The `hit()`
    // body-confirm still matches this line, so dedup is exact either way.
    `<sub>${FP_MARKER} ${fp}</sub>`,
  ].join("\n");
  return { title, body, route, fingerprint: fp };
}

// ─── send (issue only, gated) ────────────────────────────────────────────────
async function createIssue({ repo, token, title, body }) {
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "vc-self-check", Accept: "application/vnd.github+json" },
    body: JSON.stringify({ title, body }),
  });
  if (!r.ok) throw new Error(`GitHub issue create failed: ${r.status} ${await r.text().catch(() => "")}`);
  const j = await r.json();
  return { number: j.number, url: j.html_url };
}

// Dedup with occurrence-counting: the SAME defect fingerprinted from many clients must
// converge to ONE upstream ticket, not spawn hundreds. On a dedup hit we post a "+1
// occurrence" comment instead of a new issue — the vendor sees how many clients hit it.
async function addOccurrenceComment({ repo, token, number, fp }) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues/${number}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "vc-self-check", Accept: "application/vnd.github+json" },
      body: JSON.stringify({ body: `+1 occurrence — another vc-fix client hit the same finding (fingerprint \`${fp}\`).` }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function prHandoffCommands({ repo, route, fp }) {
  const branch = `vc-fix/self-check-${fp}`;
  const head = route === "fork-pr" ? "<your-fork-owner>:" + branch : branch;
  return [
    `# ${route === "fork-pr" ? "Fork-PR" : "PR"} hand-off — run from a fresh checkout of ${repo}`,
    `#   (a code PR needs a working tree + a human-reviewed patch — not fabricated here)`,
    `git switch -c ${branch}`,
    `#   … apply the proposed plugin-file change(s) from the draft above …`,
    `git commit -am "fix(vc-fix): <self-check finding>"`,
    route === "fork-pr" ? `git push <your-fork-remote> ${branch}` : `git push origin ${branch}`,
    `gh pr create --repo ${repo} --head ${head} --title "<title from draft>" --body-file <scrubbed-body>`,
  ].join("\n");
}

// ─── the information-free-payload guard (--assert-nonempty) ──────────────────
/**
 * Would this contribution carry any information at all?
 *
 * The incident this guard exists for produced a syntactically perfect, fully contained,
 * completely useless report: every column reduced to `other` / `none` / `UNKNOWN` / `unknown`,
 * so an S1 blocker and an S2 gap were indistinguishable from each other and from noise. Nothing
 * detected it — the containment tests all passed (they assert what must NOT be present), the
 * schema validated, and the draft looked well-formed. A report can be perfectly safe and still
 * say nothing, and only a human reading the rendered table happened to notice.
 *
 * The premise: a DIAG whose findings table carries ≥1 BROKEN/DEGRADED row is a report with
 * something to say, so the reduced struct MUST retain at least one identifying dimension. Both
 * degenerate shapes fail:
 *   - findings present but every one is `skill:other` + `signalClass:none` + `errorCode:UNKNOWN`
 *   - no findings at all (vacuously "all degenerate", and strictly worse)
 * Pure + offline + deterministic, so it is usable as a CI gate and as a test oracle.
 */
export function assertNonEmpty({ struct, parsed }) {
  const rows = (parsed?.findings ?? []).filter((f) => f.verdict === "BROKEN" || f.verdict === "DEGRADED");
  const degenerate = (f) => f.skill === "other" && f.signalClass === "none" && f.errorCode === "UNKNOWN";
  const findings = struct?.findings ?? [];
  if (!rows.length) {
    return { ok: true, reason: "no BROKEN/DEGRADED row in the DIAG — nothing is expected upstream", diagRows: rows.length, findings: findings.length };
  }
  if (!findings.length) {
    return { ok: false, reason: `the DIAG has ${rows.length} BROKEN/DEGRADED row(s) but the reduced struct has NO findings — the contribution would carry no signal`, diagRows: rows.length, findings: 0 };
  }
  const informative = findings.filter((f) => !degenerate(f));
  if (!informative.length) {
    return {
      ok: false,
      reason: `all ${findings.length} reduced finding(s) are skill:other + signalClass:none + errorCode:UNKNOWN — the contribution would name neither the skill nor the failure`,
      diagRows: rows.length,
      findings: findings.length,
    };
  }
  return { ok: true, reason: `${informative.length}/${findings.length} finding(s) carry an identifying dimension`, diagRows: rows.length, findings: findings.length };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { repo: PLUGIN_REPO, confirm: false, json: false, purge: false, keep: false, dry: false, assertNonEmpty: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--confirm" || t === "--send") a.confirm = true;
    else if (t === "--json") a.json = true;
    // --dry: NEVER send, whatever the consent mode says. Makes the draft path explicitly
    // requestable (previously only reachable by NOT passing --confirm, which `feedback.mode:auto`
    // silently overrode).
    else if (t === "--dry") a.dry = true;
    // --assert-nonempty: the regression gate. Implies --dry and needs no network — it reduces
    // the DIAG and exits non-zero if the payload would carry no signal.
    else if (t === "--assert-nonempty") { a.assertNonEmpty = true; a.dry = true; }
    else if (t === "--diag") a.diag = argv[++i];
    else if (t === "--repo") a.repo = argv[++i];
    else if (t === "--as") a.override = argv[++i];
    // --purge: standalone cleanup of the processed session's local artifacts (no delivery).
    // --keep:  after a successful delivery, do NOT auto-purge (retain the local artifacts).
    else if (t === "--purge") a.purge = true;
    else if (t === "--keep") a.keep = true;
    // --batch: aggregate ALL local DIAG-*.md into ONE consolidated report (findings
    // deduped across sessions with occurrence counts). See mainBatch().
    else if (t === "--batch") a.batch = true;
  }
  return a;
}

/** All local DIAG-*.md paths, newest first. */
function listDiags() {
  const dir = diagDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^DIAG-.*\.md$/.test(f))
    .map((f) => ({ p: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t)
    .map((x) => x.p);
}
function newestDiag() {
  return listDiags()[0] || null;
}

/** The diagnosed session id — from the DIAG header (`- Session: <sid> · …`), else the
 *  `DIAG-<sid>-<UTC-timestamp>.md` filename with the trailing timestamp stripped. "" if
 *  neither yields one (then only the explicit diag/delivery files are purged, by-name).
 *
 *  Two stamp spellings are accepted because the skill actually writes BOTH: the compact
 *  `20260727T065857Z` this regex was written for, and the hyphenated ISO form the template's
 *  own `<UTC-timestamp>` produces — `2026-07-29T11-55-12Z`, and with milliseconds
 *  `2026-07-27T07-32-47-649Z`. Only the compact form was matched, so on every hyphenated DIAG
 *  the filename fallback silently returned "" — systemic, not a one-off: both DIAGs on the
 *  reproduction machine are hyphenated. */
const DIAG_STAMP = String.raw`(?:\d{8}T\d{6}Z|\d{4}-\d{2}-\d{2}T[\d-]+Z)`;
export function sessionIdFromDiag(md, diagPath) {
  const m = /(?:^|\n)\s*[-*]?\s*Session:\s*([^\s·|]+)/i.exec(md || "");
  if (m && m[1]) {
    const sid = stripInlineMd(m[1]);
    if (sid) return sid;
  }
  const base = String(diagPath || "").split(/[\\/]/).pop() || "";
  const fm = new RegExp(String.raw`^DIAG-(.+?)-${DIAG_STAMP}\.md$`).exec(base);
  return fm ? fm[1] : "";
}

/**
 * Delete ONLY the processed session's local diagnostics artifacts — the collector's
 * `<sid>.jsonl` + `<sid>.state.json`, its `DIAG-<sid>-*.md`, and this finding's
 * `DELIVERY-<fp>-*.md` drafts — plus any explicit `extra` paths (the exact DIAG +
 * DELIVERY handled this run). Other sessions' files are left untouched (concept:
 * "delete the processed session after it's been delivered"). Best-effort per file;
 * never throws. Returns the basenames removed.
 */
export function purgeSession({ dir, sid, fp, extra = [] }) {
  const removed = [];
  const rm = (p) => { try { if (existsSync(p)) { unlinkSync(p); removed.push(String(p).split(/[\\/]/).pop()); } } catch { /* ignore */ } };
  const sidSafe = sid && sid.length >= 6 ? sid : null;
  if (existsSync(dir)) {
    let names = [];
    try { names = readdirSync(dir); } catch { names = []; }
    for (const f of names) {
      const match =
        (sidSafe && (f === `${sid}.jsonl` || f === `${sid}.state.json` || f.startsWith(`DIAG-${sid}-`))) ||
        (fp && f.startsWith(`DELIVERY-${fp}-`));
      if (match) rm(join(dir, f));
    }
  }
  for (const p of extra) if (p) rm(p);
  return [...new Set(removed)];
}

/**
 * --batch: aggregate ALL local DIAG-*.md into ONE consolidated contribution. Findings
 * are deduped ACROSS sessions by their per-finding signature and annotated with an
 * occurrence count (how many local sessions hit each); operator feedback is merged
 * (dedup identical notes). Same consent (feedback.mode) + route + scrub + upstream
 * dedup as a single run. On a successful send, EVERY included session's local
 * artifacts are purged (the batch's delete-after-deliver). This keeps many accumulated
 * flagged sessions from spamming the tracker with one issue each.
 */
async function mainBatch(args) {
  const diags = listDiags();
  if (!diags.length) {
    const msg = "No DIAG reports found to batch. Run /vc-self-check first.";
    if (args.json) process.stdout.write(JSON.stringify({ action: "batch", error: msg }) + "\n");
    else process.stderr.write(msg + "\n");
    process.exitCode = 2;
    return;
  }

  // Collect every DIAG's session records, reduce each to a closed-schema struct, then merge
  // (findings deduped ACROSS sessions by their STRUCTURAL signature + occurrence-counted;
  // feedback counts summed). The upstream contribution is built ONLY from the merged struct.
  // `diags` is newest-first (listDiags sorts by mtime desc). Keep EVERY DIAG file in `sessions`
  // for purge, but reduce a struct only ONCE per session id: two DIAG-<sid>-*.md for the same
  // session both read the same <sid>.jsonl, so counting both double-inflates occurrences /
  // feedback / sessionCount (adversarial review #2, break 5a). Dedup the struct by sid; the
  // first (newest) DIAG of a sid wins, which also yields the NEWEST pluginVersion.
  const sessions = []; // { sid, diagPath } — every file, for purge
  const structs = [];
  const seenSids = new Set();
  let pluginVersion = "unknown";
  for (const diagPath of diags) {
    let md;
    try { md = readFileSync(diagPath, "utf8"); } catch { continue; }
    const sid = sessionIdFromDiag(md, diagPath);
    sessions.push({ sid, diagPath });
    // A session with no resolvable sid ("") can't be deduped by id — treat each such DIAG as its
    // own struct (rare; sessionIdFromDiag failed both header + filename).
    if (sid && seenSids.has(sid)) continue;
    if (sid) seenSids.add(sid);
    const { local, parsed } = sessionLocal(md, sid);
    if (pluginVersion === "unknown" && parsed.pluginVersion && parsed.pluginVersion !== "unknown") pluginVersion = parsed.pluginVersion;
    structs.push(validateUpstream(reduce(local)));
  }
  const dir = diagDir();
  const struct = mergeStructs(structs, pluginVersion);
  const findings = struct.findings; // for count reporting
  const hasNeg = struct.feedback.down > 0;
  const fp = fingerprintStruct(struct);

  // --batch --purge: standalone cleanup of ALL local sessions, send nothing.
  if (args.purge) {
    const removed = [];
    for (const s of sessions) removed.push(...purgeSession({ dir, sid: s.sid, fp, extra: [s.diagPath] }));
    if (args.json) process.stdout.write(JSON.stringify({ action: "batch-purge", sessions: sessions.length, removed }) + "\n");
    else process.stdout.write(`Purged ${removed.length} local artifact(s) across ${sessions.length} session(s).\n`);
    return;
  }

  if (!findings.length && !hasNeg) {
    if (args.json) process.stdout.write(JSON.stringify({ action: "batch", sessions: sessions.length, findings: 0, actionable: 0 }) + "\n");
    else process.stdout.write(`Batched ${sessions.length} session(s): no BROKEN/DEGRADED finding and no 👎 feedback. Nothing to send.\n  Clean up with: node "$pluginRoot/skills/vc-self-check/deliver.mjs" --batch --purge\n`);
    return;
  }

  const mode = feedbackMode();
  if (mode === "off") {
    if (args.json) process.stdout.write(JSON.stringify({ action: "batch", disabled: true, reason: "feedback.mode=off" }) + "\n");
    else process.stdout.write(`Upstream delivery is disabled (feedback.mode=off). ${sessions.length} session(s) stay local — nothing sent.\n`);
    return;
  }
  const confirm = (args.confirm || mode === "auto") && !args.dry;

  const { token, via, scopes } = resolveGithubToken();
  const probe = token ? await probeGithubUpstream({ token, repo: args.repo, via, scopes }) : null;
  const { route, reason } = resolveRoute({ token, probe, scopes, override: args.override });
  const draft = buildDraft({ struct, route });
  const dup = route === "issue" || route === "local" ? await findDuplicateIssue({ repo: args.repo, token, fp }) : null;

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deliveryPath = join(dir, `DELIVERY-${fp}-${stamp}.md`);
  writeFileSync(deliveryPath, `# ${draft.title}\n\n${draft.body}\n`, "utf8");

  const purgeAll = () => {
    const removed = [];
    for (const s of sessions) removed.push(...purgeSession({ dir, sid: s.sid, fp, extra: [s.diagPath] }));
    try { if (existsSync(deliveryPath)) { unlinkSync(deliveryPath); removed.push(deliveryPath.split(/[\\/]/).pop()); } } catch { /* ignore */ }
    return [...new Set(removed)];
  };
  const plan = { action: "batch", sessions: sessions.length, findings: findings.length, repo: args.repo, tokenVia: via || null, perm: probe?.perm ?? null, route, reason, fingerprint: fp, duplicate: dup, deliveryDraft: deliveryPath, mode, sent: false };

  if (!confirm) {
    plan.dryRun = true;
    if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
    else process.stdout.write(
      [
        `Batched ${sessions.length} session(s) → ${findings.length} unique finding(s).`,
        `Route: ${route} — ${reason}   (feedback.mode=${mode})`,
        dup ? `Dedup: matches open issue #${dup.number} — would add "+1 occurrence"` : `Dedup: none`,
        `Draft written (closed-schema, enums only): ${deliveryPath}`,
        `--- draft ---\n# ${draft.title}\n\n${draft.body}\n-------------`,
        route === "issue" ? `Re-run with --batch --confirm to file (then all ${sessions.length} sessions are purged; --keep to retain).`
          : route === "local" ? `No token/rights → local only. Authenticate to deliver.`
          : `A ${route} is handed off — re-run with --batch --confirm for the ready commands.`,
      ].join("\n") + "\n"
    );
    return;
  }

  if (route === "issue") {
    if (dup) {
      plan.skipped = `duplicate of #${dup.number}`;
      plan.occurrenceComment = await addOccurrenceComment({ repo: args.repo, token, number: dup.number, fp });
      // Purge only if the +1 occurrence comment actually posted — else keep the artifacts for a retry
      // so a transient failure doesn't silently drop the occurrence across every batched session (code review #3).
      if (!args.keep && plan.occurrenceComment) plan.purged = purgeAll();
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(
        (plan.occurrenceComment ? `Batch duplicate of #${dup.number} — added +1 occurrence.` : `Batch duplicate of #${dup.number} — could not add occurrence comment (kept local artifacts for retry).`) +
        (plan.purged?.length ? ` Purged ${plan.purged.length} artifact(s) across ${sessions.length} session(s).` : ``) + `\n`);
      return;
    }
    try {
      const created = await createIssue({ repo: args.repo, token, title: draft.title, body: draft.body });
      plan.sent = true; plan.issue = created;
      if (!args.keep) plan.purged = purgeAll();
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(`Filed batch Issue #${created.number}: ${created.url}` + (plan.purged?.length ? ` — purged ${plan.purged.length} artifact(s) across ${sessions.length} session(s).` : ``) + `\n`);
    } catch (e) {
      plan.error = String(e?.message ?? e);
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stderr.write(plan.error + "\n");
      process.exitCode = 1;
    }
    return;
  }

  if (route === "pr" || route === "fork-pr") {
    plan.handoff = true;
    if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
    else process.stdout.write(
      `${route} is NOT auto-created. Scrubbed batch draft: ${deliveryPath}\n\n${prHandoffCommands({ repo: args.repo, route, fp })}\n\n` +
        `Once the PR is open, clear all batched sessions:\n  node "$pluginRoot/skills/vc-self-check/deliver.mjs" --batch --purge\n`
    );
    return;
  }

  if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
  else process.stdout.write(`No token/rights → local batch report only: ${deliveryPath}\n`);
}

/** The self-check contribution may ONLY ever target the VirtoCommerce platform org. This is a
 *  destination allowlist (defense-in-depth): the closed-schema body carries no client bytes, but a
 *  `--repo` override must not misroute an issue/comment to an arbitrary token-writable repo
 *  (adversarial review #4, A3). Not a client repo, not a personal fork target — VirtoCommerce/* only. */
export function isAllowedUpstreamRepo(repo) {
  const r = String(repo ?? "");
  // Reject any `..`/leading-dot path-traversal in the repo segment: `[\w.-]+` alone admitted
  // `VirtoCommerce/..` and `VirtoCommerce/.` (harmless 404s today, but a needless soft spot in a
  // destination allowlist — security review). Require an alphanumeric first char and no `..`.
  if (r.includes("..")) return false;
  return /^VirtoCommerce\/[A-Za-z0-9][\w.-]*$/i.test(r);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!isAllowedUpstreamRepo(args.repo)) {
    const msg = `Refusing to target "${args.repo}": self-check contributions may only go to VirtoCommerce/*.`;
    if (args.json) process.stdout.write(JSON.stringify({ error: msg, repo: args.repo }) + "\n");
    else process.stderr.write(msg + "\n");
    process.exitCode = 2;
    return;
  }
  if (args.batch) return mainBatch(args);
  const diagPath = args.diag ? resolve(args.diag) : newestDiag();
  if (!diagPath || !existsSync(diagPath)) {
    const msg = "No DIAG report found. Run /vc-self-check first to produce a local DIAG-*.md.";
    if (args.json) process.stdout.write(JSON.stringify({ error: msg }) + "\n");
    else process.stderr.write(msg + "\n");
    process.exitCode = 2;
    return;
  }

  const md = readFileSync(diagPath, "utf8");
  const sid = sessionIdFromDiag(md, diagPath);
  const { local, parsed } = sessionLocal(md, sid);
  const struct = validateUpstream(reduce(local)); // closed-schema, enums only — the ONLY upstream source

  // --assert-nonempty: offline regression gate — reduce, judge, exit. Deliberately BEFORE the
  // consent/token/route machinery so it needs no network and no profile, and so it reports on the
  // payload itself rather than on whether this machine happens to be able to send it.
  if (args.assertNonEmpty) {
    const verdict = assertNonEmpty({ struct, parsed });
    const out = { action: "assert-nonempty", diag: diagPath, session: sid || null, ok: verdict.ok, reason: verdict.reason, diagRows: verdict.diagRows, findings: verdict.findings, pluginVersion: struct.pluginVersion };
    if (args.json) process.stdout.write(JSON.stringify(out) + "\n");
    else process.stdout.write(`${verdict.ok ? "OK" : "FAIL"}: ${verdict.reason}\n`);
    if (!verdict.ok) process.exitCode = 3;
    return;
  }

  const mode = feedbackMode(); // off | ask | auto (delivery consent — VCST-5509)
  const fp = fingerprintStruct(struct); // over the structural tuple (never raw text); feedback-only structs still differ (D2)
  const purgeHint = `node "$pluginRoot/skills/vc-self-check/deliver.mjs" --purge${args.diag ? ` --diag ${diagPath}` : ""}`;

  // --purge (standalone): the terminal "delete all" step of the log→analyze→contribute→
  // delete cycle. Cleans up ONLY this processed session's local artifacts and sends
  // nothing. Use it after a hand-off PR has been opened, or when there was nothing
  // worthwhile to contribute.
  if (args.purge) {
    const removed = purgeSession({ dir: diagDir(), sid, fp, extra: [diagPath] });
    const out = { action: "purge", session: sid || null, removed };
    if (args.json) process.stdout.write(JSON.stringify(out) + "\n");
    else process.stdout.write(
      removed.length
        ? `Purged ${removed.length} local artifact(s) for session ${sid || "(this DIAG)"}:\n  ${removed.join("\n  ")}\n`
        : `Nothing to purge for session ${sid || "(this DIAG)"}.\n`
    );
    return;
  }

  // Nothing worthwhile to contribute → file nothing; offer the cleanup step. `reduce` only
  // keeps flagged spans (degraded/failed/silent_suspect → BROKEN/DEGRADED), so every finding
  // in the struct is actionable. A negative /vc-feedback verdict IS worthwhile even with no
  // finding (it's often the only signal on a silent failure).
  const hasNegFeedback = struct.feedback.down > 0;
  if (!struct.findings.length && !hasNegFeedback) {
    const out = { action: "none", session: sid || null, findings: struct.findings.length, actionable: 0 };
    if (args.json) process.stdout.write(JSON.stringify(out) + "\n");
    else process.stdout.write(
      `No worthwhile finding to contribute (no BROKEN/DEGRADED finding, no 👎 feedback). Nothing sent.\n` +
        `To clear this session's local diagnostics:\n  ${purgeHint}\n`
    );
    return;
  }

  // feedback.mode=off — the operator opted out of upstream delivery. Nothing leaves the
  // machine; the DIAG stays local. (Capture + diagnosis already ran — they need no consent.)
  if (mode === "off") {
    const out = { action: "disabled", reason: "feedback.mode=off", session: sid || null };
    if (args.json) process.stdout.write(JSON.stringify(out) + "\n");
    else process.stdout.write(
      `Upstream delivery is disabled (feedback.mode=off). The DIAG stays local — nothing sent.\n` +
        `Enable it by setting feedback.mode to "ask" or "auto" in project-profile.json (or re-run /project-init).\n` +
        `To clear this session's local diagnostics:\n  ${purgeHint}\n`
    );
    return;
  }
  // auto — the outbound step proceeds without a per-run --confirm (the operator consented
  // once at onboarding). `--dry` overrides both: an explicit "draft only, send nothing".
  const confirm = (args.confirm || mode === "auto") && !args.dry;

  const { token, via, scopes } = resolveGithubToken();
  const probe = token ? await probeGithubUpstream({ token, repo: args.repo, via, scopes }) : null;
  const { route, reason } = resolveRoute({ token, probe, scopes, override: args.override });

  const draft = buildDraft({ struct, route });
  const dup = route === "issue" || route === "local" ? await findDuplicateIssue({ repo: args.repo, token, fp }) : null;

  // Always write the draft locally (never under the plugin dir).
  const dir = diagDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deliveryPath = join(dir, `DELIVERY-${fp}-${stamp}.md`);
  writeFileSync(deliveryPath, `# ${draft.title}\n\n${draft.body}\n`, "utf8");

  const plan = {
    diag: diagPath,
    repo: args.repo,
    tokenVia: via || null,
    perm: probe?.perm ?? null,
    route,
    reason,
    fingerprint: fp,
    duplicate: dup,
    title: draft.title,
    deliveryDraft: deliveryPath,
    findings: struct.findings.length,
    sent: false,
  };

  if (!confirm) {
    plan.dryRun = true;
    plan.mode = mode;
    // The one-shot offer guard (VCST-5582 G). A DRY run IS the offer, so read the guard, report
    // it, then mark — the skill stays SILENT when `alreadyOffered` is true instead of re-asking.
    const guard = readOfferGuard(sid, fp);
    plan.alreadyOffered = guard.alreadyOffered;
    plan.offerGuard = guard.available ? "session-state" : "unavailable";
    if (!guard.alreadyOffered) markOffered(sid, fp);
    if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
    else {
      process.stdout.write(
        [
          `Route: ${route} — ${reason}   (feedback.mode=${mode})`,
          `Repo:  ${args.repo}   Token: ${via || "none"}   Perm: ${probe?.perm ?? "n/a"}`,
          dup ? `Dedup: matches existing open issue #${dup.number} (${dup.url}) — would add a "+1 occurrence" comment (no new issue)` : `Dedup: no existing self-check issue with this fingerprint`,
          ``,
          `Draft written (scrubbed): ${deliveryPath}`,
          `--- draft ---`,
          `# ${draft.title}`,
          ``,
          draft.body,
          `-------------`,
          route === "issue"
            ? `Nothing sent. Re-run with --confirm to file this GitHub Issue (then this session's local artifacts are auto-cleaned; --keep to retain).`
            : route === "local"
            ? `No token/rights → local report only. Authenticate to deliver:\n  export GITHUB_FIX_BUGS_TOKEN=<PAT>   # or:  gh auth login`
            : `Nothing sent. A ${route} is handed off (not auto-created) — with --confirm you get the ready command sequence:`,
          route === "pr" || route === "fork-pr" ? "\n" + prHandoffCommands({ repo: args.repo, route, fp }) : "",
        ]
          .filter(Boolean)
          .join("\n") + "\n"
      );
    }
    return;
  }

  // Act. Only the Issue route auto-sends; pr/fork-pr hand off; local writes.
  if (route === "issue") {
    if (dup) {
      plan.skipped = `duplicate of #${dup.number}`;
      // Already upstream — don't re-file; add a "+1 occurrence" comment so the vendor
      // sees this defect hit another client (occurrence counts across clients).
      plan.occurrenceComment = await addOccurrenceComment({ repo: args.repo, token, number: dup.number, fp });
      // Purge ONLY if the +1 occurrence comment actually posted. addOccurrenceComment swallows all
      // errors → false, so on a transient network blip the occurrence would be silently uncounted AND
      // the local artifacts deleted — the +1 lost with no retry path (code review #3). If it failed,
      // KEEP the artifacts so a later re-run retries (symmetric with the local/pr routes, which keep
      // artifacts when nothing was delivered).
      if (!args.keep && plan.occurrenceComment) plan.purged = purgeSession({ dir, sid, fp, extra: [diagPath, deliveryPath] });
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(
        `Duplicate of open issue #${dup.number} (${dup.url}) — not filing again; ` +
          `${plan.occurrenceComment ? "added a +1 occurrence comment" : "could not add occurrence comment (kept local artifacts for retry)"}.\n` +
          (plan.purged?.length ? `Purged ${plan.purged.length} local artifact(s) for session ${sid || "(this DIAG)"}.\n` : ``)
      );
      return;
    }
    try {
      const created = await createIssue({ repo: args.repo, token, title: draft.title, body: draft.body });
      plan.sent = true;
      plan.issue = created;
      // Delivered → delete the processed session's local artifacts (unless --keep).
      if (!args.keep) plan.purged = purgeSession({ dir, sid, fp, extra: [diagPath, deliveryPath] });
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(
        `Filed GitHub Issue #${created.number}: ${created.url}\n` +
          (plan.purged?.length
            ? `Purged ${plan.purged.length} local artifact(s) for session ${sid || "(this DIAG)"}.\n`
            : args.keep ? `Kept local artifacts (--keep).\n` : ``)
      );
    } catch (e) {
      plan.error = String(e?.message ?? e);
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stderr.write(plan.error + "\n");
      process.exitCode = 1;
    }
    return;
  }

  if (route === "pr" || route === "fork-pr") {
    plan.handoff = true;
    // Not delivered yet (the human opens the PR) → do NOT purge now.
    if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
    else
      process.stdout.write(
        `${route} is NOT auto-created (a code PR needs a working tree + human-reviewed patch).\n` +
          `Scrubbed draft: ${deliveryPath}\n\n${prHandoffCommands({ repo: args.repo, route, fp })}\n\n` +
          `Once the PR is open, clear this session's local diagnostics:\n  ${purgeHint}\n`
      );
    return;
  }

  // local — no token/rights, nothing delivered → keep the artifacts (don't purge).
  if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
  else process.stdout.write(
    `No token/rights → local report only: ${deliveryPath}\nAuthenticate then re-run to deliver (artifacts kept until then).\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    process.stderr.write(`deliver error: ${e?.message ?? e}\n`);
    process.exitCode = 1;
  });
}
