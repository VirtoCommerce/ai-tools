#!/usr/bin/env node
// PreToolUse hook — approves, without a prompt, exactly the calls /review-pr-gh-workflow makes
// many times per run, and nothing else. It only ever adds "allow"; it never denies.
//
// It does NOT keep credential files out of a review. What a session reads is sent to the model
// provider, and a PR can ask for a read; a name-based deny routed through `if` filters was tried and
// bypassed three times (device-prefixed paths, Grep globs, shell indirection) — `if` is best-effort by
// the docs. The hard control is `permissions.deny` in the user's own settings. What this skill does
// rely on is the helpers' tool list: pr-review-reader has Read only, so it can send nothing anywhere.
//
// Why a hook and not `permissions.allow`: measured 2026-10-15, the `permissions` block of this
// tracked .claude/settings.json was not applied in VS Code sessions (`/permissions` listed only
// user-settings rules; `/doctor` reported every settings file valid), while hooks from the same
// file ran. A hook also sees the RESOLVED path, so the 8.3 short form a subagent takes from its
// environment (`C:\Users\ABCDEF~1\…`) is handled — no path rule matched it.
//
// Allows (prints permissionDecision "allow"):
//   - Read / Grep / Glob of a path that resolves inside <tmp>/claude*/<this project's slug>/<session>/
//     scratchpad/pr-<N>/ or …/scratchpad/wt/ — the only two subtrees prepare.mjs writes. A Read of a
//     credential-looking file name (.env, .mcp.json, *.pem, *.key, id_rsa…) is left to the normal rules
//     (by name only — the scratch holds PR data); never a Grep/Glob whose pattern climbs out (`..` or absolute).
//   - WebFetch of a documentation page in WEB_HOSTS below — THE list of hosts the review cites; the
//     skill and its checklists point here instead of naming hosts themselves. No query string (it
//     could carry data to that host), except `?view=` on learn.microsoft.com; a fragment never leaves.
//   - Bash running prepare.mjs as ONE plain command (no control characters at all, no shell
//     metacharacters, no quoting tricks) from the project directory, so the script that runs is
//     this repository's, not one a PR planted under a worktree.
// Everything else: prints nothing, so the normal permission rules decide.
// Paths are filtered lexically BEFORE the filesystem is touched: a UNC or device path never reaches
// existsSync/realpath (on Windows that alone opens an SMB connection).
// Fails CLOSED to "no decision" on any error — a hook bug must never widen access.
// Known width, accepted: the scratch check matches this project's slug but not the session (any
// session of this project, and of a project whose path differs only in punctuation, which the slug
// folds).
//
// Registration — observed 2026-10-21 with Claude Code 2.1.282 (CLI) and 2.1.304 (VS Code), trusted folders:
//   - The lead: the SKILL's frontmatter, which Claude Code registers when /review-pr-gh-workflow is
//     invoked and keeps for the rest of THAT session only — WebFetch, the prepare.mjs command, and
//     Grep/Glob behind a shell `case` that starts node only for a scratch path. WebFetch has no `if`:
//     `WebFetch(domain:docs.github.com)` kept the hook from running.
//   - The helpers: one settings.json entry, `Read` with `if: "Read(//**/scratchpad/**)"`, so no process
//     starts for any other Read in any session. Inside a subagent only settings hooks ran: the docs say
//     an agent's own frontmatter `hooks:` run while it does, but a marker hook there did NOT fire for a
//     foreground or a background helper (three runs), and the skill's hooks fired in the lead only.
//     Re-check before relying on either. Grep and Glob are not registered there — a path rule in `if`
//     never matched them, so they would cost every session a shell start per call; hence the helper
//     has no Grep or Glob.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep, basename } from "node:path";

const SENSITIVE = /^(\.env.*|\.envrc|\.netrc|\.pgpass|\.npmrc|\.git-credentials|\.htpasswd|\.mcp\.json|secrets\.json|credentials\.json|id_rsa.*|id_ed25519.*|.*\.(pem|key|pfx|p12))$/i;
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
    if (u.search && !(u.hostname === "learn.microsoft.com" && /^\?view=[\w.-]+$/.test(u.search))) return false;
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
