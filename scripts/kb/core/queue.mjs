// The queue and the log -- one file, because in this design they are the same file (PLAN §7).
//
// Every verb appends exactly ONE JSONL line, and THE LINE RECORDS THE OUTCOME, INCLUDING THE
// FAILURES. Logging only successes would systematically under-report exactly the events the report
// exists to surface: a miss is the highest-value line in the file, and a capture refused as a
// duplicate is a ranking miss that did NOT become a duplicate -- neither is a success and both are
// the point.
//
// The queued MUTATIONS (capture / confirm / dispute) live in the same file as the log lines,
// because a session's changes and its account of them are one record and splitting them lets one
// ship without the other. The pusher reads the file, takes the mutation lines, and writes the
// whole file into the base as that session's log.
//
// WHAT A LINE NEVER CARRIES: entry bodies. Ids and subjects only. That keeps volume at the
// measured ~164 B/line and keeps claim prose out of a second place where it could drift.
//
// AND THE BASE IS PUBLIC, so everything here is public. The `question` field is stored VERBATIM --
// a hashed or redacted question makes the miss panel worthless, and the miss panel is the point of
// the whole exercise. What makes that acceptable is the pre-push secret gate (vendor/agent-log/),
// run over this file BEFORE the push, plus the fact that these questions are about a public
// product. Extending the base to client deployments must re-decide it first (PLAN §7, §11).

import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { cachedWho } from './who.mjs';

/** Operations that are logged. `stat` is deliberately absent: an operator looking at the tool is
 *  not an agent using the base, and logging it would put noise in the panel that matters. */
export const LOGGED = Object.freeze([
  'ask', 'show', 'capture', 'capture-refused', 'confirm', 'dispute', 'flush', 'reindex', 'redacted',
  // `capture-invalid` is a capture the base turned away AT THE DOOR — a missing field, an unusable
  // anchor, no scope — as opposed to `capture-refused`, a well-formed capture deduplicated against
  // an entry the base already holds. Unlogged until 2026-09-23 (PLAN §23.11); see `refuseAtDoor`.
  'capture-invalid',
  // `session` is the DENOMINATOR, and it is the one kind written about a session that may never
  // have touched the base at all. Every other line here is evidence that the base was used, so a
  // log made only of them can count uses and can never count opportunities: a session that ran for
  // an hour and asked nothing looked exactly like no session (`report-analyse.mjs` counted
  // `sessions` as the distinct sessions APPEARING IN THE LOG). One line per session, carrying
  // integers and an id — see `reach.mjs` for what is read to produce it, and what is not.
  'session',
  // `restart` names a COUNTER DISCONTINUITY in the reach state -- the transcript was replaced, the
  // state was dropped after publication, or it was absent for no known reason (PLAN §23.6). Written
  // by the Stop hook through `reach.mjs`, never by a verb.
  'restart',
]);

/** Lines the pusher must apply to the base, as opposed to lines that only describe what happened. */
export const MUTATIONS = Object.freeze(['capture', 'confirm', 'dispute']);

/**
 * Is this run a BENCHMARK, a demo or an acceptance test rather than an agent doing work?
 *
 * PLAN §14.2, measured on this base's first 12 log files: six questions appear five times each --
 * 30 of the 39 asks are one latency benchmark, pushed through the same path as real traffic. So
 * the demand log's top six rows were a stopwatch, and §14.1's own denominator was 39 where real
 * demand was 9.
 *
 * MARKED, NOT DROPPED, and the distinction is the whole design. A benchmark must still exercise
 * the real queue, the real push and the real flush -- that is what makes it representative, and a
 * benchmark that writes nowhere measures a path nobody uses. What it must not do is enter the
 * DEMAND panels. So the line is written exactly as any other and carries one extra field; the
 * report filters on it and SAYS how many it filtered, so the number is auditable rather than
 * invisible. A dropped line cannot be checked by anybody; a marked one can.
 *
 * It is an env var and not a flag because it has to reach the MCP server, which nobody passes
 * arguments to: `KB_SYNTHETIC=1` on the harness that spawns the run covers both doors at once.
 */
