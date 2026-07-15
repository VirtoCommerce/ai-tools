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

// ─── containment (§2a) — whitelist gate + defense-in-depth scrubber ──────────
//
// TRUST MODEL: every findings-table cell is untrusted. A cell may reach an
// outbound report ONLY if it is plugin-safe (a recognized plugin-file reference
// or generic advice with no client-shaped tokens). `isClientSpecific` is the GATE
// (buildDraft downgrades any client-specific row); `scrubText` is defense-in-depth
// for the cells that pass. A blacklist scrubber alone is unsafe — it leaks anything
// it fails to anticipate — so the gate is positive-detection, not blacklist.
const REDACTIONS = [
  [/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 «redacted»"],
  [/\b(token|api[_-]?key|secret|password|passwd|pwd)\b\s*[:=]\s*\S+/gi, "$1=«redacted»"],
  [/\beyJ[A-Za-z0-9._-]{16,}/g, "«jwt»"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "«gh-token»"],
  // PAN: 13–19 digits, space/dash separated. Anchored on a digit at BOTH ends so a
  // trailing separator before the next word is NOT eaten ("4111 1111 1111 1111 used"
  // → "«pan» used", not "«pan»used").
  [/\b\d(?:[ -]?\d){12,18}\b/g, "«pan»"],
];

/**
 * Recognizes a reference to a vc-fix PLUGIN file/component — the WHITELIST. The
 * plugin-dir / filename anchors use a negative lookbehind so a CLIENT path that merely
 * contains a plugin-dir NAME as a mid-path segment (e.g. `acme/skills/Secret.cs`) is
 * NOT mistaken for a plugin reference — only a token-boundary `hooks|skills|commands|
 * knowledge/…` (or a known plugin filename) counts.
 */
const PLUGIN_FILE_RE =
  /(?<![\w-])(?:session-telemetry|enforce-real-user|sweep-stray-screenshots|deliver|probe-lib|paths)\.mjs|(?<![\w/-])(?:hooks|skills|commands|knowledge)\/[\w./-]+|(?<![\w/-])\.claude\/rules\/[\w.-]+|(?<![\w-])\/(?:qa-[a-z-]+|vc-self-check|project-init|vc-docs)\b|(?<![\w-])(?:repo-router\.ts|fix-repos\.json|quality-gates\.md|reports\.md)/;
const PLUGIN_FILE_RE_G = new RegExp(PLUGIN_FILE_RE.source, "g");

/** Escape a string for use inside a RegExp. */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Layer 1 — configured client identifiers (org / client-repo / github account) read
// from project-profile.json. This is the ONLY reliable way to catch an arbitrary or
// lowercase client name (e.g. `acme`, `acme-cart-service`). On a native-platform
// deployment there is no profile ⇒ no client ⇒ nothing to catch here (correct).
let _clientTerms = null;
function clientTerms() {
  if (_clientTerms) return _clientTerms;
  _clientTerms = [];
  try {
    const p = join(outputRoot(), "project-profile.json");
    if (existsSync(p)) {
      const prof = JSON.parse(readFileSync(p, "utf8"));
      const s = new Set();
      const add = (v) => { if (typeof v === "string" && v.trim().length >= 3) s.add(v.trim()); };
      add(prof.clientOrg); add(prof?.client?.org); add(prof?.vcs?.clientOrg);
      add(prof?.upstream?.clientGithubAccount);
      for (const r of prof?.repos?.client || []) (r && typeof r === "object") ? (add(r.name), add(r.repo)) : add(r);
      _clientTerms = [...s];
    }
  } catch { _clientTerms = []; }
  return _clientTerms;
}

/**
 * DEFENSE IN DEPTH (not the primary gate). Removes configured client identifiers,
 * secrets, absolute AND relative filesystem paths (Windows back/forward-slash, UNC,
 * source paths), URLs, emails, and tracker ticket keys. Plugin-file references and
 * slash-command names survive — they don't match these shapes.
 */
export function scrubText(input) {
  let s = String(input ?? "");
  // Alphanumeric-only boundary (NOT \b): `_` is a \w char, so `\bacme\b` would miss
  // "acme" inside a derived identifier like `acme_cart_service` / `ACME_API_KEY`.
  // Treat `_ . / -` (and everything non-alphanumeric) as a separator so the configured
  // org is caught inside underscore/dot/slash/hyphen-joined tokens.
  for (const term of clientTerms()) s = s.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, "gi"), "«client»");
  for (const [re, rep] of REDACTIONS) s = s.replace(re, rep);
  s = s.replace(/[A-Za-z]:[\\/][^\s"'`]+/g, "«path»"); // Windows abs (back OR forward slash)
  s = s.replace(/\\\\[^\s"'`]+/g, "«path»"); // UNC \\server\share\...
  s = s.replace(/(?<![\w])\/(?:home|Users|root|tmp|var|opt|mnt|srv|c|d)\/[^\s"'`]+/gi, "«path»"); // POSIX/msys abs
  s = s.replace(/\b[\w.-]+(?:[\\/][\w.-]+)+\.(?:cs|cshtml|razor|vue|ts|tsx|js|jsx|py|java|go|rb|php|sql)\b/gi, "«path»"); // relative source path
  s = s.replace(/\bhttps?:\/\/[^\s"'`)]+/gi, "«url»"); // client URLs / portal links
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "«email»"); // emails
  s = s.replace(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g, "«ticket»"); // tracker ticket keys
  return s;
}

/** Placeholders the scrubber leaves where it removed client-specific content. */
const REDACTED_PLACEHOLDER_RE = /«(client|path|url|email|ticket|redacted|jwt|gh-token|pan)»/;

/** Does this text reference a vc-fix PLUGIN file/component? (whitelist positive) */
export function referencesPlugin(text) {
  return PLUGIN_FILE_RE.test(String(text ?? ""));
}

// Known-safe vocabulary: plugin + platform + tooling + common QA/dev prose words that
// are legitimately capitalized but NOT client identity. Any capitalized/compound token
// NOT in this set is treated as a client class / namespace / org / proper noun. Missing
// a safe word only over-downgrades a finding (the fail-safe direction); a client name
// leaking through is the failure we refuse.
const SAFE_TERMS = new Set([
  // compound tech/platform terms (would otherwise trip the compound-PascalCase rule)
  "GitHub", "GitLab", "SonarCloud", "DevOps", "GraphQL", "VirtoCommerce", "TypeScript",
  "JavaScript", "AppInsights", "DevTools", "WebKit", "PostgreSQL", "MySQL", "SqlServer",
  "SessionStart", "PostToolUse", "PreToolUse", "SubagentStop",
  // single-word tech/tools/acronyms
  "GitLab", "Azure", "Jira", "Node", "Vue", "Angular", "Playwright", "Chromium",
  "Firefox", "Edge", "Chrome", "Windows", "Linux", "Mac", "POSIX", "REST", "API",
  "Teams", "App", "Insights", "MCP", "CLI", "PAT", "JWT", "PAN", "URL", "UNC", "HTTP",
  "HTTPS", "JSON", "XML", "HTML", "CSS", "SQL", "DB", "ID", "UUID", "GUID", "Docker",
  // plugin / QA / gate vocabulary
  "OK", "BAIL", "STOP", "DIAG", "STR", "BL", "ECL", "PR", "CI", "CD", "QA", "Virto",
  "Commerce", "Gate", "Gates", "Phase", "Step", "Steps", "Tier", "Signal", "Signals",
  "Verdict", "Severity", "Anomaly", "Score", "Threshold", "Consent", "Prompt",
  "Session", "Skill", "Skills", "Command", "Commands", "Hook", "Hooks", "Telemetry",
  "Transcript", "Cursor", "Delta", "Snippet", "Token", "Auth", "Config", "Path",
  "Paths", "File", "Files", "Line", "Lines", "Cap", "Error", "Errors", "Warning",
  "Failure", "Permission", "Denied", "Repo", "Branch", "Commit", "Issue", "Review",
  "Fix", "Deploy", "Build", "Test", "Tests", "Coverage", "Regression", "Suite",
  "Module", "Modules", "Platform", "Frontend", "Backend", "Admin", "Storefront",
  "Theme", "Cart", "Order", "Orders", "Catalog", "Checkout", "Search", "Pricing",
  "Payment", "Marketing", "Customer", "Inventory", "User", "Users", "Bug", "Bugs",
  "Draft", "Send", "Scrub", "Downgrade", "Redact",
  // common capitalized prose words (sentence starters / verbs)
  "A", "An", "The", "This", "That", "These", "Those", "No", "Not", "None", "And",
  "Or", "But", "If", "When", "While", "With", "Without", "Via", "Per", "For", "From",
  "To", "In", "On", "Of", "At", "As", "By", "See", "Use", "Run", "Add", "Set", "Read",
  "Write", "Open", "Close", "Skip", "Start", "Check", "Trim", "Extend", "Verify",
  "Ensure", "Update", "Remove", "Replace", "Move", "Rename", "Guard", "Handle", "Wire",
  "Call", "Return", "Emit", "Log", "Report", "Confirm", "Merge", "Push", "Pull", "Fork",
  "Missing", "Failed", "Should", "Must", "May", "Only", "Also", "Then", "Now", "Note",
  // tool names + hook subcommands + HTTP/GraphQL verbs (appear capitalized in findings)
  "Stop", "Edit", "Bash", "Grep", "Glob", "Task", "Init", "Record", "Finalize",
  "Get", "Post", "Put", "Patch", "Delete", "Query", "Mutation", "Yes", "Both", "Each",
  "Any", "All", "Its", "Their", "Reproduce", "Reproduced", "Triage", "Route", "Repro",
  // domain tool / product names that appear in findings (SonarCloud is compound-safe
  // above; "Sonar" alone is not — add it and the rest explicitly)
  "Swagger", "Storybook", "Vitest", "Sonar", "Cypress", "Vite", "Skyflow",
  "CyberSource", "Datatrans", "Newman", "Postman", "Hangfire", "RabbitMQ", "Redis",
  "ElasticSearch", "Kibana",
]);

/**
 * Positive detection of CLIENT-SHAPED content the blacklist scrubber can't catch, in
 * three layers: (1) a configured client identifier (any case) from the profile; (2)
 * paths / source files (Windows drive, UNC, any-slash path or source file that is NOT an
 * anchored plugin reference); (3) residual identifier tokens — a compound camel/Pascal
 * token or a single Capitalized proper-noun word not in the safe vocabulary. A plugin
 * reference is masked out first so it never trips (2)/(3). Bias is fail-safe.
 */
function containsClientShape(text) {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  // (1) configured client identifiers — alphanumeric-only boundary (see scrubText):
  // catches the org inside underscore/dot/slash/hyphen-joined derived identifiers.
  for (const term of clientTerms()) if (new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, "i").test(t)) return true;
  // (2) hard path shapes
  if (/[A-Za-z]:[\\/]/.test(t)) return true; // Windows drive path
  if (/\\\\[\w.$-]+/.test(t)) return true; // UNC
  const masked = t.replace(PLUGIN_FILE_RE_G, " "); // remove anchored plugin refs, judge the rest
  // NB: no bare "word/word" slash rule — it over-redacted benign plugin vocabulary
  // ("STR passed 2/3", "GET/POST /graphql", "chrome/firefox/edge", "pass/fail"). A real
  // client path is still caught precisely by the drive/UNC rules above, the source/config
  // FILE rule below (by extension), and the named-segment token rules (proper-noun /
  // camelCase). A lowercase, extension-less relative path with no client-shaped segment
  // (e.g. "src/handlers/cart") is not client-identifying and is allowed to survive.
  if (/[\w-]+\.(?:cs|cshtml|razor|vue|ts|tsx|js|jsx|py|java|go|rb|php|sql|json|xml|config|dll)\b/i.test(masked)) return true; // non-plugin source/config file
  // (3) residual identifier tokens (client class / namespace / org / proper noun).
  // Scan the UNMASKED text, NOT `masked`: the whitelist greedily swallows a whole
  // `hooks|skills|commands|knowledge/…` path, so a client identifier embedded in a
  // filename under one of those dirs (e.g. `knowledge/AcmeCorp-notes.md`) would escape
  // the shape check if we judged `masked`. Plugin file refs are lowercase-kebab, so
  // scanning the raw text does not over-flag them. (The extension rule above stays on
  // `masked` — else a legit plugin `repo-router.ts` reference would trip it.)
  for (const tok of t.match(/[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*/g) || []) {
    if (SAFE_TERMS.has(tok)) continue;
    if (/[a-z][A-Z]/.test(tok)) return true; // compound camel/PascalCase (AcmeCorp, CartController)
    if (/^[A-Z][a-z][A-Za-z0-9]*$/.test(tok)) return true; // single Capitalized proper noun (Acme, Contoso) — requires a lowercase LETTER after the capital so gate/severity codes (G0-G7, S0-S3, P0) are NOT flagged
  }
  return false;
}

/**
 * A findings cell is CLIENT-SPECIFIC (§2a) when EITHER the blacklist scrubber had to
 * remove something (a placeholder survives) OR the whitelist gate detects client-shaped
 * content the scrubber can't catch. When true, buildDraft downgrades the whole row so no
 * client evidence reaches an outbound report. Generic advice ("check gh auth status") and
 * plugin-file references ("hooks/enforce-real-user.mjs") return false and are kept.
 */
export function isClientSpecific(original) {
  const t = String(original ?? "");
  if (REDACTED_PLACEHOLDER_RE.test(scrubText(t))) return true;
  return containsClientShape(t);
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
  // The SKILL cell is untrusted too — a client-shaped skill label (e.g.
  // "AcmeCheckoutSkill") would otherwise leak into the row AND the title, and
  // `scrubText` alone misses it (word-boundary/shape gap). Gate it with the same
  // `isClientSpecific` and use the GATED label everywhere it is shown.
  const skillLabel = (f) => (isClientSpecific(f.skill) ? "(plugin skill)" : scrubText(f.skill));

  // Whitelist gate + downgrade each finding.
  const rows = findings.map((f) => {
    // §2a downgrade: if ANY cell of the finding (skill / signal / root-cause / fix) is
    // client-specific, withhold the shown cells — a client-specific row's fix would
    // name client code, and its signal a client stack frame/path. Emit only a generic
    // pointer; no client identifier can reach the outbound report. The scrubText on the
    // kept branch is defense-in-depth (the gate already cleared it).
    const clientSpecific =
      isClientSpecific(f.skill) ||
      isClientSpecific(f.signal) ||
      isClientSpecific(f.rootcause) ||
      isClientSpecific(f.fix);
    const skill = skillLabel(f);
    let signal, fix, note = "";
    if (clientSpecific) {
      signal = "(client-specific evidence withheld)";
      fix = "(client-specific — generic: review the owning plugin skill)";
      note = " _[generic — client evidence withheld]_";
    } else {
      signal = scrubText(f.signal);
      fix = scrubText(f.fix);
    }
    return `| ${skill} | ${f.verdict} | ${f.sev} | ${signal} | ${fix}${note} |`;
  });
  const worst = findings.some((f) => f.verdict === "BROKEN") ? "BROKEN" : findings.some((f) => f.verdict === "DEGRADED") ? "DEGRADED" : "OK";
  const skills = [...new Set(findings.map((f) => `${skillLabel(f)} ${f.verdict}`))].slice(0, 3).join(", ");
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
    `Every findings cell was checked against a plugin-reference whitelist: any cell carrying`,
    `client-shaped content (file paths, source files, namespaces/classes, org identifiers,`,
    `URLs, emails, tickets, or secrets) was withheld and its row downgraded to a generic`,
    `pointer. Only plugin-file references and generic advice remain (quality-gates §2a).`,
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
