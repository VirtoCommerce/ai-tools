#!/usr/bin/env node
// PreToolUse hook — approves, without a prompt, exactly the calls /review-pr-gh-workflow makes
// many times per run, and nothing else.
//
// Why a hook and not `permissions.allow`: measured 2026-10-15, the `permissions` block of this
// tracked .claude/settings.json was not applied in VS Code sessions (`/permissions` listed only
// user-settings rules; `/doctor` reported every settings file valid), while hooks from the same
// file ran. A hook also sees the RESOLVED path, so the 8.3 short form a subagent takes from its
// environment (`C:\Users\ABCDEF~1\…`) is handled — no path rule matched it.
//
// Allows (prints permissionDecision "allow"):
//   - Read / Grep / Glob of a path that resolves inside <tmp>/claude*/<this project's slug>/<session>/
//     scratchpad/pr-<N>/ or …/scratchpad/wt/ — the only two subtrees prepare.mjs writes. Never a
//     credential-looking file name (.env, *.pem, *.key, id_rsa…), never a Grep/Glob whose pattern
//     climbs out (`..` or absolute).
//   - WebFetch of a documentation page in WEB_HOSTS below — THE list of hosts the review cites; the
//     skill, its checklists and the reader agent point here instead of naming hosts themselves.
//   - Bash running prepare.mjs as ONE plain command (no control characters at all, no shell
//     metacharacters, no quoting tricks) from the project directory, so the script that runs is
//     this repository's, not one a PR planted under a worktree.
// Everything else: prints nothing, so the normal permission rules decide.
//
// `reader` mode (argument `reader`) — the pr-review-reader agent's own PreToolUse hook (its frontmatter;
// it runs only while that agent does). The inverse: DENIES every Read / Grep / Glob outside the review
// scratch and the two review skills' own files (.claude/skills/review-pr-gh-workflow/, …/review-pr-virto/),
// every credential-looking file name, every Grep/Glob without an explicit path, and every WebFetch
// outside WEB_HOSTS. Read-only by tool list is not enough on its own: inside the project `Read` needs
// no prompt (`.env.local`, `.mcp.json`), and WebFetch is a way out — a PR that talks the helper into
// reading one and fetching a URL with it must hit a wall, not a prompt the user may click through.
// Fails CLOSED to "deny" on any error. Prints nothing when the call is in bounds.
// Paths are filtered lexically BEFORE the filesystem is touched: a UNC or device path never reaches
// existsSync/realpath (on Windows that alone opens an SMB connection).
// Fails CLOSED to "no decision" on any error — a hook bug must never widen access.
// Known width, accepted: the scratch check matches this project's slug but not the session (any
// session of this project, and of a project whose path differs only in punctuation, which the slug
// folds); and SENSITIVE filters Read by name only — Grep content in the scratch can still print a
// `.env` the PR itself added, which is PR data, not a credential of this machine.
// Cost: one node start, ~220 ms measured on Windows. settings.json therefore registers it with an
// `if` filter where one works — scratchpad Reads and the prepare.mjs command — so it never runs for
// the ordinary Read / Bash calls of every other session in this repository. Grep, Glob and WebFetch
// have no filter (observed 2026-10-15): a `Read(...)` rule in `if` does not match Grep/Glob, and
// `WebFetch(domain:docs.github.com)` in `if` kept the hook from running at all. WebFetch is rare;
// Grep/Glob pay the start-up cost on every call.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep, basename } from "node:path";