export const isSynthetic = (env = process.env) => /^(1|true|yes|on)$/i.test(String(env.KB_SYNTHETIC ?? '').trim());

/**
 * THE OFF SWITCH (PR #313 review). `KB_ENABLED=0` — set durably in `.claude/settings.local.json`
 * `env`, which reaches hooks and MCP servers as well as the session — takes this machine out of the
 * base's WRITE side entirely: nothing is queued, nothing is pushed or swept, the `Stop` hook does
 * nothing, and `kb-register` removes the `kb` server from `.mcp.json` instead of adding it.
 * Reading stays possible through the CLI, because reading a public repo sends nothing.
 *
 * Default ON (opt-out), and only an explicit falsy literal turns it off: an unset or mistyped value
 * leaves the team default in place rather than silently opting somebody out.
 */
export const kbDisabled = (env = process.env) => /^(0|false|no|off)$/i.test(String(env.KB_ENABLED ?? '').trim());

/**
 * THE OPERATOR'S YES, opt-in (PR #313 review). `KB_PUSH_CONFIRM=1` holds every push that has no
 * one to ask — the `Stop` hook, the sweep, the server's timer and shutdown — and leaves the queue
 * as it is. Only `npm run kb -- push` in a terminal publishes, after showing the plan and getting a
 * `y`. Off by default: the team default is autonomous publication behind the secret-and-host gate
 * and the pinned write target; this is for whoever wants to read every commit first.
 */
export const pushConfirmRequired = (env = process.env) => /^(1|true|yes|on)$/i.test(String(env.KB_PUSH_CONFIRM ?? '').trim());

export const HELD_WHY = 'KB_PUSH_CONFIRM=1 — held for the operator; run `npm run kb -- push` in a terminal to review and send.';

/** What every refused write says, so the CLI, the MCP text and the push all name the same switch. */
export const DISABLED_WHY = 'KB_ENABLED=0 on this machine — nothing is queued or published. Unset it to take part again.';

/**
 * WHAT RUN THIS WAS -- an opaque operator-set handle that JOINS this log to something outside it.
 *
 * Reading the published base as an outsider on 2026-09-21, nothing said what the work was about.
 * That the 07:22-08:15 window concerned a configurable-product order was inferred from the question
 * TEXTS and from nothing else. That works at nine asks and it does not work at five hundred, and
 * PLAN §15's check wave already wants to scope to a wave of sessions and has to approximate it with
 * a date range.
 *
 * NEVER PARSED, and that is the whole of its contract. `VCST-1234`, `PR#313`, a branch name, a URL
 * -- whatever the operator wants. This tool does not validate its shape, does not recognise a
 * ticket and does not normalise a case. The moment it interprets the value it has an opinion about
 * what a run is, and the field's entire value is that it has none: it is a pointer, and only the
 * thing it points AT knows what it means. Trimmed, because whitespace is an operator who meant to
 * say nothing and `run: ""` would read as a run whose name is empty.
 *
 * BOUNDED, THOUGH -- and the earlier "does not truncate it" was wrong to promise otherwise. This
 * lands in a PUBLIC, APPEND-ONLY log where a line cannot be edited or withdrawn, and it is read
 * straight out of the environment, so nothing between the shell and the file has an opinion about
 * its size. An unbounded field on that path is not a pointer, it is an aperture: `KB_RUN` set from
 * a pasted command, a CI job's whole context block or an accidentally-expanded variable publishes
 * whatever it held, once, forever. §7's rule is ids and subjects only, never prose, and a length
 * bound is the only half of that a machine can enforce.
 *
 * A BOUND, NOT A VALIDATOR, which is why it is generous. `RUN_MAX` is set well clear of every shape
 * this field is FOR -- a ticket key, a PR ref, a branch name, a GitHub URL -- so a real handle is
 * never touched and the cap is only ever felt by a value that was not a handle. Truncated rather
 * than dropped, for `label()`'s reason in `verbs.mjs`: the operator did name a run, the only defect
 * is length, and the cut is deterministic, so every line of one session still carries the same
 * string and still joins.
 *
 * AN ENV VAR AND NOT AN ARGUMENT, for the reason `KB_SYNTHETIC` is one: it has to reach the MCP
 * server, which nobody passes arguments to. `KB_RUN=VCST-1234` on the shell or the harness that
 * spawns the session covers both doors at once, and covers every line -- including the `flush` and
 * `session` lines no agent ever calls a verb for.
 *
 * IT IS THE OPERATOR'S FIELD AND `topic` IS THE AGENT'S, and conflating the two is what makes this
 * area feel slippery. A run handle is a POINTER to a ticket or a branch; a topic is a DESCRIPTION
 * of the work. One is set once for a whole session by the person who knows the ticket number, the
 * other changes when the work changes and is written by the participant that holds the meaning.
 * See `topicOf()` in `verbs.mjs` for the other half.
 */
