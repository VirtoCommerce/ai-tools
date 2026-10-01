// Round guard for tracker comments — does this post or amend belong to the round
// already on the ticket? Rule source: .claude/knowledge/execution/tracker-ops.md §0 rule 5.
//
// A ROUND is the build under test. Same build → same round → amend. New build → new
// round → a NEW comment, because an amend notifies nobody (VCST-5883, 2026-09-30: a
// round-2 retest was amended into round 1 and the developer never learned of it).
// When either side has no artifact, age stands in: a comment older than roundHours()
// is presumed to be another round. Both directions are guarded, and each has exactly
// one override that must carry a reason: --force-new (post) and --same-round (amend).

export const ROUND_HOURS_DEFAULT = 12; // copied into both tracker hooks — they cannot import this

export function roundHours(env = process.env) {
  const n = Number(env.TRACKER_ROUND_HOURS);
  return Number.isFinite(n) && n > 0 ? n : ROUND_HOURS_DEFAULT;
}

// The TRANSCRIPT id — what a hook payload carries as session_id. Not the desktop app's
// CLAUDE_CODE_HOST_SESSION_ID: that is a different id and would never match the hooks.
// CLAUDE_SESSION_ID was the only name read before #360, and Claude Code never exports it,
// so every helper post was run "local" — one run per checkout, forever.
export function sessionRunId(env = process.env) {
  return env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || "local";
}

export function ageHours(postedAt, now = Date.now()) {
  const t = Date.parse(postedAt ?? "");
  return Number.isFinite(t) ? (now - t) / 3_600_000 : null;
}

const norm = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

export function decide({ mode, entry, commentId, run, artifact, now = Date.now(), hours = ROUND_HOURS_DEFAULT, forceNew, sameRound }) {
  const mine = norm(artifact), theirs = norm(entry?.artifact);
  const known = Boolean(mine && theirs);
  const age = ageHours(entry?.posted_at, now);
  const stale = age !== null && age >= hours;

  if (mode === "post") {
    if (!entry) return { ok: true, code: "FIRST" };
    if (forceNew) return { ok: true, code: "FORCE_NEW" };
    if (known) return mine !== theirs ? { ok: true, code: "NEW_ROUND" } : { ok: false, code: "SAME_ROUND" };
    if (stale) return { ok: true, code: "STALE" };
    // "local" means "cannot prove it was a different run" — same stance as the MCP hook.
    const provablyDifferent = run && run !== "local" && entry.run_id && entry.run_id !== "local" && entry.run_id !== run;
    return provablyDifferent ? { ok: true, code: "DIFFERENT_RUN" } : { ok: false, code: "SAME_RUN" };
  }

  if (sameRound) return { ok: true, code: "SAME_ROUND_OVERRIDE" };
  if (!entry || String(entry.comment_id) !== String(commentId)) return { ok: true, code: "UNTRACKED" };
  if (known) return mine === theirs ? { ok: true, code: "WITHIN_ROUND" } : { ok: false, code: "NEW_ROUND_AMEND" };
  return stale ? { ok: false, code: "STALE_AMEND" } : { ok: true, code: "FRESH" };
}
