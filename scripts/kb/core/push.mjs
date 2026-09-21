// The flush: how a session's captures, confirmations and log lines actually reach the base.
//
// NOTHING IS LEARNED UNTIL THIS RUNS. The read path made the base readable; this is the step that
// makes it ACCUMULATE, and the log is the whole point of v1.
//
// THE SHAPE, and every clause of it is load-bearing (PLAN §2, §7):
//
//   1. READ BEFORE WRITE, AND NOT FROM THE READ CACHE. The session's cached `index.json` came from
//      `raw`, which sends `max-age=300` — it may be five minutes stale at fetch and hours stale by
//      push. Patching THAT silently drops whatever another session committed in between. So the
//      push re-reads the head, the current index and the current body of every entry it mutates,
//      through the API, at the head it is about to build on.
//   2. THE DEDUP CHECK RUNS AGAIN, against that fresh index. Session A captures at 10:00; session
//      B's cache predates it and finds nothing at 10:05. Here B finds it and CONVERTS ITS CAPTURE
//      INTO A CONFIRM. The fetch this needs is one we already make, so race-free dedup costs
//      nothing.
//   3. ONE ATOMIC COMMIT. blobs → tree → commit → ref compare-and-swap. Never a state where
//      `index.json` names an entry that is not there.
//   4. THE SECRET GATE RUNS BEFORE ANYTHING LEAVES THE MACHINE, and drops lines rather than
//      blocking the push.
//   5. A FAILED PUSH LEAVES THE QUEUE INTACT. The next session sweeps it. No hook, no
//      `.claude/settings.json` edit — which is what makes this reachable without touching the
//      riskiest file in the repo.
//
// WHAT THE QUEUE IS AND WHAT THE LOG IS. They are the same file read two ways: a queue line may
// carry a `payload` (the entry and its prose — without it there is nothing to commit), and a PUBLIC
// log line never does. `toLogLine()` in `verbs.mjs` is the ONE place that distinction lives, and
// every line is mapped through it on the way into the log blob.

import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { coordinatesOf, githubApi } from './github-api.mjs';
import { findDuplicate } from './identity.mjs';
import { parseEntry, stringifyFrontmatter } from './frontmatter.mjs';
import { buildIndex, buildRow, entryPath } from './index-build.mjs';
import { normalizeRow } from './index-load.mjs';
import { gateQueue, loadSecrets } from './secret-gate.mjs';
import { MUTATIONS, isSynthetic, log, queueDir, queuePath, readQueue, sessionId } from './queue.mjs';
import { REACH_IDLE_MS, dropReach, idleReaches, reachLine } from './reach.mjs';
import { toLogLine } from './verbs.mjs';

/** Retention: the same push that writes today's file removes anything older, in the same commit. */
export const RETENTION_DAYS = 90;

/** How stale the last flush must be before an ordinary `kb` invocation opportunistically sweeps. */
export const SWEEP_AFTER_MS = 30 * 60 * 1000;

/**
 * How old this session's OLDEST unpublished line may get before an ordinary `kb` call publishes it.
 *
 * Until 2026-09-19 there was no such rule, and the consequence was worse than it looked. The primary
 * flush fired when stdin closed, and `sweepIfDue` passed `includeMine: false` — so a session NEVER
 * published its own lines except by ending. People do not end sessions; they leave them open for
 * days, and switching away from a tab is not ending one. Worse, the two rules combined into a hole
 * with no floor: a session in ACTIVE use keeps appending, so its file is never idle for
 * `SWEEP_AFTER_MS` either, and no other session would sweep it. The more a session used the base,
 * the less likely its evidence was ever to arrive.
 *
 * Five minutes, not thirty: the staleness test on a FOREIGN file guards against reading a torn last
 * line from a writer we do not control, and none of that applies to our own queue — we are the
 * writer, and we only ever act between tool calls. So the only thing this interval trades is commit
 * frequency against how long evidence sits on one laptop, and evidence on one laptop is the failure
 * mode this whole system exists to remove.
 */