export const RUN_MAX = 120;
export const runOf = (env = process.env) => String(env.KB_RUN ?? '').trim().slice(0, RUN_MAX).trim();

/**
 * How many characters of the host id the short key keeps.
 *
 * Eight, unchanged -- what changed is WHICH eight. Exported because the test asserts the width and
 * a transcribed `8` there would be a constant with a source of truth one file away.
 */
export const KEY_LEN = 8;

/**
 * A leading `<word>_` on a host session id is a MARKER, not identity.
 *
 * THE DEFECT THIS EXISTS TO CLOSE, measured on the published base. `sessionId()` used to slice the
 * host id to `KEY_LEN` characters flat:
 *
 *     CLAUDE_CODE_HOST_SESSION_ID = local_f3d05dd3-25c1-434b-a7ca-4a3d55032484
 *     sessionId()                 = local_f3
 *
 * Six of those eight are the constant `local_`, so a session was identified by TWO HEX CHARACTERS
 * -- 256 values, for every person, every day, forever. Counted 2026-09-21 over
 * `VirtoCommerce/vc-knowledge`: 53 log files, 18 distinct ids, 16 of them of the `local_XX` shape,
 * which by the birthday bound puts the chance that two different sessions already share one at
 * 0.38. AND A COLLISION IS UNDETECTABLE AFTER THE FACT, because only the truncated id is ever
 * stored -- "has this already happened?" is not a question the base can answer. It had bitten once
 * already: `cas-probe.mjs` gave four concurrent processes `cas113496<i>` and all four collapsed to
 * `cas11349` (PLAN 20.6).
 *
 * Matched generically and never as the literal `local_` (`.claude/rules/test-data.md` GOLDEN RULE):
 * the marker is whatever the host puts in front of the underscore, and hard-coding today's value
 * would go stale silently the day it changes -- manufacturing a confident wrong key rather than an
 * error.
 */
const MARKER = /^[A-Za-z]+_/;

/**
 * The key becomes a PUBLIC PATH (`log/<YYYYMMDD>-<key>.jsonl`), so it has to be one. (Between STEP
 * 3c and 2026-09-23 it was a directory name too; the rule below was written for that and still
 * holds for the flat name.)
 *
 * The same lesson `publicLocator()` cost us (PLAN 7.1a): ask what a field can CARRY, not only what
 * the scanner can find. A host id is machine-generated and safe today; a key with a separator in it
 * would silently nest the queue file one directory down and write a log path nobody can parse back.
 * An unsafe key is not repaired into something plausible -- it falls through to the honest
 * per-process id. `outsideBase()` is the second line of that defence and it now catches more, not
 * less: a `.` or `..` key is a rejected SEGMENT under the nested path where the flat one published
 * it as a merely strange file name.
 */
const FILENAME_SAFE = /^[A-Za-z0-9_-]+$/;

