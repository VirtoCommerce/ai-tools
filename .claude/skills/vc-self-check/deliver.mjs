#!/usr/bin/env node
/**
 * skills/vc-self-check/deliver.mjs — Step 4 of the vc-fix self-diagnostics
 * subsystem (VCST-5478). Turns a confirmed local DIAG-*.md into a SCRUBBED,
 * plugin-mechanics-only quality report contributed back to
 * `VirtoCommerce/vc-mcp-testing-module` (the plugin's OWN repo), routed by the
 * GitHub token's ACTUAL rights and gated on explicit user consent.
 *
 * Mirrors `contributionPlan`, pointed at the plugin repo. Reuses
 * `../project-init/probe-lib.mjs` (`resolveGithubToken` + `probeGithubUpstream`)
 * — that relative import resolves identically in BOTH trees (plugins/vc-fix/ and
 * .claude/ each ship skills/project-init/probe-lib.mjs), so this file is
 * byte-identical across trees.
 *
 * HARD INVARIANTS (quality-gates §2a client-code containment + per-action consent):
 *   - NEVER touches the client-installed plugin (read-only w.r.t. the install).
 *   - NEVER leaks client code/data upstream: every outbound title/body is scrubbed
 *     of client source, file paths, URLs, identifiers, tickets, data, and secrets —
 *     only plugin-file references + a generic repro survive. A finding whose
 *     evidence is client-specific is DOWNGRADED to a generic description, never
 *     attached.
 *   - DRAFT-AND-CONFIRM: the default run is DRY (draft + show). It sends ONLY with
 *     `--confirm`, and even then auto-sends only the low-risk GitHub Issue route;
 *     a PR/fork-PR is handed off as ready commands (opening a code PR needs a
 *     working tree + a human-reviewed patch, which a telemetry script must not
 *     fabricate).
 *   - Issue dedup: a stable fingerprint marker prevents repeat sessions from
 *     spamming the tracker.
 *
 * Usage:
 *   node deliver.mjs [--diag <path>] [--repo <owner/name>] [--as pr|fork-pr|issue|local]
 *                    [--confirm] [--json]
 *   (default --repo VirtoCommerce/vc-mcp-testing-module; default is a DRY draft.)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveGithubToken, probeGithubUpstream } from "../project-init/probe-lib.mjs";

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

// ─── containment scrubber (§2a) ─────────────────────────────────────────────
const REDACTIONS = [
  [/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 «redacted»"],
  [/\b(token|api[_-]?key|secret|password|passwd|pwd)\b\s*[:=]\s*\S+/gi, "$1=«redacted»"],
  [/\beyJ[A-Za-z0-9._-]{16,}/g, "«jwt»"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "«gh-token»"],
  [/\b(?:\d[ -]?){13,19}\b/g, "«pan»"],
];

/** Recognizes a reference to a vc-fix PLUGIN file/component — these survive scrubbing. */
const PLUGIN_FILE_RE =
  /(session-telemetry|enforce-real-user|sweep-stray-screenshots|deliver|probe-lib|paths)\.mjs|(hooks|skills|commands|knowledge)\/[\w./-]+|\.claude\/rules\/[\w.-]+|\/(qa-[a-z-]+|vc-self-check|project-init|vc-docs)\b|repo-router\.ts|fix-repos\.json|quality-gates\.md|reports\.md/;

/**
 * Scrub client-identifying content. Removes secrets, absolute filesystem paths,
 * URLs, emails, and tracker ticket keys. Relative plugin-file references and
 * slash-command names are NOT absolute/URL/email/ticket-shaped, so they survive.
 */