export const OWN_FLUSH_AFTER_MS = 5 * 60 * 1000;

/** One immediate retry after a blip; then stop. Three attempts total against a moving ref. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 2_000;

const pad = (n) => String(n).padStart(2, '0');

/** `2026-09-18` — the log's date folder, so "the last 30 days" is one tree read. */
export const dayFolder = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** `20260918T111003Z` — sorts lexicographically, which is why it is not the ISO string. */
export const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * Where a session's log lands.
 *
 * Date folder, UTC stamp, session id. The session id is not decoration: two sessions can start in
 * the same second, and one session can push twice — its own file plus a swept one — so a timestamp
 * alone is not collision-proof and a collision here means one session's log silently replacing
 * another's. With this naming, LOG CONFLICTS ARE STRUCTURALLY IMPOSSIBLE and the ref
 * compare-and-swap is left to cover only the genuinely shared files: `index.json` and mutated
 * entries.
 */
export const logPath = (session, at) => `log/${dayFolder(at)}/${stamp(at)}-${session}.jsonl`;

// ── the queue side ────────────────────────────────────────────────────────────────────────────

/** The stamp file that paces the sweep. Written on EVERY attempt, successful or not — see below. */
const stampFile = (env) => join(queueDir(env), '.last-flush');

/**
 * Is it time to opportunistically sweep?
 *
 * Written on every attempt and not only on success, deliberately: pacing on success alone would
 * make every `kb` invocation retry the push for as long as the network is down, which is exactly
 * the hammering PLAN §7 rules out ("no in-session retry loop"). The cadence is the retry policy.
 */
export async function shouldSweep({ env = process.env, now = () => new Date() } = {}) {
  try {
    const s = await stat(stampFile(env));
    return now().getTime() - s.mtimeMs > SWEEP_AFTER_MS;
  } catch {
    return true; // never flushed on this machine — the first invocation is as good a moment as any
  }
}

const touchStamp = async ({ env, now }) => {
  try { await writeFile(stampFile(env), `${now().toISOString()}\n`, 'utf8'); } catch { /* best effort */ }
};

/**
 * Which queue files this flush will take.
 *
 * Always this session's own. Plus any OTHER session's file that has not been touched for
 * `SWEEP_AFTER_MS` — the staleness test is what keeps a live parallel session's file out of our
 * push: reading a file that is still being appended to risks taking a torn last line, and deleting
 * it afterwards would make that loss permanent. An idle file has no such writer.
 */
export async function queueFiles({
  env = process.env, now = () => new Date(), sweep = true, includeMine = true,
} = {}) {
  const mine = queuePath(env);
  const out = includeMine ? [{ path: mine, session: sessionId(env), mine: true }] : [];
  if (!sweep) return out;
  let names = [];
  try { names = await readdir(queueDir(env)); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const path = join(queueDir(env), name);
    if (path === mine) continue;
    try {
      const s = await stat(path);
      if (now().getTime() - s.mtimeMs <= SWEEP_AFTER_MS) continue;
      out.push({ path, session: name.replace(/\.jsonl$/, ''), mine: false });
    } catch { /* vanished between readdir and stat — nothing to sweep */ }
  }
  return out;
}

// ── applying the queue to the base ────────────────────────────────────────────────────────────

/**
 * Append one evidence item to an entry's current text, preserving its prose byte for byte.
 *
 * The body is the value of the corpus and re-emitting it is the one way a mechanical mutation can
 * damage something irreplaceable — so it is sliced off the original and concatenated back, never
 * re-serialised.
 */
export function appendEvidence(text, item, where) {
  const { data, body } = parseEntry(text, where);
  const next = { ...data, evidence: [...(data.evidence ?? []), item] };
  return { text: `${stringifyFrontmatter(next)}\n${body}`, data: next };
}