/**
 * Host session id -> the short key everything is partitioned by. Pure, so the derivation is what
 * the test pins.
 *
 * STILL A GENUINE PREFIX OF THE REAL ID, never a hash: the key stays recognisable next to the id it
 * came from and greppable against it. Same width, 4 billion values instead of 256.
 *
 * The marker is stripped only when what remains still carries a full key's worth of characters.
 * `local_ab` strips to `ab`, and answering with two characters is the defect again with extra
 * steps -- the raw id is no less distinguishing and is stable, so it wins.
 *
 * THE SAFETY CHECK RUNS ON THE WHOLE ID, BEFORE THE CUT, and the order is the entire point. Tested
 * after the slice, the check only ever saw the first `KEY_LEN` characters -- so an id whose unsafe
 * character sat past that boundary was CUT INTO SAFETY and published: `local_ab.cd` became
 * `local_ab`, a plausible-looking key that no id in the base is a prefix of, which is the exact
 * shape of wrongness this whole file is written against. Found 2026-09-22 by the independent review
 * (PLAN §22.3). Checking first makes the guard mean what it says: an id this tool cannot represent
 * is REFUSED, and `sessionId()` falls through to the honest per-process id.
 */
export function shortSession(hostId) {
  const id = String(hostId ?? '').trim();
  const stripped = id.replace(MARKER, '');
  const source = stripped.length >= KEY_LEN ? stripped : id;
  return FILENAME_SAFE.test(source) ? source.slice(0, KEY_LEN) : '';
}

/**
 * Session identity is free: `CLAUDE_CODE_HOST_SESSION_ID` is inherited by child processes, so the
 * tool knows its own session without being told. The prior art's measured pain -- one missed
 * prefix drops a question row silently, 25 times out of 25 -- simply does not arise.
 *
 * The fallback is a per-process id, which is honest: it says "this run", which is the most a
 * process outside a Claude session can truthfully claim. It also catches the two ways the env var
 * can be present and useless -- blank, or unusable as a file name -- because a key that cannot be
 * a path is worth less than an admission that there was no session.
 */
export function sessionId(env = process.env) {
  const raw = env.CLAUDE_CODE_HOST_SESSION_ID || env.CLAUDE_SESSION_ID;
  return shortSession(raw) || `p${process.pid}`;
}

/**
 * Where the queue lives. A scratchpad, never the repo: these files are transient, they are swept
 * by the push, and a queue in the working tree would show up in `git status` and be committed by
 * somebody tidying up.
 */
export function queueDir(env = process.env) {
  return env.KB_QUEUE_DIR || join(tmpdir(), 'claude-kb-queue');
}

export function queuePath(env = process.env) {
  return join(queueDir(env), `${sessionId(env)}.jsonl`);
}

/**
 * Append one line. Never throws: a tool that fails an ASK because it could not write its own log
 * has traded the thing the user wanted for bookkeeping. A failed write is reported on the result
 * instead, so it is visible without being fatal.
 *
 * `who` OVERRIDES THE WRITER'S OWN IDENTITY, and exists for exactly one caller. Almost every line
 * is written by the session it is about, so "who wrote this" and "whose line is this" are the same
 * person and the default is right. The `session` line is not: it describes a session that has
 * ENDED and is published by whichever later session sweeps it (`push.mjs`), so stamping the writer
 * there would name the wrong person with complete confidence — the exact failure that ruled out
 * using the commit author in the first place (`who.mjs`). Passing `null` records no identity;
 * passing nothing means "use mine".
 *
 * `run` TAKES THE SAME ESCAPE HATCH AND FOR THE SAME ONE CALLER. No verb may set it -- it is the
 * operator's handle, read straight from the environment, so a verb can neither omit it nor invent
 * one. The `session` line is the same exception it is for `who`: it describes a session that has
 * ENDED and is published by whoever sweeps it, possibly under a different `KB_RUN` or none at all,
 * so the handle is stamped onto the reach state by that session's own hook (`reach.mjs`) and
 * passed back in here. A swept QUEUE file is not re-stamped either, for the plainer reason that
 * its lines already carry the run they were written under.
 */