const SENSITIVE = /^(\.env.*|\.envrc|\.netrc|\.pgpass|\.npmrc|\.git-credentials|\.htpasswd|secrets\.json|credentials\.json|id_rsa.*|id_ed25519.*|.*\.(pem|key|pfx|p12))$/i;
// Literal spaces only; arguments are paths (forward slashes, optionally in double quotes for a space),
// numbers, refs and names — never $, backticks, backslashes, single quotes, globs or redirections.
// `~` only inside a word (the 8.3 form `ANDREW~1` of the scratchpad, which is what a session is told on
// Windows) — at the start of a word bash would expand it.
const PREPARE = /^node \.claude\/skills\/review-pr-gh-workflow\/prepare\.mjs( [A-Za-z0-9 "._\/:@+~-]+)?$/;
const TILDE_EXPANDS = /(^|[\s"=:])~/;
const CONTROL = /[\x00-\x1f\x7f\u2028\u2029]/;

function real(p) {
  try { return realpathSync.native(p); } catch { return null; }
}

const PROJECT = process.env.CLAUDE_PROJECT_DIR ? real(process.env.CLAUDE_PROJECT_DIR) : null;
// Claude Code names a project's temp folder after its path with every non-alphanumeric replaced.
const SLUG = PROJECT ? PROJECT.replace(/[^A-Za-z0-9]/g, "-").toLowerCase() : null;
// Temp roots the scratchpad may live under: the OS temp dir plus the Unix fallbacks.
const ROOTS = [...new Set([tmpdir(), "/tmp", "/private/tmp"].map(real).filter(Boolean))];

function lexicallyPlausible(p) {
  if (typeof p !== "string" || !p || CONTROL.test(p)) return false;
  if (/^(\\\\|\/\/)/.test(p)) return false; // UNC, \\?\ and \\.\ device paths
  return /[\\/]scratchpad[\\/](pr-\d+|wt)([\\/]|$)/i.test(p);
}

function inReviewScratch(p, cwd) {
  if (!SLUG || !lexicallyPlausible(p)) return false;
  const abs = isAbsolute(p) ? p : resolve(cwd ?? process.cwd(), p);
  if (!existsSync(abs)) return false;
  const target = real(abs);
  if (!target) return false;
  for (const root of ROOTS) {
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    const parts = rel.split(sep);
    // claude*/<slug>/<session>/scratchpad/(pr-<N>|wt)[/…]
    if (parts.length >= 5 && /^claude(-[\w.-]+)?$/.test(parts[0]) && parts[1].toLowerCase() === SLUG &&
        parts[3] === "scratchpad" && (/^pr-\d+$/.test(parts[4]) || parts[4] === "wt")) return true;
  }
  return false;
}

const climbs = (pattern) => typeof pattern === "string" &&
  (pattern.split(/[\\/]/).includes("..") || isAbsolute(pattern) || /^[A-Za-z]:/.test(pattern));

// The review skills' own files, which a helper brief names (the checklist/ paths, review-pr-virto's
// shared rules). Reader mode only — the lead reads them without a prompt anyway.
const SKILL_DIRS = [".claude/skills/review-pr-gh-workflow", ".claude/skills/review-pr-virto"];
function inSkillDocs(p, cwd) {
  if (!PROJECT || typeof p !== "string" || !p || CONTROL.test(p) || /^(\\\\|\/\/)/.test(p)) return false;
  const abs = isAbsolute(p) ? p : resolve(cwd ?? process.cwd(), p);
  if (!existsSync(abs)) return false;
  const target = real(abs);
  if (!target) return false;
  const rel = relative(PROJECT, target).split(sep).join("/");
  return SKILL_DIRS.some((d) => rel === d || rel.startsWith(d + "/"));
}

// host → the path prefix a page must have there ("" = any). A new host the checklists cite goes here.
const WEB_HOSTS = {
  "docs.github.com": "",                       // GitHub Actions semantics
  "docs.zizmor.sh": "",                        // static tools (static-tools.md)
  "rhysd.github.io": "/actionlint/",
  "learn.microsoft.com": "powershell",         // PowerShell (checklist/scripts.md); optional locale first
  "www.gnu.org": "/software/bash/manual/",     // bash
  "nodejs.org": "/api/",                       // Node
};

function webAllowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !Object.hasOwn(WEB_HOSTS, u.hostname)) return false;
    const prefix = WEB_HOSTS[u.hostname];
    if (prefix === "powershell") return /^\/([a-z]{2}-[a-z]{2}\/)?powershell\//i.test(u.pathname);
    return u.pathname.startsWith(prefix);
  } catch { return false; }
}

function decide(input) {
  const t = input.tool_name;
  const ti = input.tool_input ?? {};
  if (t === "Read") return inReviewScratch(ti.file_path, input.cwd) && !SENSITIVE.test(basename(ti.file_path));
  if (t === "Glob") return inReviewScratch(ti.path, input.cwd) && !climbs(ti.pattern);
  if (t === "Grep") return inReviewScratch(ti.path, input.cwd) && !climbs(ti.glob);
  if (t === "WebFetch") return webAllowed(ti.url);
  if (t === "Bash") {
    const cmd = ti.command;
    if (typeof cmd !== "string" || CONTROL.test(cmd) || !PREPARE.test(cmd) || TILDE_EXPANDS.test(cmd)) return false;
    // The relative script path resolves against the shell's cwd: only the project dir is trusted.
    const cwd = input.cwd ? real(input.cwd) : null;
    return !!PROJECT && !!cwd && cwd.toLowerCase() === PROJECT.toLowerCase();
  }
  return false;
}

// Reader mode: true = in bounds (no output), false = deny.
function inBounds(input) {
  const t = input.tool_name;
  const ti = input.tool_input ?? {};
  const local = (p) => inReviewScratch(p, input.cwd) || inSkillDocs(p, input.cwd);
  if (t === "Read") return local(ti.file_path) && !SENSITIVE.test(basename(ti.file_path));
  if (t === "Glob") return local(ti.path) && !climbs(ti.pattern);
  if (t === "Grep") return local(ti.path) && !climbs(ti.glob);
  if (t === "WebFetch") return webAllowed(ti.url);
  return true; // the agent has no other tools; anything else is the normal rules' business
}

const deny = (reason) => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
}));

if (process.argv[2] === "reader") {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    if (!inBounds(input))
      deny("pr-review-reader: outside the review scratch, the review skills' files and the docs hosts " +
        "(Grep/Glob need an explicit path) — list it under `requests` for the lead instead");
  } catch {
    deny("pr-review-reader guard: could not read the call — denied (fails closed)");
  }
  process.exit(0);
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (decide(input)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "review-pr-gh-workflow: review scratch files, GitHub docs, or prepare.mjs",
      },
    }));
  }
} catch {
  // no decision
}
process.exit(0);