/** A new entry's file. The trailing newline is added if the claim did not carry one. */
export function entryText(entry, body) {
  const prose = String(body ?? '').replace(/\s+$/, '');
  return `${stringifyFrontmatter(entry)}\n${prose}\n`;
}

/**
 * Apply the queued mutations to the freshly-read base state.
 *
 * `read(path)` returns the CURRENT text of a file in the base, or null when it is not there.
 * Everything here is pure apart from that one call, which is what lets the whole conversion rule be
 * tested without a network.
 *
 * Mutations are applied IN QUEUE ORDER against a working set, so a capture and a later confirm of
 * the same entry inside one session compose — and so does a second capture of a fact the first one
 * in this same push has just created, which the session-time check cannot catch because it only
 * ever looked at the base.
 */
export async function applyQueue({ lines, rows, read, at = new Date() }) {
  const working = rows.map((r) => ({ ...r }));                 // normalised rows, for the dedup test
  const raw = new Map(rows.map((r) => [r.id, r.rawRow]));      // the index rows as written
  const files = new Map();                                     // base-relative path -> text
  const extraLog = [];
  const problems = [];
  let converted = 0;

  const rowFor = (data, path) => {
    const built = buildRow(data, path);
    raw.set(built.id, built);
    const idx = working.findIndex((r) => r.id === built.id);
    const normalised = normalizeRow(built);
    if (idx === -1) working.push(normalised); else working[idx] = normalised;
  };

  /** Read through the working set first: a file this push already rewrote is the current one. */
  const current = async (path) => (files.has(path) ? files.get(path) : read(path));

  const addEvidence = async (id, path, item, where) => {
    const text = await current(path);
    if (text == null) { problems.push({ id, why: `${path} is not in the base — index drift` }); return false; }
    let applied;
    try {
      applied = appendEvidence(text, item, where);
    } catch (err) {
      problems.push({ id, why: `${path} did not parse: ${err.message}` });
      return false;
    }
    files.set(path, applied.text);
    rowFor(applied.data, path);
    return true;
  };

  for (const line of lines) {
    if (!MUTATIONS.includes(line.kind) || !line.payload) continue;

    if (line.kind === 'capture') {
      const { entry, body } = line.payload;
      const anchors = (entry.anchors ?? []).map((a) => a.coordinate ?? a);
      const scope = (entry.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`);

      // THE PUSH-TIME DEDUP RE-RUN (PLAN §2 "Identity"). Same function, same test, fresh rows.
      const dupe = findDuplicate(working, { anchors, scope });
      // An id collision is the same fact by the strongest signal there is — the id is minted from
      // the subject, so two entries with this id have the same subject verbatim. Writing the blob
      // would REPLACE somebody else's entry, prose and evidence and all, which no amount of dedup
      // subtlety is worth risking.
      const collision = !dupe && working.some((r) => r.id === entry.id);
      const target = dupe?.row ?? (collision ? working.find((r) => r.id === entry.id) : null);

      if (target) {
        const item = { ...(entry.evidence?.[0] ?? { method: 'observation', at: at.toISOString() }) };
        const ok = await addEvidence(target.id, target.path ?? entryPath(target.id), item, target.id);
        extraLog.push({
          at: at.toISOString(),
          kind: 'capture-refused',
          dupeOf: target.id,
          subject: entry.subject,
          why: dupe ? 'anchors+scope' : 'id-collision',
          when: 'push',
          ...(ok ? {} : { note: 'the duplicate could not be confirmed either' }),
        });
        if (ok) converted += 1;
        continue;
      }

      const path = entryPath(entry.id);
      files.set(path, entryText(entry, body));
      rowFor(entry, path);
      continue;
    }

    // confirm / dispute — one read per mutated entry, at a moment when nobody is waiting.
    const { id, path, item } = line.payload;
    await addEvidence(id, path ?? entryPath(id), item, id);
  }

  return { files, rows: working, raw, extraLog, problems, converted };
}

/** Log files whose date folder is older than the retention window. Same push, same commit. */
export function expiredLogs(paths, { at = new Date(), days = RETENTION_DAYS, prefix = '' } = {}) {
  const cut = at.getTime() - days * 24 * 60 * 60 * 1000;
  const head = prefix ? `${prefix}/log/` : 'log/';
  const out = [];
  for (const p of paths) {
    if (!p.startsWith(head)) continue;
    const day = p.slice(head.length).split('/')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const t = Date.parse(`${day}T00:00:00Z`);
    if (Number.isFinite(t) && t < cut) out.push(p);
  }
  return out.sort();
}

/**
 * The containment check, applied to EVERY push and not only the first.
 *
 * A push writes entries, the index and logs. Anything else is either a bug in the path arithmetic
 * or a payload that arrived from somewhere it should not have, and in a shared public repository
 * the correct response to both is to stop rather than to find out afterwards.
 */
export function outsideBase(paths, prefix) {
  const p = prefix ? `${prefix}/` : '';
  return paths.filter((path) => {
    // NORMALISE FIRST. `v2/entries/../../.github/workflows/gates.yml` starts with `v2/entries/`,
    // so a prefix test alone passes it — and an `id` is only as trustworthy as whatever wrote the
    // queue line. A git tree path has no legitimate `..`, `\` or leading `/`, so any of them is
    // enough on its own to refuse.
    if (/\\/.test(path) || path.startsWith('/')) return true;
    const parts = [];
    for (const seg of String(path).split('/')) {
      if (seg === '' || seg === '.') return true;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg);
    }
    const norm = parts.join('/');
    if (norm !== path) return true;
    return !(norm === `${p}index.json` || norm.startsWith(`${p}entries/`) || norm.startsWith(`${p}log/`));
  });
}

/** What the commit says it did. Mechanical, so two pushes of the same shape read the same. */
export function commitMessage({ session, captures, confirms, disputes, logs }) {
  const parts = [
    captures ? `${captures} entr${captures === 1 ? 'y' : 'ies'}` : null,
    confirms ? `${confirms} confirmation${confirms === 1 ? '' : 's'}` : null,
    disputes ? `${disputes} dispute${disputes === 1 ? '' : 's'}` : null,
    `${logs} log${logs === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return `kb: ${parts.join(', ')} (session ${session})`;
}

// ── the flush ─────────────────────────────────────────────────────────────────────────────────

/**
 * Push every queued line that is due, as one commit.
 *
 * @param {object} opts
 * @param {string} opts.base       the declared base locator; the repo is derived from it, never
 *                                 configured separately, so reading one base and writing another is
 *                                 impossible by construction rather than by discipline
 * @param {string|null} opts.token the operator's; ABSENT IS NOT AN ERROR — the queue simply waits
 *                                 for the first later session that has one (PLAN §6.4)
 * @param {Function|null} opts.gate async (plan) => boolean. The operator's yes before a real push.
 *                                 Returning false leaves the queue exactly as it was.
 */
export async function flush({
  env = process.env,
  base = null,
  token = null,
  api: injected = null,
  fetchImpl = null,
  now = () => new Date(),
  sweep = true,
  includeMine = true,
  dryRun = false,
  gate = null,
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
  sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }),
} = {}) {
  const session = sessionId(env);
  // The repo coordinates come from the READ locator, always — `injected` replaces the transport and
  // nothing else. Deriving the write target from the base the session read is what makes "you
  // cannot read one base and write to another" true by construction.
  const coords = coordinatesOf(base);
  if (!coords) {
    return { state: 'no-base', why: `${base} is not a writable base — the push targets a GitHub repo, and this locator names none` };
  }
  const prefix = coords.prefix ?? '';
  const full = (p) => (prefix ? `${prefix}/${p}` : p);

  // THE DENOMINATOR JOINS THE QUEUE HERE, so it rides every rule the rest of the queue already
  // obeys — the secret gate, the retention window, the one-commit discipline, the dry run.
  //
  // Into OUR OWN file, carrying the id of the session it describes, rather than into that session's
  // file. Appending to a foreign queue file would refresh its mtime, and `queueFiles` takes a
  // foreign file only once it has been idle for `SWEEP_AFTER_MS` — so writing there would postpone
  // the very line we just decided was ready, every time, by half an hour.
  //
  // Only when we are taking our own file at all: under an opportunistic foreign-only sweep
  // (`includeMine: false`) a line written here would sit unsent, and the next flush would write a
  // second one beside it.
  if (includeMine) {
    for (const state of idleReaches(queueDir(env), { session, now: now().getTime(), idleMs: REACH_IDLE_MS })) {
      const written = await log(reachLine(state), { env });
      // Dropped only once the line is safely appended. A state file removed after a failed write is
      // a session that silently never existed — the exact hole this whole mechanism was built to
      // close, reintroduced at the last step.
      if (written.ok) dropReach(queueDir(env), state.session);
    }
  }

  const files = await queueFiles({ env, now, sweep, includeMine });
  const loaded = [];
  for (const f of files) {
    const q = await readQueue({ env, path: f.path });
    if (q.lines.length) loaded.push({ ...f, lines: q.lines, malformed: q.malformed });
  }
  if (!loaded.length) {
    await touchStamp({ env, now });
    return { state: 'nothing', session, why: 'the queue is empty' };
  }

  // THE SECRET GATE, before anything leaves the machine. Over the whole line, payload included:
  // the payload is what becomes an entry body in the public base.
  const secrets = loadSecrets(env);
  let dropped = 0;
  for (const f of loaded) {
    const gated = gateQueue(f.lines, secrets.values);
    f.lines = gated.kept;
    f.dropped = gated.dropped;
    dropped += gated.dropped.length;
  }

  // A DRY RUN NEEDS NO TOKEN, and this is the one place that distinction earns its keep: the dry
  // run exists to be READ BY A PERSON BEFORE A PUSH IS APPROVED, and requiring the write credential
  // to see what would be written puts the credential before the review. The base is public, so
  // every read the plan needs — the ref, the tree, the current index and the mutated bodies —
  // answers unauthenticated. It is also exactly the operator the comment below describes: someone
  // with no write access can still inspect what their session queued.
  if (!token && !dryRun) {
    // Not a failure and not a retry: a person with no write access is still a full-value reader,
    // and the queue is durable. The first later session with a token pushes it.
    await touchStamp({ env, now });
    return {
      state: 'no-token',
      session,
      queued: loaded.reduce((n, f) => n + f.lines.length, 0),
      why: 'no GITHUB_TOKEN — the queue is kept and the first session with one will push it',
    };
  }

  const api = injected ?? githubApi({ owner: coords.owner, repo: coords.repo, branch: coords.branch, token, fetchImpl });

  const allLines = loaded.flatMap((f) => f.lines);
  const counts = {
    captures: allLines.filter((l) => l.kind === 'capture').length,
    confirms: allLines.filter((l) => l.kind === 'confirm').length,
    disputes: allLines.filter((l) => l.kind === 'dispute').length,
  };

  let attempt = 0;
  let last = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    const at = now();
    const built = await buildPush({ api, prefix, full, loaded, allLines, counts, session, at, attempt, dropped, secrets, synthetic: isSynthetic(env) });
    if (built.state !== 'ready') { last = built; break; }

    if (gate) {
      const yes = await gate(built.plan);
      if (!yes) return { state: 'declined', session, plan: built.plan, why: 'the operator declined this push; the queue is untouched' };
    }
    if (dryRun) return { state: 'dry-run', session, plan: built.plan };

    const landed = await land({ api, plan: built.plan });
    if (landed.ok) {
      await touchStamp({ env, now });
      for (const f of loaded) { try { await rm(f.path, { force: true }); } catch { /* a queue file we cannot remove would be pushed twice; the log names it either way */ } }
      return {
        state: 'pushed',
        session,
        commit: landed.sha,
        parent: built.plan.parent,
        plan: built.plan,
        attempts: attempt,
        converted: built.plan.converted,
        dropped,
        secretsLoaded: secrets.count,
        problems: built.plan.problems,
      };
    }
    last = landed;
    if (landed.reason !== 'conflict' || attempt >= maxAttempts) break;
    // The ref moved between our read and our write. Everything is keyed by id and by a
    // session-unique log path, so re-applying is mechanical and has no semantic conflict: read the
    // NEW head and do it again.
    await sleep(retryDelayMs);
  }

  // A FAILED PUSH LEAVES THE QUEUE INTACT, and says so in the queue itself: one line saying the
  // attempt at T failed, which ships with the next sweep beside the line saying it later landed.
  // Nothing is patched retroactively — the sequence is the record.
  await touchStamp({ env, now });
  await log({ kind: 'flush', ok: false, attempts: attempt, why: last?.detail ?? last?.why ?? 'unknown', reason: last?.reason ?? null }, { env });
  return {
    state: 'failed',
    session,
    attempts: attempt,
    why: last?.detail ?? last?.why ?? 'unknown',
    reason: last?.reason ?? null,
    queued: allLines.length,
    kept: loaded.map((f) => f.path),
  };
}

/**
 * The opportunistic sweep — the real retry, and the reason there is NO HOOK and no
 * `.claude/settings.json` edit (PLAN §5.2, §7, §9).
 *
 * Every `kb` invocation calls this after it has already delivered its answer. It takes only
 * queue files that have been IDLE for `SWEEP_AFTER_MS` — never this process's own, which is
 * flushed explicitly (`kb push`) or when the MCP server's stdin closes. Three consequences, all
 * intended:
 *
 *   * a failed push is picked up by the NEXT session automatically, with no scheduler;
 *   * a read-only CLI invocation never turns into a commit, so `kb ask` costs nothing extra;
 *   * a file still being appended to by a live parallel session is never taken mid-write.
 *
 * It is best-effort in the strict sense: it cannot change the caller's exit code, it cannot print,
 * and it cannot throw. A sweep that broke an `ask` would have traded the thing the user asked for
 * against bookkeeping.
 */
/**
 * Is this session's own queue old enough to publish?
 *
 * Measured from the OLDEST line, not the file's mtime: mtime moves on every append, so a session
 * that keeps asking would keep resetting its own deadline and never publish — which is the defect
 * this function was added to close, reintroduced one level down.
 */
export async function ownFlushDue({ env = process.env, now = () => new Date() } = {}) {
  try {
    const { lines } = await readQueue({ env, path: queuePath(env) });
    if (!lines.length) return false;
    const oldest = lines.map((l) => Date.parse(l?.at ?? '')).filter((n) => Number.isFinite(n)).sort()[0];
    if (!Number.isFinite(oldest)) return true; // undatable lines are already anomalous — publish them
    return now().getTime() - oldest > OWN_FLUSH_AFTER_MS;
  } catch { return false; }
}

export async function sweepIfDue({ env = process.env, base = null, token = null, now = () => new Date(), fetchImpl = null } = {}) {
  try {
    if (env.KB_NO_SWEEP) return { state: 'off' };
    if (!coordinatesOf(base)) return { state: 'off', why: 'not a writable base' };
    const mineDue = await ownFlushDue({ env, now });
    const due = await queueFiles({ env, now, sweep: true, includeMine: false });
    if (!mineDue && !due.length) return { state: 'nothing' };
    // The stamp paces the OPPORTUNISTIC sweep of other people's files. It must not gate our own
    // queue: the stamp is touched by every flush, including one that pushed nothing of ours, so
    // gating on it would reinstate exactly the hole `OWN_FLUSH_AFTER_MS` exists to close. Our own
    // flush is self-pacing instead — a successful push removes the queue file, so the next one
    // cannot come due until five minutes after the next line is written.
    if (!mineDue && !(await shouldSweep({ env, now }))) return { state: 'too-soon' };
    return await flush({ env, base, token, now, fetchImpl, includeMine: mineDue, sweep: true });
  } catch (err) {
    return { state: 'failed', why: String(err?.message ?? err) };
  }
}

/** Re-read the base at its current head and compose everything the commit will contain. */
async function buildPush({ api, prefix, full, loaded, allLines, counts, session, at, attempt, dropped, secrets, synthetic = false }) {
  const ref = await api.getRef();
  if (!ref.ok) return { state: 'failed', ...ref };
  const commit = await api.getCommit(ref.sha);
  if (!commit.ok) return { state: 'failed', ...commit };
  const tree = await api.getTree(commit.tree);
  if (!tree.ok) return { state: 'failed', ...tree };
  if (tree.truncated) {
    // A partial listing is worse than no listing: an entry we are mutating would appear absent and
    // be reported as index drift, and the retention sweep would be deciding from half the evidence.
    // The base would have to have grown far past anything §2 anticipates for this to fire.
    return { state: 'failed', reason: 'unreachable', detail: `the git tree at ${ref.sha.slice(0, 7)} came back truncated — refusing to push from a partial listing` };
  }

  const bySha = new Map(tree.entries.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  const read = async (relative) => {
    const sha = bySha.get(full(relative));
    if (!sha) return null;
    const blob = await api.getBlob(sha);
    if (!blob.ok) throw new Error(`could not read ${relative}: ${blob.detail}`);
    return blob.text;
  };

  let indexText;
  try {
    indexText = await read('index.json');
  } catch (err) {
    return { state: 'failed', reason: 'unreachable', detail: err.message };
  }
  if (indexText == null) return { state: 'failed', reason: 'missing', detail: `${full('index.json')} is not in the base at ${ref.sha.slice(0, 7)}` };
  let currentIndex;
  try { currentIndex = JSON.parse(indexText); } catch (err) { return { state: 'failed', reason: 'unreachable', detail: `index.json did not parse: ${err.message}` }; }

  const rows = (currentIndex.entries ?? []).map((r) => ({ ...normalizeRow(r), rawRow: r }));

  let applied;
  try {
    applied = await applyQueue({ lines: allLines, rows, read, at });
  } catch (err) {
    return { state: 'failed', reason: 'unreachable', detail: err.message };
  }

  // The index is rebuilt from the rows as WRITTEN, never re-derived: `buildRow`/`buildIndex` are
  // the one definition, and the byte shape (two-space JSON, trailing newline, sorted by id) is what
  // keeps a push from re-diffing all 89 rows.
  const index = buildIndex([...applied.raw.values()], { generated: at.toISOString() });

  const writes = [...applied.files].map(([path, text]) => ({ path: full(path), text }));

  // THE INDEX IS WRITTEN ONLY WHEN A ROW ACTUALLY MOVED. `generated` changes on every push by
  // construction, so including the index unconditionally makes a log-only push rewrite the one
  // file everybody reads for a one-line diff that reports nothing -- and it makes "did the index
  // change?" unanswerable from the history without opening each commit. Measured on the first
  // ordinary push after the base moved to the repository root: `+1 -1`, `generated` alone.
  //
  // Comparing the ROWS rather than the bytes is what makes this safe, and it also gives
  // `generated` a meaning worth having: when the rows last changed, not when somebody last
  // pushed anything.
  const rowsChanged = JSON.stringify(index.entries) !== JSON.stringify(currentIndex.entries ?? [])
    || index.count !== currentIndex.count
    || index.schema !== currentIndex.schema;
  if (rowsChanged) writes.push({ path: full('index.json'), text: `${JSON.stringify(index, null, 2)}\n` });

  // Every kept line through toLogLine() — the one place the queue/log distinction lives. The
  // pushing session's own file also carries the flush summary, so the log describes its own
  // delivery even when the only thing being pushed is somebody else's swept file.
  const swept = loaded.filter((f) => !f.mine).map((f) => f.path.split(/[\\/]/).pop());
  const flushLine = {
    at: at.toISOString(),
    kind: 'flush',
    entries: counts.captures,
    lines: allLines.length + applied.extraLog.length,
    swept,
    retries: attempt - 1,
    ok: true,
    convertedToConfirm: applied.converted,
    ...(dropped ? { redacted: dropped } : {}),
    ...(secrets.count ? {} : { note: 'the secret gate loaded no values — no env file was readable' }),
    ...(applied.problems.length ? { problems: applied.problems.length } : {}),
    // THE ONE LINE THAT IS NOT WRITTEN THROUGH `log()`, so it needs the mark applied by hand.
    // Found by running a benchmark and reading what it published: every ask carried
    // `synthetic: true` and the flush summarising them did not, because this object is built here
    // rather than by the single writer. The mark belongs to the PUSHING session and this line is
    // only ever attached to the pushing session's own file (`own ?` below), so one env read is the
    // right test — a synthetic run sweeping somebody else's real queue does not mark their lines.
    ...(synthetic ? { synthetic: true } : {}),
  };

  let mineSeen = false;
  const logs = [];
  for (const f of loaded) {
    const own = f.session === session;
    mineSeen ||= own;
    const lines = [...f.lines.map(toLogLine), ...(own ? [...applied.extraLog, flushLine] : [])];
    logs.push({ path: full(logPath(f.session, at)), text: `${lines.map((l) => JSON.stringify(l)).join('\n')}\n` });
  }
  if (!mineSeen) {
    logs.push({ path: full(logPath(session, at)), text: `${[...applied.extraLog, flushLine].map((l) => JSON.stringify(l)).join('\n')}\n` });
  }
  writes.push(...logs);

  const deletions = expiredLogs([...bySha.keys()], { at, prefix });

  const outside = outsideBase([...writes.map((w) => w.path), ...deletions], prefix);
  if (outside.length) {
    // ALWAYS, not only on the first push. A path outside the three the base owns is either a bug in
    // the path arithmetic or a payload from somewhere it should not have come from, and in a shared
    // public repository the right answer to both is to stop.
    return { state: 'failed', reason: 'contained', detail: `refusing to touch ${outside.length} path(s) outside ${prefix || '<root>'}/{entries,index.json,log}: ${outside.slice(0, 5).join(', ')}` };
  }

  return {
    state: 'ready',
    plan: {
      parent: ref.sha,
      baseTree: commit.tree,
      truncated: tree.truncated,
      message: commitMessage({ session, ...counts, logs: logs.length }),
      writes,
      deletions,
      converted: applied.converted,
      problems: applied.problems,
      swept,
      attempt,
    },
  };
}

/** blobs → tree → commit → ref. The last step is the compare-and-swap that makes it atomic. */
async function land({ api, plan }) {
  const blobs = [];
  for (const w of plan.writes) {
    const b = await api.createBlob(w.text);
    if (!b.ok) return b;
    blobs.push({ path: w.path, sha: b.sha });
  }
  const tree = await api.createTree({
    baseTree: plan.baseTree,
    entries: [...blobs, ...plan.deletions.map((path) => ({ path, sha: null }))],
  });
  if (!tree.ok) return tree;
  const commit = await api.createCommit({ message: plan.message, tree: tree.sha, parents: [plan.parent] });
  if (!commit.ok) return commit;
  const ref = await api.updateRef({ sha: commit.sha });
  if (!ref.ok) return ref;
  return { ok: true, sha: commit.sha };
}