export async function log(record, { env = process.env, who, run } = {}) {
  // Off means off: a line queued while disabled would be published the moment the switch is
  // unset, which is the opposite of what turning it off asked for.
  if (kbDisabled(env)) return { ok: false, disabled: true, path: queuePath(env), line: null, why: DISABLED_WHY };
  // All three marks are stamped LAST and by the single writer, so no verb can forget one and no
  // verb can fake one: `synthetic` because an env var must cover every line a benchmark run
  // produces including its flush, `run` for the same reason one level up -- a run handle that only
  // rode on the verbs an agent happens to call would miss the `flush` and `session` lines, which
  // are exactly the ones an outsider reads first -- and `who` because an identity a verb could
  // choose to omit is an identity that will be omitted.
  const me = who === undefined ? cachedWho({ dir: queueDir(env), env }) : who;
  // The passed-in handle takes the SAME bound as the environment one. It arrives from the reach
  // state a hook wrote, which is this process's own file rather than an argument a caller chose --
  // but it originated as `KB_RUN` in some earlier session, and a bound that one of two doors skips
  // is a bound the log does not have.
  const handle = run === undefined ? runOf(env) : String(run ?? '').trim().slice(0, RUN_MAX).trim();
  const line = {
    at: new Date().toISOString(),
    ...record,
    ...(handle ? { run: handle } : {}),
    ...(me ? { who: me } : {}),
    ...(isSynthetic(env) ? { synthetic: true } : {}),
  };
  const path = queuePath(env);
  try {
    await mkdir(queueDir(env), { recursive: true });
    await appendFile(path, `${JSON.stringify(line)}\n`, 'utf8');
  } catch (err) {
    return { ok: false, path, line, why: `${err.code ?? 'EUNKNOWN'}: ${err.message}` };
  }
  if (line.kind === 'ask') await noteAsk(env, line.at, line.q);
  return { ok: true, path, line };
}

// ── the session's sidecar: what must outlive a flush ──────────────────────────────────────────

/**
 * `<session>.meta.json`, beside the queue. NOT a `.jsonl`, so `queueFiles()` and the flush hook
 * step over it, and the flush — which deletes the queue file — never touches it.
 *
 * It exists for ONE field today, and that is the only reason it exists (PLAN §23.5). A capture's
 * `after` points at the ask it is about, and it used to be found by scanning the LOCAL QUEUE — which
 * the flush empties every five minutes. So a capture made more than a flush after its ask carried no
 * pointer: measured over the published log, 12 of 21 captures since the field existed, exactly the
 * ones in a session's second push. Since `af62443a` the `unhelpful` panel pairs ONLY via `after`,
 * so each of those was counted `unprompted` when it was nothing of the kind.
 *
 * It holds the session's ASKS, `at` and `q`, and not only the last `at` — because the last ask is
 * the wrong one to point at (PLAN §23.11). Run `cdb27d99` (2026-09-23) wrote three captures within
 * a minute of one answered ask, and all three pointed at it: one was about that ask, one answered an
 * orchestrator's MISS fifty minutes earlier, and one followed no ask at all. Choosing among asks
 * needs their words, and the words are gone from the queue once it is flushed. They never leave
 * this machine from here: the sidecar is local, and the same `q` is already on the ask's own line.
 */
export const metaPath = (env, session = sessionId(env)) => join(queueDir(env), `${session}.meta.json`);

