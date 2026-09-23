// WHO WROTE THE LINE (PLAN §21.7 item 2, STEP 2).
//
// Reading the published base as an outsider, nothing in a log line said who produced it.
//
// THE IDENTITY WAS ALREADY RECOVERABLE AND THAT WAS NOT ENOUGH, which is the part worth writing
// down because the obvious answer looks sufficient. It is the commit author: measured on a clone
// of `VirtoCommerce/vc-knowledge` on 2026-09-21, `git log --format='%an <%ae>'` gives 47 commits
// as `Danil Bayushev <110034308+Dan-BV@users.noreply.github.com>` and 3 as the same person under
// their work address — one person, already two strings. Two reasons it cannot be the answer:
//
//   1. THE REPORT NEVER SEES IT. `report-fetch.mjs` reads log FILES over HTTP. Git metadata is not
//      in the file, so no panel can use it however correct it is.
//   2. THE PUSHER IS NOT ALWAYS THE ASKER — and this is the real one. A queue file left behind by
//      one session is swept by ANOTHER (`sweepIfDue` in `push.mjs`), possibly on a different
//      machine under a different person's token. Commit authorship then names the wrong person
//      with complete confidence, which is worse than naming nobody.
//
// So the identity is stamped ON THE LINE WHEN THE LINE IS WRITTEN, by `queue.mjs`'s single writer,
// and a swept file arrives at the base already carrying whoever wrote it.
//
// ── WHAT IS RECORDED, AND WHAT IS NOT ────────────────────────────────────────────────────────
//
// A GITHUB HANDLE AND NOTHING ELSE. §7 permits ids, counts and short labels; a handle is an id,
// and it is already in every commit of this PUBLIC base, so there is no new exposure. An email, a
// machine name, a local path or an OS user are none of §7's business and some of them are not
// public today — `publicLocator()` cost us that lesson once already (PLAN §7.1a: ask what a field
// can CARRY, not only what the scanner can find).
//
// NO TOKEN ⇒ NO IDENTITY, AND THAT IS CORRECT RATHER THAN DEGRADED. Reads are tokenless by design
// (PLAN §6.4) and a reader writes nothing worth attributing. A tokenless session logs exactly as
// it always did, one key shorter.
//
// ── THE TRAP, NAMED ON THE FIELD ITSELF ──────────────────────────────────────────────────────
//
// The `login` recorded is WHOSEVER TOKEN IS CONFIGURED, which on a shared machine or a CI runner
// is not necessarily the person at the keyboard. That is a limit of the mechanism, not a bug: it
// is the same limit `git` has, and it is why the field is called `who` and not "the human who
// asked".
//
// ── WHY THE NETWORK CALL IS NOT ON THE LOGGING PATH ──────────────────────────────────────────
//
// `log()` is called on the hot path of every `ask`, and the lookup is a network round trip
// (measured 577 ms cold against `api.github.com` on 2026-09-21). So the two halves are split:
//
//   * `resolveWho()` — ASYNC, may call the API, writes the cache. Called ONCE, by a door
//     (`kb.mjs`'s `main`, `mcp.mjs`'s dispatch chain), before any verb runs.
//   * `cachedWho()`  — SYNC, filesystem only, NEVER the network. This is what `log()` calls.
//
// That split is also what keeps the unit suite offline: an in-process test writes queue lines
// without ever going through a door, so it never reaches the API at all — it reads an empty cache
// and stamps nothing.
//
// THE CACHE LIVES IN THE QUEUE DIRECTORY, which is shared across sessions on one machine and is
// never in the working tree (PLAN §7). So the first session to resolve a handle pays for every
// session after it, including the sweeps, and nothing lands in `git status`. It is not a `.jsonl`
// file, so `queueFiles()`'s filter steps over it exactly as it does over `.last-flush`.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { viewer } from './github-api.mjs';
import { writeToken } from './token.mjs';

/**
 * How long a resolved handle is trusted before it is looked up again.
 *
 * A login is a property of the token and does not normally change, so this is not freshness in the
 * usual sense — it is the only thing that would ever notice a GitHub rename. A week costs one API
 * call per machine per week, which is cheaper than being wrong for as long as a temp directory
 * survives.
 */
export const WHO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a token we have NEVER resolved is left alone after a failed attempt.
 *
 * Without this, an offline machine pays the full deadline on every single CLI invocation — the CLI
 * is one process per command, so an in-process memo does not help it. Ten minutes is the same
 * shape of answer as the sweep's pacing (PLAN §7): the cadence IS the retry policy.
 */
export const WHO_RETRY_MS = 10 * 60 * 1000;

/**
 * The lookup's own deadline, and it is enforced HERE rather than only by `AbortSignal`.
 *
 * A transport that ignores its abort signal — an injected one in a test, a stuck proxy — would
 * otherwise hold a door open indefinitely. The acceptance for this field is that a slow lookup
 * degrades to "no identity" and never to a failed verb, and a promise nobody bounds cannot make
 * that promise. Three seconds against a measured 577 ms cold call.
 */
export const WHO_TIMEOUT_MS = 3_000;

/** Where the handle is cached. Not `.jsonl`, so the sweep steps over it. */
export const whoPath = (dir) => join(dir, '.identity.json');

