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
//   - WebFetch of an https://docs.github.com/ URL — the skill cites GitHub semantics from there.
//   - Bash running prepare.mjs as ONE plain command (no control characters at all, no shell
//     metacharacters, no quoting tricks) from the project directory, so the script that runs is
//     this repository's, not one a PR planted under a worktree.
// Everything else: prints nothing, so the normal permission rules decide.
// Paths are filtered lexically BEFORE the filesystem is touched: a UNC or device path never reaches
// existsSync/realpath (on Windows that alone opens an SMB connection).
// Fails CLOSED to "no decision" on any error — a hook bug must never widen access.
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
const PREPARE = /^node \.claude\/skills\/review-pr-gh-workflow\/prepare\.mjs( [A-Za-z0-9 "._\/:@+-]+)?$/;
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

function decide(input) {
  const t = input.tool_name;
  const ti = input.tool_input ?? {};
  if (t === "Read") return inReviewScratch(ti.file_path, input.cwd) && !SENSITIVE.test(basename(ti.file_path));
  if (t === "Glob") return inReviewScratch(ti.path, input.cwd) && !climbs(ti.pattern);
  if (t === "Grep") return inReviewScratch(ti.path, input.cwd) && !climbs(ti.glob);
  if (t === "WebFetch") {
    try { const u = new URL(ti.url); return u.protocol === "https:" && u.hostname === "docs.github.com"; }
    catch { return false; }
  }
  if (t === "Bash") {
    const cmd = ti.command;
    if (typeof cmd !== "string" || CONTROL.test(cmd) || !PREPARE.test(cmd)) return false;
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