/** The sidecar, or `{}`. A torn or missing file is an absent pointer, never a failed verb. */
export async function readMeta(env = process.env, session = sessionId(env)) {
  try {
    const j = JSON.parse(await readFile(metaPath(env, session), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

/**
 * How many of the session's asks the sidecar remembers. A capture is about something asked in the
 * same stretch of work; the busiest session in the published log asked 34 times in a day, so this
 * bound is a ceiling on the file, not a window anybody's evidence falls out of.
 */
export const ASK_MEMORY = 100;

/** The asks the sidecar holds, oldest first, as `{at, q}`. A torn or pre-2026-09-23 sidecar is `[]`. */
export const metaAsks = (meta) => (Array.isArray(meta?.asks) ? meta.asks : [])
  .filter((a) => a && typeof a.at === 'string' && a.at);

/**
 * Record the ask just written. Best effort in the strict sense: a sidecar that could not be written
 * costs a later capture its pointer — which is what happened on every flush before this — and must
 * never cost the ask.
 */
async function noteAsk(env, at, q) {
  try {
    const meta = await readMeta(env);
    const asks = [...metaAsks(meta), { at: String(at), q: String(q ?? '') }].slice(-ASK_MEMORY);
    await writeFile(metaPath(env), JSON.stringify({ ...meta, asks }), 'utf8');
  } catch { /* the pointer is lost, the ask is not */ }
}

// ── what the last push did: the only trace a detached push leaves ─────────────────────────────
//
// A push runs detached from the `Stop` hook, from an unawaited sweep, or on the server's timer —
// none of them has anybody reading its output. For a TRANSIENT failure that is fine: the queue is
// durable and the next session sweeps it. For a PERSISTENT one it is a black hole (PR #313 review):
// a token without push rights answers 403 on every attempt, every capture reports `queued`, and
// the queue grows in tmpdir until the OS clears it — with the operator believing it all landed.
// So every push outcome is written HERE, and `kb stat` reads it back.

/** Beside the queue, and NOT a `.jsonl`, so nothing ever sweeps or publishes it. */
export const pushStatusPath = (env = process.env) => join(queueDir(env), 'last-push.json');

/** States that mean "the queue did not drain" — sticky in `lastFailure` until a push lands. */
export const PUSH_FAILURES = Object.freeze(['failed', 'foreign-base', 'no-base', 'no-token']);

/** The recorded status, or `{}`. A torn or missing file is "never recorded", never an error. */
export function readPushStatus(env = process.env) {
  try {
    const j = JSON.parse(readFileSync(pushStatusPath(env), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

/**
 * Record one push outcome. `last` is always overwritten; `lastFailure` is kept until a push LANDS,
 * so a failure is not hidden by a later "nothing to do". Only the state, a short why, the commit and
 * a count are stored — never a line, a payload or a token.
 */
export async function recordPush(r, { env = process.env, at = new Date() } = {}) {
  try {
    const prev = readPushStatus(env);
    const row = {
      at: at.toISOString(),
      state: r?.state ?? 'unknown',
      ...(r?.why ? { why: String(r.why).slice(0, 300) } : {}),
      ...(r?.commit ? { commit: r.commit } : {}),
      ...(Number.isFinite(r?.queued) ? { queued: r.queued } : {}),
    };
    const failed = PUSH_FAILURES.includes(row.state);
    const next = {
      last: row,
      lastFailure: failed ? row : row.state === 'pushed' ? null : (prev.lastFailure ?? null),
      ...(row.state === 'pushed' ? { lastPushed: row } : prev.lastPushed ? { lastPushed: prev.lastPushed } : {}),
    };
    await mkdir(queueDir(env), { recursive: true });
    await writeFile(pushStatusPath(env), JSON.stringify(next, null, 2), 'utf8');
  } catch { /* the status is a report, never a reason a push fails */ }
}

/**
 * Every queue file waiting in the directory — this session's and anybody else's — with its depth
 * and the `at` of its oldest line. Synchronous and read-only: `stat` reports, it never sweeps.
 */
export function queueBacklog(env = process.env) {
  const out = { files: 0, lines: 0, oldest: null };
  let names = [];
  try { names = readdirSync(queueDir(env)); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    let text = '';
    try { text = readFileSync(join(queueDir(env), name), 'utf8'); } catch { continue; }
    let n = 0;
    for (const raw of text.split('\n')) {
      if (!raw.trim()) continue;
      n += 1;
      try {
        const at = JSON.parse(raw)?.at;
        if (typeof at === 'string' && (!out.oldest || at < out.oldest)) out.oldest = at;
      } catch { /* a torn line still counts toward depth */ }
    }
    if (n) { out.files += 1; out.lines += n; }
  }
  return out;
}

/**
 * Read this session's queue back -- used by `stat` for the depth, and by the pusher later.
 *
 * `raw` is the exact bytes that were read. The pusher needs them to release ONLY what it consumed:
 * the queue has writers that hold no lock (the MCP server's verbs, a CLI call, the `Stop` hook's
 * detached push), so the file can grow between this read and a successful push, and deleting it
 * whole destroyed whatever arrived in that window (PR #313 review) -- typically the capture that
 * follows an ask by seconds. See `releaseConsumed`.
 */
export async function readQueue({ env = process.env, path = null } = {}) {
  const file = path ?? queuePath(env);
  if (!existsSync(file)) return { path: file, lines: [], malformed: 0, raw: Buffer.alloc(0) };
  let raw;
  try { raw = await readFile(file); } catch (err) {
    // Rotated away between the existence check and the read: another pusher has it.
    if (err.code === 'ENOENT') return { path: file, lines: [], malformed: 0, raw: Buffer.alloc(0) };
    throw err;
  }
  const text = raw.toString('utf8');
  const lines = [];
  let malformed = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw));
    } catch {
      // A truncated last line from an interrupted write. Counted, not thrown: one unreadable line
      // must not cost the session its whole log.
      malformed += 1;
    }
  }
  return { path: file, lines, malformed, raw };
}

/**
 * After a successful push, drop exactly the bytes that push read -- never the whole file.
 *
 * ROTATE, THEN INSPECT. The file is renamed away first, which is atomic: from that instant every
 * later append creates a fresh queue file instead of landing in the one being inspected, so there
 * is no window in which a line can be both unread and deleted. The renamed copy is then compared
 * with what the push consumed:
 *
 *   * it STARTS WITH the consumed bytes -> only the tail past them is new, and it is appended back;
 *   * it does NOT -> this is not the file the push read (another pusher already rotated it), so all
 *     of it goes back. Re-publishing a line is safe: log lines merge in `unionLines` and a repeated
 *     evidence item is skipped by `applyQueue`, so a line is never lost and never counted twice.
 *
 * Appending the tail back can put it AFTER lines written in the meantime; `orderQueue` restores
 * write order by each line's own `at` before anything is applied.
 */
export async function releaseConsumed(path, consumed) {
  const aside = `${path}.${process.pid}-${Date.now()}.released`;
  try { await rename(path, aside); } catch (err) {
    if (err.code === 'ENOENT') return { released: 0, kept: 0 };
    throw err;
  }
  const now = await readFile(aside);
  const ours = consumed && now.length >= consumed.length && now.subarray(0, consumed.length).equals(consumed);
  const tail = ours ? now.subarray(consumed.length) : now;
  if (tail.length) await appendFile(path, tail);
  await rm(aside, { force: true });
  return { released: ours ? consumed.length : 0, kept: tail.length };
}

/**
 * Queue lines in WRITE order, by their own `at` (an ISO-ms stamp minted by `log()`). Stable, so
 * lines of one millisecond keep file order; a line with no usable `at` inherits its predecessor's,
 * so it stays where it was rather than jumping to one end.
 */
export function orderQueue(lines) {
  let last = '';
  const keyed = lines.map((line, i) => {
    const at = typeof line?.at === 'string' && line.at ? line.at : last;
    last = at;
    return { line, at, i };
  });
  keyed.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.i - b.i));
  return keyed.map((k) => k.line);
}

/** How many queued changes are waiting to be pushed -- the number `stat` prints. */
export const pendingMutations = (lines) => lines.filter((l) => MUTATIONS.includes(l.kind)).length;