export function scrubText(input) {
  let s = String(input ?? "");
  for (const [re, rep] of REDACTIONS) s = s.replace(re, rep);
  s = s.replace(/[A-Za-z]:\\[^\s"'`]+/g, "«path»"); // Windows absolute paths
  s = s.replace(/(?<![\w])\/(?:home|Users|root|tmp|var|opt|mnt|srv|c|d)\/[^\s"'`]+/gi, "«path»"); // POSIX/msys abs paths
  s = s.replace(/\bhttps?:\/\/[^\s"'`)]+/gi, "«url»"); // client URLs / portal links
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "«email»"); // emails
  s = s.replace(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g, "«ticket»"); // tracker ticket keys
  return s;
}

/** Placeholders the scrubber leaves where it removed client-specific content. */
const REDACTED_PLACEHOLDER_RE = /«(path|url|email|ticket|redacted|jwt|gh-token|pan)»/;

/** Does this text reference a vc-fix PLUGIN file/component? */
export function referencesPlugin(text) {
  return PLUGIN_FILE_RE.test(String(text ?? ""));
}

/**
 * A finding is CLIENT-SPECIFIC (§2a: "reproducible only with client code") when
 * scrubbing had to remove something — i.e. the scrubbed text carries a redaction
 * placeholder. Safe generic advice ("check gh auth status") that scrubs unchanged
 * is NOT client-specific and is kept verbatim.
 */
export function isClientSpecific(original) {
  return REDACTED_PLACEHOLDER_RE.test(scrubText(original));
}

// ─── DIAG parsing ────────────────────────────────────────────────────────────
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
  const pluginVersion = verMatch ? verMatch[1] : "unknown";
  const findings = [];
  for (const line of text.split("\n")) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split("|").map((c) => c.trim());
    // drop the empty edges from leading/trailing pipes
    if (cells.length && cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 4) continue;
    const [skill, verdict, sev] = cells;
    if (!/^(OK|DEGRADED|BROKEN)$/.test(verdict) || !/^S[0-3]$/.test(sev)) continue; // skip header/separator
    const signal = cells[3] ?? "";
    const fix = cells[cells.length - 1] ?? "";
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
 *   fork-pr  — authenticated, no push, can fork → fork-PR (handed off)
 *   issue    — authenticated, issues only (no repo/fork scope) → GitHub Issue (auto-sendable)
 *   local    — no token / auth failed → local report + auth instructions
 */
export function resolveRoute({ token, probe, scopes, override }) {
  if (override) return { route: override, reason: "operator override (--as)" };
  if (!token) return { route: "local", reason: "no GitHub token or gh session" };
  if (!probe || !probe.ok) return { route: "local", reason: "token present but GitHub authentication failed" };
  const perm = probe.perm;
  if (["push", "maintain", "admin"].includes(perm)) return { route: "pr", reason: `push access (${perm})` };
  // authenticated but no push: prefer fork-PR unless the (gh) scopes clearly lack repo access
  const scopesKnown = typeof scopes === "string" && scopes.length > 0;
  const canFork = !scopesKnown || /(?:^|,)(repo|public_repo)(?:,|$)/.test(scopes);
  if (!canFork) return { route: "issue", reason: "authenticated, issues-only (no repo/fork scope)" };
  return { route: "fork-pr", reason: `authenticated as ${probe.login || "user"} without push — fork-PR` };
}

// ─── fingerprint / dedup ─────────────────────────────────────────────────────
/** Stable, Date-free short hash (djb2 → base36) over the finding signatures. */
export function fingerprint(findings) {
  const sig = (findings || [])
    .map((f) => `${f.skill}|${f.verdict}|${f.sev}|${(f.fix || "").replace(/\s+/g, " ").trim()}`)
    .sort()
    .join("\n");
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = ((h * 33) ^ sig.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** List open self-check issues on the repo and return one whose body carries `fp`, else null. */
export async function findDuplicateIssue({ repo, token, fp }) {
  if (!token) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "vc-self-check", Accept: "application/vnd.github+json" },
    });
    if (!r.ok) return null;
    const issues = await r.json();
    for (const it of issues) {
      if (it.pull_request) continue; // issues endpoint also returns PRs
      const body = it.body || "";
      if (body.includes(`${FP_MARKER} ${fp}`)) return { number: it.number, url: it.html_url };
    }
  } catch {
    /* network — treat as no known dup */
  }
  return null;
}

// ─── draft assembly ──────────────────────────────────────────────────────────
export function buildDraft({ route, pluginVersion, findings, fp }) {
  // Scrub + downgrade each finding.
  const rows = findings.map((f) => {
    const skill = scrubText(f.skill);
    const signal = scrubText(f.signal);
    let fix = scrubText(f.fix);
    let note = "";
    // §2a downgrade: if the finding's fix OR signal was client-specific (scrubbing
    // left a redaction placeholder), replace the fix with a generic description and
    // withhold the client evidence — never attach client code upstream.
    if (isClientSpecific(f.fix) || isClientSpecific(f.signal) || isClientSpecific(f.rootcause)) {
      fix = "(client-specific — generic: review the owning plugin skill)";
      note = " _[generic — client evidence withheld]_";
    }
    return `| ${skill} | ${f.verdict} | ${f.sev} | ${signal} | ${fix}${note} |`;
  });
  const worst = findings.some((f) => f.verdict === "BROKEN") ? "BROKEN" : findings.some((f) => f.verdict === "DEGRADED") ? "DEGRADED" : "OK";
  const skills = [...new Set(findings.map((f) => `${scrubText(f.skill)} ${f.verdict}`))].slice(0, 3).join(", ");
  const title = `${ISSUE_TITLE_PREFIX} ${skills || worst}`;
  const body = [
    `<!-- ${FP_MARKER} ${fp} -->`,
    `Automated quality report from the vc-fix self-diagnostics subsystem (\`/vc-self-check\`).`,
    `Plugin version: ${scrubText(pluginVersion)}. Generated from local session telemetry.`,
    ``,
    `## Findings`,
    `| Skill | Verdict | Sev | Signal | Proposed fix (plugin file) |`,
    `|-------|---------|-----|--------|----------------------------|`,
    ...rows,
    ``,
    `## Containment`,
    `Scrubbed of client source, paths, URLs, identifiers, tickets, and secrets per the`,
    `client-code containment invariant (quality-gates §2a). Findings whose evidence was`,
    `client-specific are shown as generic descriptions only — no client code is attached.`,
  ].join("\n");
  return { title, body, route };
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

// ─── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { repo: PLUGIN_REPO, confirm: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--confirm" || t === "--send") a.confirm = true;
    else if (t === "--json") a.json = true;
    else if (t === "--diag") a.diag = argv[++i];
    else if (t === "--repo") a.repo = argv[++i];
    else if (t === "--as") a.override = argv[++i];
  }
  return a;
}

function newestDiag() {
  const dir = diagDir();
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^DIAG-.*\.md$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  return files.length ? join(dir, files[0].f) : null;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const diagPath = args.diag ? resolve(args.diag) : newestDiag();
  if (!diagPath || !existsSync(diagPath)) {
    const msg = "No DIAG report found. Run /vc-self-check first to produce a local DIAG-*.md.";
    if (args.json) process.stdout.write(JSON.stringify({ error: msg }) + "\n");
    else process.stderr.write(msg + "\n");
    process.exitCode = 2;
    return;
  }

  const md = readFileSync(diagPath, "utf8");
  const { pluginVersion, findings } = parseDiag(md);
  const fp = fingerprint(findings);

  const { token, via, scopes } = resolveGithubToken();
  const probe = token ? await probeGithubUpstream({ token, repo: args.repo }) : null;
  const { route, reason } = resolveRoute({ token, probe, scopes, override: args.override });

  const draft = buildDraft({ route, pluginVersion, findings, fp });
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
    findings: findings.length,
    sent: false,
  };

  if (!args.confirm) {
    plan.dryRun = true;
    if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
    else {
      process.stdout.write(
        [
          `Route: ${route} — ${reason}`,
          `Repo:  ${args.repo}   Token: ${via || "none"}   Perm: ${probe?.perm ?? "n/a"}`,
          dup ? `Dedup: matches existing open issue #${dup.number} (${dup.url}) — would SKIP` : `Dedup: no existing self-check issue with this fingerprint`,
          ``,
          `Draft written (scrubbed): ${deliveryPath}`,
          `--- draft ---`,
          `# ${draft.title}`,
          ``,
          draft.body,
          `-------------`,
          route === "issue"
            ? `Nothing sent. Re-run with --confirm to file this GitHub Issue.`
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

  // --confirm: act. Only the Issue route auto-sends; pr/fork-pr hand off; local writes.
  if (route === "issue") {
    if (dup) {
      plan.skipped = `duplicate of #${dup.number}`;
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(`Duplicate of open issue #${dup.number} (${dup.url}) — not filing again.\n`);
      return;
    }
    try {
      const created = await createIssue({ repo: args.repo, token, title: draft.title, body: draft.body });
      plan.sent = true;
      plan.issue = created;
      if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
      else process.stdout.write(`Filed GitHub Issue #${created.number}: ${created.url}\n`);
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
    else
      process.stdout.write(
        `${route} is NOT auto-created (a code PR needs a working tree + human-reviewed patch).\n` +
          `Scrubbed draft: ${deliveryPath}\n\n${prHandoffCommands({ repo: args.repo, route, fp })}\n`
      );
    return;
  }

  // local
  if (args.json) process.stdout.write(JSON.stringify(plan) + "\n");
  else process.stdout.write(`No token/rights → local report only: ${deliveryPath}\nAuthenticate then re-run.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    process.stderr.write(`deliver error: ${e?.message ?? e}\n`);
    process.exitCode = 1;
  });
}