/**
 * Which token a cached handle belongs to.
 *
 * NOT the token, and not a prefix of it: a one-way digest, truncated, so a stale cache written
 * under somebody else's credential can be DETECTED and ignored rather than silently believed. On
 * a shared machine that is the difference between "no identity" and "the wrong person's".
 */
export const fingerprint = (token) => createHash('sha256').update(String(token)).digest('hex').slice(0, 16);

/** The cache record, or null when there is none, it does not parse, or it is not one of ours. */
export function readWhoCache(dir) {
  try {
    const raw = JSON.parse(readFileSync(whoPath(dir), 'utf8'));
    return raw && typeof raw === 'object' && typeof raw.fp === 'string' ? raw : null;
  } catch {
    // A torn or hand-mangled cache is not worth failing anything over: the worst case is one extra
    // lookup, and the worst case of trusting it is the wrong handle on a public line.
    return null;
  }
}

function writeWhoCache(dir, record) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(whoPath(dir), `${JSON.stringify(record)}\n`, 'utf8');
  } catch { /* best effort: a cache that cannot be written costs a lookup, never a line */ }
}

/**
 * Is this record still good enough to use without asking GitHub again?
 *
 * Two clocks on one field, because the two cases are not the same question: a record that HOLDS a
 * handle is good for `WHO_TTL_MS`, a record that has never held one is retried after
 * `WHO_RETRY_MS`.
 */
function fresh(record, nowMs) {
  const age = nowMs - Date.parse(record?.at ?? '');
  if (!Number.isFinite(age) || age < 0) return false;
  return age < (record.who ? WHO_TTL_MS : WHO_RETRY_MS);
}

/**
 * The handle this process's lines should carry — SYNC, filesystem only, never the network.
 *
 * Returns null for every uncertainty there is: no token, no cache, a cache written under another
 * token, a cache too old to trust. Null means the line carries no `who`, which is the honest
 * answer and the one the acceptance asks for.
 *
 * NOT MEMOISED, deliberately. It reads four small env files and one ~80-byte JSON per call, which
 * is the same order of cost as the `appendFile` the caller is about to do anyway — and a memo
 * would have to be invalidated by `resolveWho` writing the cache, by a test seeding it, and by a
 * changed `env`, which is three ways to serve a handle that is no longer true in order to save
 * microseconds.
 */
export function cachedWho({ dir, env = process.env, nowMs = Date.now() } = {}) {
  if (!dir) return null;
  const { token } = writeToken(env);
  if (!token) return null;
  const record = readWhoCache(dir);
  if (!record || record.fp !== fingerprint(token)) return null;
  return fresh(record, nowMs) && typeof record.who === 'string' && record.who ? record.who : null;
}

/**
 * Bound a promise with a deadline, resolving to a result rather than rejecting or hanging.
 *
 * THE TIMER IS NOT `unref`ed, AND THAT WAS A BUG BEFORE IT WAS A DECISION. Unreffing looks like
 * the careful choice — "never hold a process open for bookkeeping" is the rule everywhere else in
 * this system. It is wrong here, and the test that never answers caught it: an unreffed timer is
 * skipped when nothing else keeps the loop alive, so the deadline never fires, the promise never
 * settles, and the caller awaiting it is abandoned mid-run. The timer cannot hold anything open
 * beyond `ms` anyway — it is cleared the moment the lookup settles — and the caller is blocked on
 * this promise regardless, so there is nothing to protect.
 */
function withDeadline(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'unreachable', detail: `no answer in ${ms} ms` }), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); resolve({ ok: false, reason: 'unreachable', detail: String(err?.message ?? err) }); },
    );
  });
}

/**
 * Resolve the handle once and cache it. Called by a DOOR, before any verb writes a line.
 *
 * A FAILED RE-ATTEMPT KEEPS THE HANDLE IT ALREADY HAD, and only the attempt stamp moves. The
 * alternative — replacing a known-good handle with null because GitHub was briefly down — throws
 * away the very thing this field exists to record, in exchange for nothing. The fingerprint is
 * what makes that safe: a handle is only ever kept for the token it was learned under.
 *
 * @returns {{who: string|null, from: 'cache'|'api'|'kept'|'no-token'|'unresolved', why?: string}}
 */
export async function resolveWho({
  dir,
  env = process.env,
  fetchImpl = null,
  nowMs = Date.now(),
  timeoutMs = WHO_TIMEOUT_MS,
} = {}) {
  if (!dir) return { who: null, from: 'unresolved', why: 'no queue directory' };
  const { token } = writeToken(env);
  // Not a degradation: reads are tokenless by design and a reader writes nothing to attribute.
  if (!token) return { who: null, from: 'no-token' };

  const fp = fingerprint(token);
  const cached = readWhoCache(dir);
  const mine = cached && cached.fp === fp ? cached : null;
  if (mine && fresh(mine, nowMs)) return { who: mine.who ?? null, from: 'cache' };

  const got = await withDeadline(viewer({ token, fetchImpl, timeoutMs }), timeoutMs);
  const login = got?.ok && typeof got.login === 'string' && got.login ? got.login : null;
  const who = login ?? mine?.who ?? null;
  writeWhoCache(dir, { fp, who, at: new Date(nowMs).toISOString() });
  return login
    ? { who, from: 'api' }
    : { who, from: who ? 'kept' : 'unresolved', why: got?.detail ?? 'no answer' };
}
