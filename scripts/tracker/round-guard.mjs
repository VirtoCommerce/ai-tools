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
    return provablyDifferentRun(run, entry) ? { ok: true, code: "DIFFERENT_RUN" } : { ok: false, code: "SAME_RUN" };
  }

  if (sameRound) return { ok: true, code: "SAME_ROUND_OVERRIDE" };
  if (!entry || String(entry.comment_id) !== String(commentId)) return { ok: true, code: "UNTRACKED" };
  // The comment records a build and this amend names none: comparing is impossible, and the
  // same-day retest of a new build is exactly what slips through an unchecked amend.
  if (theirs && !mine) return { ok: false, code: "NO_ARTIFACT_AMEND" };
  if (known) return mine === theirs ? { ok: true, code: "WITHIN_ROUND" } : { ok: false, code: "NEW_ROUND_AMEND" };
  if (stale) return { ok: false, code: "STALE_AMEND" };
  // A different session editing a fresh comment, with no build to compare, is the same-day
  // shape of VCST-5883 — refuse it like a post would be, unless the caller names the round.
  return provablyDifferentRun(run, entry) ? { ok: false, code: "OTHER_RUN_AMEND" } : { ok: true, code: "FRESH" };
}

function provablyDifferentRun(run, entry) {
  return Boolean(run && run !== "local" && entry?.run_id && entry.run_id !== "local" && entry.run_id !== run);
}

/**
 * The entry to judge an amend against. The ledger is per checkout, so a comment posted from
 * another worktree or clone is missing here, and an entry written by an older amend may have
 * no posted_at — both would read as FRESH forever. Jira's own `created` time fills the gap.
 */
export function effectiveEntry(existing, commentId, remote) {
  const tracked = existing && String(existing.comment_id) === String(commentId);
  if (tracked && existing.posted_at) return existing;
  if (!remote?.created) return existing;
  return tracked
    ? { ...existing, posted_at: remote.created }
    : { comment_id: String(commentId), run_id: "local", posted_at: remote.created };
}

/**
 * What the ledger holds for the ticket after a successful amend. The ledger tracks the CURRENT
 * round's comment, so amending an older one (a typo in round 1) must not replace it — that would
 * make the next same-round post look like a new round. Only the tracked comment, or one newer
 * than it (this checkout's ledger is stale), takes the entry.
 */
export function ledgerAfterAmend(recorded, judged, opts) {
  const tracked = recorded && String(recorded.comment_id) === String(opts.id);
  const newer = (Date.parse(judged?.posted_at ?? "") || 0) > (Date.parse(recorded?.posted_at ?? "") || 0);
  return !recorded || tracked || newer ? amendEntry(judged, opts) : recorded;
}

/** The ledger entry after a successful amend: the build it now reports, never the first one. */
export function amendEntry(entry, { id, run, artifact, sameRound, now = Date.now() }) {
  return {
    ...(entry ?? {}), comment_id: String(id), run_id: run, amended_at: new Date(now).toISOString(),
    ...(norm(artifact) ? { artifact: norm(artifact) } : {}),
    ...(sameRound ? { same_round_reason: sameRound } : {}),
  };
}
