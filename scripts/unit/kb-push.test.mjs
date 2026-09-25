// The push: the queue, the flush, the sweep (scripts/kb/core/push.mjs).
//
// NOT ONE NETWORK CALL IN THIS FILE. Every response comes from a fake in-memory repository, which
// is why the transport is injectable at all: the failure modes that matter here — the ref moving
// between the read and the write, a duplicate appearing in the base since the capture was queued,
// a secret in a claim — are precisely the ones you cannot arrange against real GitHub, and the
// 422 path is the one failure mode that SILENTLY LOSES ANOTHER SESSION'S WORK if it is wrong.
// Testing it by hoping it happens is not testing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { appendFile, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { WRITE_TARGET, writeRefusal } from '../kb/core/base.mjs';
import { mintId } from '../kb/core/canonical.mjs';
import { parseEntry, stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { buildIndex, buildRow, entryPath } from '../kb/core/index-build.mjs';
import {
  RETENTION_DAYS, SWEEP_AFTER_MS, appendEvidence, commitMessage, expiredLogs, flush, logPath,
  logTargetOf, outsideBase, ownFlushDue, queueFiles, sameEvidence, shouldSweep, unionLines,
} from '../kb/core/push.mjs';
import { orderQueue, queueBacklog, queuePath, readPushStatus, releaseConsumed } from '../kb/core/queue.mjs';
import { reachPath } from '../kb/core/reach.mjs';
import { fingerprint, whoPath } from '../kb/core/who.mjs';
// THE READER, IN THE WRITER'S TEST, DELIBERATELY. STEP 3c's whole claim is that the path gained a
// directory and the PARSER did not change; a claim about two modules cannot be pinned inside one.
import { dayOf, sessionOf } from '../kb/core/report-analyse.mjs';
import { mkdtemp, rm } from 'node:fs/promises';

const BASE = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main/v2';
const SESSION = 'f3d05dd3';
const AT = new Date('2026-09-18T11:10:03Z');
const now = () => AT;

// ─── a fake repository, with a git-shaped write path ──────────────────────────────────────────

const blobSha = (t) => `b${createHash('sha1').update(t).digest('hex').slice(0, 12)}`;

/** An entry file, built through the REAL writer so its bytes are the ones the base would hold. */
function makeEntry({
  id, subject, question = 'what happens?', anchors = ['/company/members'],
  scope = ['surface=storefront-ui'], evidence = null, body = 'The claim, in prose.',
}) {
  const data = {
    id,
    subject,
    plane: 'experiential',
    question,
    status: 'active',
    appliesTo: scope.map((s) => { const [axis, ...r] = s.split('='); return { axis, value: r.join('=') }; }),
    anchors: anchors.map((coordinate) => ({ coordinate })),
    evidence: evidence ?? [{ method: 'observation', deployment: 'vcptcore_stable', at: '2026-09-11T08:51:47Z', by: 'session:95777cf8' }],
  };
  return { data, path: entryPath(id), text: `${stringifyFrontmatter(data)}\n${body}\n` };
}

/** A base state: `v2/index.json` plus `v2/entries/*.md`, consistent by construction. */
function makeBase(entries, { generated = '2026-09-18T09:00:00Z', extra = {}, prefix = 'v2' } = {}) {
  const at = (p) => (prefix ? `${prefix}/${p}` : p);
  const files = new Map(Object.entries(extra));
  for (const e of entries) files.set(at(e.path), e.text);
  const index = buildIndex(entries.map((e) => buildRow(e.data, e.path)), { generated });
  files.set(at('index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { head: 'c0000000', files };
}

/**
 * The Git Data API, in memory. `onUpdateRef` is how the ref is made to move under our feet, and
 * `onGetBlob` is how a READ is made to fail — the one failure that could turn the log's
 * read-modify-write into an overwrite, and therefore the one that needs a scripted transport
 * rather than a neighbouring test's side effect.
 */
function fakeApi(state, { onUpdateRef = null, onGetBlob = null } = {}) {
  const calls = [];
  const blobs = new Map();
  let pending = null;
  let n = 0;
  const api = {
    calls,
    lastCommit: null,
    getRef: async () => { calls.push('getRef'); return { ok: true, sha: state.head }; },
    getCommit: async (sha) => { calls.push('getCommit'); return { ok: true, tree: `t-${sha}` }; },
    getTree: async () => {
      calls.push('getTree');
      return {
        ok: true,
        truncated: false,
        entries: [...state.files].map(([path, text]) => ({ path, type: 'blob', sha: blobSha(text) })),
      };
    },
    getBlob: async (sha) => {
      calls.push('getBlob');
      const hook = onGetBlob?.(sha, state);
      if (hook) return hook;
      for (const text of state.files.values()) if (blobSha(text) === sha) return { ok: true, text };
      return { ok: false, reason: 'missing', detail: `no blob ${sha}` };
    },
    createBlob: async (text) => { calls.push('createBlob'); const s = blobSha(text); blobs.set(s, text); return { ok: true, sha: s }; },
    createTree: async ({ baseTree, entries }) => {
      calls.push('createTree');
      pending = { baseTree, entries };
      api.lastTree = pending;
      return { ok: true, sha: `t${(n += 1)}` };
    },
    createCommit: async ({ message, tree, parents }) => {
      calls.push('createCommit');
      api.lastCommit = { message, tree, parents };
      return { ok: true, sha: `c${(n += 1)}` };
    },
    updateRef: async ({ sha }) => {
      calls.push('updateRef');
      const attempt = calls.filter((c) => c === 'updateRef').length;
      const hook = onUpdateRef?.(attempt, state);
      if (hook) return hook;
      for (const e of pending.entries) {
        if (e.sha === null) state.files.delete(e.path);
        else state.files.set(e.path, blobs.get(e.sha));
      }
      state.head = sha;
      return { ok: true, sha };
    },
  };
  return api;
}

/** A queue directory with no real secrets in reach — the gate must never read the developer's. */
async function withQueue(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-push-'));
  try {
    const secrets = join(dir, 'secrets.env');
    await writeFile(secrets, 'ORG_USER_PASSWORD=hunter2-not-really\n', 'utf8');
    return await fn({
      dir,
      env: { KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: SESSION, VC_MEASURE_SECRETS: secrets },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const writeQueue = (dir, session, lines) =>
  writeFile(join(dir, `${session}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');

// Each capture carries ITS OWN evidence item, minted at verb time with its own `at` — as `capture`
// does for real. Reusing `makeEntry`'s seed item here made two unrelated captures byte-identical
// observations, which `sameEvidence` now (correctly) treats as one.
let minted = 0;
const captureLine = (entry, body = 'The claim, in prose.') => {
  minted += 1;
  const item = { method: 'observation', deployment: 'vcptcore_stable', at: `2026-09-18T10:15:00.${String(minted).padStart(3, '0')}Z`, by: `session:${SESSION}` };
  return {
    at: '2026-09-18T10:15:00Z', kind: 'capture', id: entry.data.id, subject: entry.data.subject,
    payload: { entry: { ...entry.data, evidence: [item] }, body, key: 'k' },
  };
};

const confirmLine = (id, path) => ({
  at: '2026-09-18T10:40:00Z', kind: 'confirm', id, deployment: 'vcptcore_stable', trust: 2,
  payload: { id, path, item: { method: 'observation', deployment: 'vcptcore_stable', at: '2026-09-18T10:40:00Z', by: `session:${SESSION}` } },
});

const run = (env, api, over = {}) => flush({ env, base: BASE, token: 'test-token', api, now, sleep: async () => {}, ...over });

/** This session's pushed log file, parsed. */
const logLines = (state) => state.files.get(`v2/${logPath(SESSION, AT)}`)
  .trim().split('\n').map((l) => JSON.parse(l));

/** Every log file the base holds for ONE session, whatever its date, parsed and concatenated. */
const linesOfSession = (state, session) => [...state.files]
  .filter(([path]) => path.startsWith('v2/log/') && sessionOf(path) === session)
  .flatMap(([, text]) => text.trim().split('\n').map((l) => JSON.parse(l)));

/** The published `session` line describing `id`, read from THAT session's file — where it now lives. */
const sessionLine = (state, id) => linesOfSession(state, id).find((l) => l.kind === 'session' && l.session === id);

// ─── one atomic commit ────────────────────────────────────────────────────────────────────────

test('a capture and a confirm land as ONE commit, on the head that was read', () => withQueue(async ({ dir, env }) => {
  const held = makeEntry({ id: 'KB-11111111', subject: 'a fact already in the base', anchors: ['/cart'] });
  const state = makeBase([held]);
  const api = fakeApi(state);
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a brand new fact', anchors: ['/checkout/shipping'] });

  await writeQueue(dir, SESSION, [
    { at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'quantity above stock?', matched: [], state: 'miss' },
    captureLine(fresh),
    confirmLine('KB-11111111', 'entries/KB-11111111.md'),
  ]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed', r.why);

  // ONE commit and ONE ref update. Three files via the contents API would be three commits, and a
  // state where index.json names an entry that is not there — the inconsistency the index must
  // never have, which is why the Git Data API is not a preference here.
  assert.equal(api.calls.filter((c) => c === 'createCommit').length, 1);
  assert.equal(api.calls.filter((c) => c === 'updateRef').length, 1);
  assert.deepEqual(api.lastCommit.parents, ['c0000000'], 'the parent is the head we read');
  assert.equal(api.lastTree.baseTree, 't-c0000000', 'the tree is based on that head\'s tree');

  // Read before write, and the reads are the ones the plan names.
  assert.ok(api.calls.indexOf('getRef') < api.calls.indexOf('createBlob'));
  assert.ok(api.calls.includes('getBlob'), 'the CURRENT body of the mutated entry was re-read');

  const paths = api.lastTree.entries.map((e) => e.path).sort();
  assert.deepEqual(paths, [
    'v2/entries/KB-11111111.md',
    'v2/entries/KB-22222222.md',
    'v2/index.json',
    `v2/${logPath(SESSION, AT)}`,
  ].sort());
}));

test('the queue file is removed on success', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await run(env, fakeApi(state));
  assert.equal(r.state, 'pushed');
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), false);
}));

// ─── the index's byte shape ───────────────────────────────────────────────────────────────────

test('untouched rows come back BYTE-IDENTICAL — a push must not re-diff the whole index', () => withQueue(async ({ dir, env }) => {
  const kept = [
    makeEntry({ id: 'KB-AAAAAAAA', subject: 'alpha', anchors: ['/a'] }),
    makeEntry({ id: 'KB-CCCCCCCC', subject: 'gamma', anchors: ['/c'] }),
  ];
  const state = makeBase(kept);
  const before = JSON.parse(state.files.get('v2/index.json'));
  const api = fakeApi(state);

  const fresh = makeEntry({ id: 'KB-BBBBBBBB', subject: 'beta', anchors: ['/b'] });
  await writeQueue(dir, SESSION, [captureLine(fresh)]);
  assert.equal((await run(env, api)).state, 'pushed');

  const text = state.files.get('v2/index.json');
  assert.ok(text.endsWith('\n'), 'trailing newline');
  const after = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(after, null, 2)}\n`, 'two-space pretty-printed, exactly');
  assert.deepEqual(after.entries.map((e) => e.id), ['KB-AAAAAAAA', 'KB-BBBBBBBB', 'KB-CCCCCCCC'], 'sorted by id');

  for (const id of ['KB-AAAAAAAA', 'KB-CCCCCCCC']) {
    assert.equal(
      JSON.stringify(after.entries.find((e) => e.id === id)),
      JSON.stringify(before.entries.find((e) => e.id === id)),
      `${id} was not rewritten`,
    );
  }
}));

test('a confirm raises `trust` in the index and appends to evidence[] in the entry', () => withQueue(async ({ dir, env }) => {
  const held = makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] });
  const state = makeBase([held]);
  await writeQueue(dir, SESSION, [confirmLine('KB-11111111', 'entries/KB-11111111.md')]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  const index = JSON.parse(state.files.get('v2/index.json'));
  assert.equal(index.entries[0].trust, 2, 'one observation plus one confirmation');
  const entry = state.files.get('v2/entries/KB-11111111.md');
  assert.match(entry, /by: session:f3d05dd3/);
  assert.ok(entry.endsWith('The claim, in prose.\n'), 'the prose is byte-identical — it is never re-serialised');
}));

test('appendEvidence never touches the body', () => {
  const e = makeEntry({ id: 'KB-11111111', subject: 'a fact', body: 'Line one.\n\n  indented, "quoted", : colonful\n' });
  const { text } = appendEvidence(e.text, { method: 'observation', deployment: 'x', at: 'y', by: 'z' }, 'KB-11111111');
  assert.ok(text.endsWith('Line one.\n\n  indented, "quoted", : colonful\n\n'));
  assert.match(text, /method: observation\n {4}deployment: x/);
});

// ─── the queue is not the log ─────────────────────────────────────────────────────────────────

test('no pushed log line carries a payload — and the claim is in the ENTRY, not the log', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const api = fakeApi(state);
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/checkout'] });
  await writeQueue(dir, SESSION, [captureLine(fresh, 'THE-CLAIM-PROSE')]);
  assert.equal((await run(env, api)).state, 'pushed');

  const log = state.files.get(`v2/${logPath(SESSION, AT)}`);
  const lines = log.trim().split('\n').map((l) => JSON.parse(l));
  for (const l of lines) assert.ok(!('payload' in l), `${l.kind} carried a payload into the public log`);
  assert.ok(!log.includes('THE-CLAIM-PROSE'), 'the prose does not reach the log');
  assert.ok(state.files.get('v2/entries/KB-22222222.md').includes('THE-CLAIM-PROSE'), 'it reaches the entry');
}));

test('one flush line per push, describing its own delivery', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/checkout'] });
  await writeQueue(dir, SESSION, [captureLine(fresh)]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  const lines = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  const flushes = lines.filter((l) => l.kind === 'flush');
  assert.equal(flushes.length, 1);
  assert.deepEqual(
    { entries: flushes[0].entries, retries: flushes[0].retries, ok: flushes[0].ok, convertedToConfirm: flushes[0].convertedToConfirm },
    { entries: 1, retries: 0, ok: true, convertedToConfirm: 0 },
  );
}));

test('a synthetic run marks its FLUSH line too, not only its asks', () => withQueue(async ({ dir, env }) => {
  // THE ONE LINE THAT IS NOT WRITTEN THROUGH `log()`. The flush summary is built in push.mjs, so
  // the single-writer guarantee that stamps every other line does not reach it. Found by running a
  // real benchmark and reading what it published: six asks marked `synthetic`, and the flush
  // describing them unmarked — which would have put a benchmark's delivery into the tally while
  // its questions stayed out of it. Neither the mechanism's own tests nor a code read caught it;
  // publishing the output and looking at it did.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'benchmark?', matched: [], state: 'miss', synthetic: true }]);
  assert.equal((await run({ ...env, KB_SYNTHETIC: '1' }, fakeApi(state))).state, 'pushed');

  const lines = logLines(state);
  assert.equal(lines.find((l) => l.kind === 'flush').synthetic, true);
}));

test('an ordinary run’s flush line carries no synthetic field', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  assert.ok(!('synthetic' in logLines(state).find((l) => l.kind === 'flush')));
}));

// --- `who`: the line says who wrote it, and the flush says who DELIVERED it ------------------

const WHO_TOKEN = 'ghp_atestonlytokenvaluethatisnotreal01';

/** Warm the identity cache the way a door would have left it, for THIS test's token. */
const knowWho = (dir, handle) =>
  writeFile(whoPath(dir), `${JSON.stringify({ fp: fingerprint(WHO_TOKEN), who: handle, at: AT.toISOString() })}\n`, 'utf8');

/**
 * An env whose token is the test's own, against an env root with no env files in it.
 *
 * Without the root, `writeToken` resolves through the REPO's `.env.local`, which on a developer's
 * machine holds a real token — and then the cache key these tests write depends on whose machine
 * is running them.
 */
const asWho = (env, root) => ({ ...env, VC_ENV_ROOT: root, GITHUB_TOKEN: WHO_TOKEN });

/** A temporary env root, since every test here needs one and none of them wants to keep it. */
async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'kb-push-root-'));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('the flush line names the PUSHER — the one line where deliverer and author may differ', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // Every other line is stamped by `queue.mjs`'s single writer. This one is built in push.mjs, so
  // it is stamped by hand — exactly like `synthetic`, and found the same way that was: by reading
  // what a run actually published. A flush describes a DELIVERY, and the deliverer is precisely
  // who a reader wants named, including when the file it swept belongs to somebody else.
  await knowWho(dir, 'octo-pusher');
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);
  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  assert.equal(logLines(state).find((l) => l.kind === 'flush').who, 'octo-pusher');
})));

test('a pusher with no resolved identity writes a flush line with no handle', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);
  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  assert.ok(!('who' in logLines(state).find((l) => l.kind === 'flush')), 'absent, never null');
})));

test('a swept session line keeps ITS writer, and the pusher does not overwrite it', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // THE CASE THE WHOLE FIELD EXISTS FOR. A queue left behind by one session is swept by another,
  // possibly on a different machine under a different person's token — which is why the commit
  // author cannot answer "who ran this". The handle rides on the line, stamped when it was
  // WRITTEN, and the sweep must carry it through untouched.
  await knowWho(dir, 'octo-pusher');
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const foreign = join(dir, 'abcd1234.jsonl');
  await writeFile(foreign, `${JSON.stringify({ at: '2026-09-18T09:00:00Z', kind: 'ask', q: 'somebody else asked this', matched: [], state: 'miss', who: 'octo-asker' })}\n`, 'utf8');
  const old = new Date(AT.getTime() - SWEEP_AFTER_MS - 60_000);
  await utimes(foreign, old, old);

  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  const theirs = state.files.get(`v2/${logPath('abcd1234', AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(theirs[0].who, 'octo-asker', 'the asker, not the pusher');
  assert.equal(logLines(state).find((l) => l.kind === 'flush').who, 'octo-pusher');
})));

test('a published `session` line credits the session it DESCRIBES, never the one sweeping it', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // The reach line is the one kind whose subject is a different session, so the writer's own
  // handle would name the wrong person with complete confidence — the failure that ruled out the
  // commit author. The handle comes off the STATE, stamped by that session's own hook.
  await knowWho(dir, 'octo-pusher');
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const quiet = reachPath(dir, 'quiet001');
  await writeFile(quiet, JSON.stringify({ session: 'quiet001', cursor: 0, tools: 300, turns: 9, touchAt: [], firstAt: '2026-09-18T08:00:00Z', lastAt: '2026-09-18T09:00:00Z', who: 'octo-quiet' }), 'utf8');
  const old = new Date(AT.getTime() - 60 * 60 * 1000);
  await utimes(quiet, old, old);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);

  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  const line = sessionLine(state, 'quiet001');
  assert.equal(line.session, 'quiet001');
  assert.equal(line.who, 'octo-quiet', 'the person who ran it, not the person who sent it');
  // AND IT IS FILED UNDER THAT SESSION, not the sweeper's — which is where an operator opening a
  // regression run's log found an unrelated session's counters (STEP 8).
  assert.ok(!logLines(state).some((l) => l.kind === 'session'), "the sweeper's file holds no foreign counters");
})));

test('a `session` line for a state that never learned a handle carries none', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // And it is NOT filled in from the pusher, which is the whole point: an unknown author is a gap
  // a reader can see, and a confident wrong one is a gap they cannot.
  await knowWho(dir, 'octo-pusher');
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const quiet = reachPath(dir, 'quiet002');
  await writeFile(quiet, JSON.stringify({ session: 'quiet002', cursor: 0, tools: 12, turns: 2, touchAt: [], firstAt: '2026-09-18T08:00:00Z', lastAt: '2026-09-18T09:00:00Z' }), 'utf8');
  const old = new Date(AT.getTime() - 60 * 60 * 1000);
  await utimes(quiet, old, old);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);

  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  const line = sessionLine(state, 'quiet002');
  assert.equal(line.session, 'quiet002');
  assert.ok(!('who' in line), 'no identity beats the pusher’s');
})));

test('the log path is the DATE and the session, flat under log/ — no time of day, no counter', () => {
  assert.equal(logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z')), 'log/20260918-f3d05dd3.jsonl');
  // The session id is not decoration: two sessions work on the same day. Without it, one session's
  // log silently merges into another's.
  assert.notEqual(logPath('aaaaaaaa', AT), logPath('bbbbbbbb', AT));
  // AND THE TIME OF DAY IS NOT IN IT. Two processes publishing one queue do not share a clock, so a
  // stamp made them two files holding the same lines (PLAN §21.7 item 3); a date is the same for
  // both, so they compute the same path with no counter to agree on.
  assert.equal(logPath('f3d05dd3', new Date('2026-09-18T00:00:01Z')),
    logPath('f3d05dd3', new Date('2026-09-18T23:59:59Z')), 'one path for the whole UTC day');
  assert.notEqual(logPath('f3d05dd3', new Date('2026-09-18T23:59:59Z')),
    logPath('f3d05dd3', new Date('2026-09-19T00:00:00Z')), 'and a new one at UTC midnight');
});

test('a path with no valid date is REFUSED, not defaulted to the push clock', () => {
  // A default here would move lines between days with nobody having decided they should; the
  // fallback for an undatable line is `logTargetOf`'s decision, made once and visibly.
  for (const bad of [undefined, null, 0, 'today', new Date('nonsense')]) {
    assert.throws(() => logPath('f3d05dd3', bad), /valid date/, String(bad));
  }
});

test('the reader gets session and date back off the name the WRITER produces', () => {
  // Pinned HERE, beside the writer, because the claim is about two modules agreeing — `logPath`
  // producing a name and `sessionOf`/`dayOf` reading it back — and cannot be pinned inside one.
  const p = logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z'));
  assert.equal(sessionOf(p), 'f3d05dd3');
  assert.equal(dayOf(p), '2026-09-18');
  assert.equal(sessionOf(`v2/${p}`), 'f3d05dd3', 'and under a prefix');
  // Since the migration the report reads ONLY what the writer writes; old shapes are refused.
  assert.equal(sessionOf('log/2026-09-18/f3d05dd3/f3d05dd3-0003.jsonl'), '');
});

test('an all-digit session key round-trips, and is never read as a date', () => {
  // `12345678` is a legal session key and eight digits is also the shape of a date. The writer's
  // name puts the date FIRST and the reader anchors on depth, so the round trip is exact.
  const p = logPath('12345678', AT);
  assert.equal(sessionOf(p), '12345678');
  assert.equal(dayOf(p), `${AT.getUTCFullYear()}-${String(AT.getUTCMonth() + 1).padStart(2, '0')}-${String(AT.getUTCDate()).padStart(2, '0')}`);
});

test('each line is routed by ITS OWN date, and a `session` line to the session it describes', () => {
  const fallback = new Date('2026-09-20T12:00:00Z');
  const own = { session: 'f3d05dd3', fallback };
  assert.equal(logTargetOf({ at: '2026-09-18T23:59:00Z', kind: 'ask' }, own), 'log/20260918-f3d05dd3.jsonl');
  assert.equal(logTargetOf({ at: '2026-09-19T00:01:00Z', kind: 'ask' }, own), 'log/20260919-f3d05dd3.jsonl');
  // No usable `at` → the fallback's date, never a throw: the line has to land somewhere.
  assert.equal(logTargetOf({ kind: 'ask' }, own), 'log/20260920-f3d05dd3.jsonl');
  assert.equal(logTargetOf({ at: 'garbage', kind: 'ask' }, own), 'log/20260920-f3d05dd3.jsonl');
  // The swept counter line goes to ITS session's file, not the sweeper's.
  assert.equal(logTargetOf({ at: '2026-09-18T10:00:00Z', kind: 'session', session: 'quiet001' }, own),
    'log/20260918-quiet001.jsonl');
  // ...unless the id could not be a file name, when it stays where it arrived.
  for (const bad of ['..', 'a/b', '', 42]) {
    assert.equal(logTargetOf({ at: '2026-09-18T10:00:00Z', kind: 'session', session: bad }, own),
      'log/20260918-f3d05dd3.jsonl', String(bad));
  }
  // Only a `session` line is re-routed; a `session` FIELD on another kind means nothing here.
  assert.equal(logTargetOf({ at: '2026-09-18T10:00:00Z', kind: 'ask', session: 'quiet001' }, own),
    'log/20260918-f3d05dd3.jsonl');
});

test('a foreign queue file whose name cannot be a session key is not swept', () => withQueue(async ({ dir, env }) => {
  // Under the nested layout `outsideBase()` refused a `.`/`..` session segment on the way out. A
  // flat name has no such segment — `log/20260918-..jsonl` is inside the base — so the refusal moved
  // to the way in, and this is its test.
  for (const name of ['..jsonl', 'a.b.jsonl']) {
    const p = join(dir, name);
    await writeFile(p, `${JSON.stringify({ at: '2026-09-18T09:00:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' })}\n`, 'utf8');
    const old = new Date(AT.getTime() - SWEEP_AFTER_MS - 60_000);
    await utimes(p, old, old);
  }
  const taken = await queueFiles({ env, now, sweep: true, includeMine: false });
  assert.deepEqual(taken, []);
}));

// ─── the push-time dedup re-run ───────────────────────────────────────────────────────────────

test('a capture whose fact arrived in the base since it was queued becomes a CONFIRM', () => withQueue(async ({ dir, env }) => {
  // Session A captured this at 10:00 and pushed. Session B's cached index predates that, so B's
  // session-time check found nothing at 10:05. This is what closes the race.
  const theirs = makeEntry({ id: 'KB-AAAAAAAA', subject: 'their wording of it', anchors: ['/company/members'], scope: ['surface=storefront-ui'] });
  const state = makeBase([theirs]);
  const api = fakeApi(state);

  const mine = makeEntry({ id: 'KB-BBBBBBBB', subject: 'my wording of it', anchors: ['/company/members'], scope: ['surface=storefront-ui'] });
  await writeQueue(dir, SESSION, [captureLine(mine)]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed');
  assert.equal(r.converted, 1);

  assert.equal(state.files.has('v2/entries/KB-BBBBBBBB.md'), false, 'no duplicate entry was written');
  const index = JSON.parse(state.files.get('v2/index.json'));
  assert.equal(index.count, 1);
  assert.equal(index.entries[0].trust, 2, 'the base got MORE trustworthy out of a retrieval failure');

  const lines = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  const refused = lines.find((l) => l.kind === 'capture-refused');
  assert.deepEqual(
    { dupeOf: refused.dupeOf, why: refused.why, when: refused.when },
    { dupeOf: 'KB-AAAAAAAA', why: 'anchors+scope', when: 'push' },
  );
  assert.equal(lines.find((l) => l.kind === 'flush').convertedToConfirm, 1);
}));

test('a DIFFERENT scope on the same anchor is a different fact, and still gets written', () => withQueue(async ({ dir, env }) => {
  const theirs = makeEntry({ id: 'KB-AAAAAAAA', subject: 'on the storefront', anchors: ['/company/members'], scope: ['surface=storefront-ui'] });
  const state = makeBase([theirs]);
  const mine = makeEntry({ id: 'KB-BBBBBBBB', subject: 'in the admin', anchors: ['/company/members'], scope: ['surface=admin-spa'] });
  await writeQueue(dir, SESSION, [captureLine(mine)]);

  const r = await run(env, fakeApi(state));
  assert.equal(r.converted, 0);
  assert.ok(state.files.has('v2/entries/KB-BBBBBBBB.md'), 'the same coordinate on two surfaces is two facts');
}));

test('a SAME-subject id collision at different anchors is REFUSED at push — never merged, prose never lost silently', () => withQueue(async ({ dir, env }) => {
  // PR #313 review 2: this used to CONVERT — the newcomer's one evidence item landed on the
  // incumbent (an observation about /mine confirming a fact about /theirs) and MY PROSE was written
  // nowhere, under a refusal line that read as a legitimate dedup. The door refuses it now; this is
  // the push-time backstop for a capture queued before the incumbent reached the base.
  const theirs = makeEntry({ id: 'KB-AAAAAAAA', subject: 'one subject', anchors: ['/theirs'], body: 'THEIR PROSE' });
  const state = makeBase([theirs]);
  const mine = makeEntry({ id: 'KB-AAAAAAAA', subject: 'one subject', anchors: ['/mine'], body: 'MY PROSE' });
  await writeQueue(dir, SESSION, [captureLine(mine, 'MY PROSE')]);

  const r = await run(env, fakeApi(state));
  assert.equal(r.state, 'pushed', r.why);
  assert.equal(r.converted, 0, 'nothing converted');
  const entry = state.files.get('v2/entries/KB-AAAAAAAA.md');
  assert.equal(entry, theirs.text, 'the incumbent is byte-identical: no evidence appended, nothing overwritten');
  const refused = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n')
    .map((l) => JSON.parse(l)).find((l) => l.kind === 'capture-refused');
  assert.equal(refused.why, 'id-collision-same-subject');
  assert.match(refused.note, /confirm the incumbent/);
  assert.ok(r.problems.some((p) => /same subject at different coordinates/.test(p.why)), 'said out loud in the push result');
}));

test('an id collision between DIFFERENT subjects is refused, never merged', () => withQueue(async ({ dir, env }) => {
  // THE DEFECT, found 2026-09-22 by an independent review. The test above is right about the case it
  // covers - one id, the SAME subject - and the code generalised it to every collision on the
  // strength of a comment that read: "the id is minted from the subject, so two entries with this id
  // have the same subject verbatim." True of a hash, FALSE of a TRUNCATED one: `mintId` cuts sha256
  // to 32 bits. Nothing compared the subjects.
  //
  // The pair below is REAL, brute-forced by the review and re-derived here rather than transcribed -
  // the assertion proves the collision instead of assuming it, so a change to `mintId` fails loudly
  // here rather than making this test silently vacuous.
  const A = 'cart splits the quantity for a B2B user #148';
  const B = 'promotion reorders the quantity silently #156';
  assert.equal(mintId(A), mintId(B), 'the fixture must be a genuine collision, or this test proves nothing');
  const id = mintId(A);

  const theirs = makeEntry({ id, subject: A, anchors: ['/theirs'], body: 'THEIR PROSE' });
  const state = makeBase([theirs]);
  const mine = makeEntry({ id, subject: B, anchors: ['/mine'], scope: ['surface=platform'], body: 'MY PROSE' });
  await writeQueue(dir, SESSION, [captureLine(mine, 'MY PROSE')]);

  const r = await run(env, fakeApi(state));

  // NOTHING WAS CONFIRMED. Before the repair this appended B's evidence item to A, took A's trust
  // from 1 to 2, and wrote B's prose nowhere - a fact lost, an unrelated entry credited with an
  // observation nobody made about it, and the trust label inflated by it.
  assert.equal(r.converted, 0, 'a different fact is not a confirmation of this one');
  const entry = state.files.get(`v2/entries/${id}.md`);
  assert.ok(entry.includes('THEIR PROSE'), 'the incumbent is untouched');
  assert.ok(!entry.includes('MY PROSE'), 'and is not overwritten either');
  assert.equal((entry.match(/method:/g) ?? []).length, 1, 'no evidence item was appended to it');

  // AND THE REFUSAL IS LEGIBLE. The old line was indistinguishable from an ordinary duplicate
  // refusal, so the only trace was a `subject` that did not match the entry it named and nothing
  // looked for that. This one names its own reason and both subjects.
  const refused = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n')
    .map((l) => JSON.parse(l)).find((l) => l.kind === 'capture-refused');
  assert.equal(refused.why, 'id-collision-different-subject');
  assert.ok(refused.note.includes(A), 'the refusal names the subject already holding the id');
  assert.ok(r.plan.problems.some((x) => x.id === id), 'and it surfaces as a problem, not only as a log line');
}));

test('two captures of one fact in ONE session: the second converts against the first', () => withQueue(async ({ dir, env }) => {
  // The session-time check only ever looks at the BASE, so it cannot catch this one.
  const state = makeBase([makeEntry({ id: 'KB-99999999', subject: 'unrelated', anchors: ['/z'] })]);
  const one = makeEntry({ id: 'KB-AAAAAAAA', subject: 'first wording', anchors: ['/dup'], scope: ['surface=storefront-ui'] });
  const two = makeEntry({ id: 'KB-BBBBBBBB', subject: 'second wording', anchors: ['/dup'], scope: ['surface=storefront-ui'] });
  await writeQueue(dir, SESSION, [captureLine(one), captureLine(two)]);

  const r = await run(env, fakeApi(state));
  assert.equal(r.converted, 1);
  assert.ok(state.files.has('v2/entries/KB-AAAAAAAA.md'));
  assert.equal(state.files.has('v2/entries/KB-BBBBBBBB.md'), false);
}));

// ─── the ref moving under us ──────────────────────────────────────────────────────────────────

test('422: the ref moved — re-read, re-apply, retry, and the other session\'s work SURVIVES', () => withQueue(async ({ dir, env }) => {
  const held = makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] });
  const state = makeBase([held]);

  const api = fakeApi(state, {
    onUpdateRef: (attempt, s) => {
      if (attempt > 1) return null;
      // Another session commits between our read and our write.
      const theirs = makeEntry({ id: 'KB-77777777', subject: 'their new fact', anchors: ['/theirs'] });
      s.files.set(`v2/${theirs.path}`, theirs.text);
      s.files.set('v2/index.json', `${JSON.stringify(buildIndex(
        [buildRow(held.data, held.path), buildRow(theirs.data, theirs.path)], { generated: '2026-09-18T11:09:00Z' },
      ), null, 2)}\n`);
      s.head = 'c0000001';
      return { ok: false, status: 422, reason: 'conflict', detail: 'HTTP 422 — Update is not a fast forward' };
    },
  });

  const fresh = makeEntry({ id: 'KB-22222222', subject: 'my new fact', anchors: ['/mine'] });
  await writeQueue(dir, SESSION, [captureLine(fresh)]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed', r.why);
  assert.equal(r.attempts, 2);
  assert.equal(api.lastCommit.parents[0], 'c0000001', 'the retry committed on the NEW head');

  const index = JSON.parse(state.files.get('v2/index.json'));
  assert.deepEqual(index.entries.map((e) => e.id).sort(), ['KB-11111111', 'KB-22222222', 'KB-77777777']);
  assert.ok(state.files.has('v2/entries/KB-77777777.md'), 'the other session\'s entry was not dropped');
}));

test('a capture that the OTHER session already made is converted on the retry, not duplicated', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const theirs = makeEntry({ id: 'KB-AAAAAAAA', subject: 'their wording', anchors: ['/race'], scope: ['surface=storefront-ui'] });

  const api = fakeApi(state, {
    onUpdateRef: (attempt, s) => {
      if (attempt > 1) return null;
      s.files.set(`v2/${theirs.path}`, theirs.text);
      s.files.set('v2/index.json', `${JSON.stringify(buildIndex([
        buildRow(makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] }).data, 'entries/KB-11111111.md'),
        buildRow(theirs.data, theirs.path),
      ], { generated: '2026-09-18T11:09:00Z' }), null, 2)}\n`);
      s.head = 'c0000001';
      return { ok: false, status: 422, reason: 'conflict', detail: 'ref moved' };
    },
  });

  const mine = makeEntry({ id: 'KB-BBBBBBBB', subject: 'my wording', anchors: ['/race'], scope: ['surface=storefront-ui'] });
  await writeQueue(dir, SESSION, [captureLine(mine)]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed');
  assert.equal(r.converted, 1, 'the second dedup run sees what the first attempt could not');
  assert.equal(state.files.has('v2/entries/KB-BBBBBBBB.md'), false);
}));

test('three conflicts: the push fails, THE QUEUE IS INTACT, and the failure is itself queued', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const api = fakeApi(state, { onUpdateRef: () => ({ ok: false, status: 422, reason: 'conflict', detail: 'ref moved' }) });
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/mine'] });
  await writeQueue(dir, SESSION, [captureLine(fresh)]);

  const r = await run(env, api);
  assert.equal(r.state, 'failed');
  assert.equal(r.attempts, 3);
  assert.equal(r.reason, 'conflict');
  assert.equal(state.files.has('v2/entries/KB-22222222.md'), false, 'nothing landed');

  const queue = (await readFile(join(dir, `${SESSION}.jsonl`), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(queue[0].kind, 'capture', 'the capture is still queued for the next session');
  assert.ok(queue[0].payload, 'with its payload');
  const failed = queue.at(-1);
  assert.deepEqual({ kind: failed.kind, ok: failed.ok, attempts: failed.attempts }, { kind: 'flush', ok: false, attempts: 3 });
}));

test('a non-conflict failure does not retry — it is not a compare-and-swap losing', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state, { onUpdateRef: () => ({ ok: false, status: 403, reason: 'denied', detail: 'HTTP 403' }) });
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await run(env, api);
  assert.equal(r.state, 'failed');
  assert.equal(r.attempts, 1);
  assert.equal(r.reason, 'denied');
}));

// ─── one queue must not publish twice (PLAN §21.7 item 3 / STEP 3b) ───────────────────────────
//
// THE INCIDENT, from the published base: `log/2026-09-21/20260921T081451Z-local_e8.jsonl` and
// `…081459Z-local_e8.jsonl`, eight seconds apart, THE FIRST 13 LINES BYTE-IDENTICAL. Two push
// processes loaded one queue; the first committed and removed it, the second was already holding
// its copy. Nothing was lost and every count over that window is inflated, with no way to notice
// short of diffing two files by hand.
//
// The fix is that the path carries no wall-clock TIME and no per-push state: one file per session
// per UTC day, named from the lines' own dates. Two processes holding one queue compute the same
// paths, and a path written twice is MERGED. From 2026-09-21 to 2026-09-23 the same property was
// bought with a per-session push counter (`.seq`) and two ordering rules, each pinned by a test
// (PLAN §22.2); with no counter there is nothing left to order, and those tests went with it. What
// they guarded is pinned below as the end state instead: two concurrent publishers, one file.

test('unionLines merges, never overwrites — overlapping, nested, and in order', () => {
  const a = ['{"n":1}', '{"n":2}', '{"n":3}'];

  // OVERLAPPING: the common prefix appears once, the tails of both survive, existing lines first.
  assert.equal(
    unionLines(`${a.join('\n')}\n`, ['{"n":2}', '{"n":3}', '{"n":4}']),
    '{"n":1}\n{"n":2}\n{"n":3}\n{"n":4}\n',
  );

  // NESTED, AND THIS IS THE ONE THAT WOULD HAVE LOST A LINE. The process that loaded the queue
  // earlier holds a PREFIX of what the later one holds; if it commits second and overwrites, the
  // superset is replaced by the subset and the missing line surfaces as a gap nobody can explain.
  assert.equal(unionLines(`${a.join('\n')}\n`, ['{"n":1}']), '{"n":1}\n{"n":2}\n{"n":3}\n');

  // Nothing there yet → create. Blank lines and a missing trailing newline are not content.
  assert.equal(unionLines(null, a), '{"n":1}\n{"n":2}\n{"n":3}\n');
  assert.equal(unionLines('{"n":1}\n\n\n{"n":2}', ['{"n":2}']), '{"n":1}\n{"n":2}\n');
  assert.equal(unionLines('', []), '');
});

const logFiles = (state) => [...state.files.keys()].filter((p) => p.startsWith('v2/log/')).sort();

test('two pushes of ONE queue write ONE file, and the second merges into it', () => withQueue(async ({ dir, env }) => {
  // The published incident, reproduced sequentially: B loaded the queue before A removed it, so B's
  // view of this machine is the queue file as it was.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const queued = [
    { at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'first question', matched: [], state: 'miss' },
    { at: '2026-09-18T10:03:00Z', kind: 'ask', q: 'second question', matched: [], state: 'miss' },
    { at: '2026-09-18T10:04:00Z', kind: 'ask', q: 'third question', matched: [], state: 'miss' },
  ];
  await writeQueue(dir, SESSION, queued);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  await writeQueue(dir, SESSION, queued);                   // B's copy, loaded before A removed it
  // Eight seconds later, which is the interval the base actually recorded — and under the old
  // naming that alone was enough to make a second file.
  const later = new Date(AT.getTime() + 8_000);
  assert.equal((await run(env, fakeApi(state), { now: () => later })).state, 'pushed');

  assert.deepEqual(logFiles(state), [`v2/${logPath(SESSION, AT)}`], 'ONE file — the timestamp is what made it two');

  const lines = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.kind === 'ask').map((l) => l.q),
    ['first question', 'second question', 'third question'],
    'each question counted ONCE — the inflation is what made that window unreadable');
  // BOTH flush lines stay. Two deliveries really did happen and a log that describes its own
  // delivery has to say so; what this removes is the double COUNTING of the work, not the evidence
  // that somebody published it twice.
  assert.equal(lines.filter((l) => l.kind === 'flush').length, 2);
}));

test('two CONCURRENT publishers of one session\'s queue converge on one file', () => withQueue(async ({ dir, env }) => {
  // What `.seq`'s two ordering rules existed to guarantee, pinned as the END STATE rather than as an
  // order of effects — there is no longer an order to observe. Both processes hold the queue before
  // either lands; both build a commit against the same head; the ref is a real compare-and-swap, so
  // one wins and the other loses, re-reads the head (which now holds the winner's file) and writes
  // to THE SAME PATH, where `unionLines` merges it. A layout that put any per-push fact into the
  // path — a time, a counter recomputed on retry — fails here with two files.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [
    { at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'first question', matched: [], state: 'miss' },
    { at: '2026-09-18T10:03:00Z', kind: 'ask', q: 'second question', matched: [], state: 'miss' },
  ]);

  const casApi = () => {
    const api = fakeApi(state);
    const land = api.updateRef;
    // A REAL compare-and-swap: the commit must be built on the head as it is NOW.
    api.updateRef = async (arg) => (api.lastCommit.parents[0] === state.head
      ? land(arg)
      : { ok: false, status: 422, reason: 'conflict', detail: 'ref moved' });
    return api;
  };
  // Neither may land until BOTH have built a commit on the head they read, which is the interleaving
  // the base actually suffered: two holders of one queue, neither aware of the other.
  let built = 0;
  let release;
  const bothBuilt = new Promise((r) => { release = r; });
  const gate = async () => { built += 1; if (built === 2) release(); await bothBuilt; return true; };

  const [a, b] = await Promise.all([
    run(env, casApi(), { gate }),
    run(env, casApi(), { gate }),
  ]);

  assert.deepEqual([a.state, b.state], ['pushed', 'pushed']);
  assert.deepEqual([a.attempts, b.attempts].sort(), [1, 2], 'one won the swap, the other lost it and retried');
  assert.deepEqual(logFiles(state), [`v2/${logPath(SESSION, AT)}`], 'one file, not one per publisher');

  const lines = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.kind === 'ask').map((l) => l.q), ['first question', 'second question']);
  assert.equal(lines.filter((l) => l.kind === 'flush').length, 2, 'both deliveries are on record');
}));

test('a session pushing twice in one day APPENDS to one file; its next day is a new file', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'one', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:20:00Z', kind: 'ask', q: 'two', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  assert.deepEqual(logFiles(state), [`v2/${logPath(SESSION, AT)}`], 'the second push appended');
  assert.deepEqual(logLines(state).filter((l) => l.kind === 'ask').map((l) => l.q), ['one', 'two'], 'in the order they happened');

  const tomorrow = new Date('2026-09-19T09:00:00Z');
  await writeQueue(dir, SESSION, [{ at: '2026-09-19T08:59:00Z', kind: 'ask', q: 'three', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state), { now: () => tomorrow })).state, 'pushed');
  assert.deepEqual(logFiles(state), [`v2/${logPath(SESSION, AT)}`, `v2/${logPath(SESSION, tomorrow)}`]);
}));

test('a flush that straddles midnight writes each line under ITS OWN date, not the push clock', () => withQueue(async ({ dir, env }) => {
  // The date in a name is a fact about the CONTENTS. A queue holding 23:58 and 00:03 lines, pushed
  // at 00:05, is two files — and the flush summary, written at 00:05, rides in the second.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [
    { at: '2026-09-18T23:58:00Z', kind: 'ask', q: 'late', matched: [], state: 'miss' },
    { at: '2026-09-19T00:03:00Z', kind: 'ask', q: 'early', matched: [], state: 'miss' },
  ]);
  const pushAt = new Date('2026-09-19T00:05:00Z');
  const r = await run(env, fakeApi(state), { now: () => pushAt });
  assert.equal(r.state, 'pushed');

  const day1 = `v2/${logPath(SESSION, new Date('2026-09-18T12:00:00Z'))}`;
  const day2 = `v2/${logPath(SESSION, pushAt)}`;
  assert.deepEqual(logFiles(state), [day1, day2]);
  const parse = (p) => state.files.get(p).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(parse(day1).map((l) => l.q ?? l.kind), ['late']);
  assert.deepEqual(parse(day2).map((l) => l.q ?? l.kind), ['early', 'flush']);
  assert.match(r.plan.message, /2 logs/, 'the commit message counts FILES written');
}));

test('a FAILED READ of the existing log aborts the push — it never falls through to an overwrite', () => withQueue(async ({ dir, env }) => {
  // THE ONE WAY THE MERGE COULD LOSE DATA, so it gets a scripted transport rather than a
  // neighbouring test's side effect: reading the current content is what makes the merge a merge,
  // and code that treats a failed read as "no file there" writes a subset over a superset. The rule
  // is NO FILE → CREATE, READ FAILED → ABORT; the queue survives and the next push retries, which
  // is what every other failure in push.mjs already does. With one file per session per day this is
  // the ordinary path for every push after the day's first, not the rare one.
  const existingPath = `v2/${logPath(SESSION, AT)}`;
  const existing = '{"at":"2026-09-18T11:00:00.000Z","kind":"ask","q":"already published","state":"miss"}\n';
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })], {
    extra: { [existingPath]: existing },
  });
  const doomed = blobSha(existing);
  const api = fakeApi(state, {
    onGetBlob: (sha) => (sha === doomed ? { ok: false, reason: 'unreachable', detail: 'HTTP 502' } : null),
  });

  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'mine', matched: [], state: 'miss' }]);
  const r = await run(env, api);

  assert.equal(r.state, 'failed');
  assert.equal(r.reason, 'unreachable');
  assert.equal(api.calls.includes('createCommit'), false, 'nothing was committed');
  assert.equal(state.files.get(existingPath), existing, 'and the published file is byte-for-byte what it was');

  // The queue is intact — including the capture's payload — so the next session ships it.
  const queue = (await readFile(join(dir, `${SESSION}.jsonl`), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(queue[0].q, 'mine');
  assert.deepEqual({ kind: queue.at(-1).kind, ok: queue.at(-1).ok }, { kind: 'flush', ok: false });
}));

test('a swept foreign queue is filed under ITS OWN session, not the pusher\'s', () => withQueue(async ({ dir, env }) => {
  // A swept file keeps its original session id, which is what makes `--sessions` exact (§15.1).
  // Filing it under the pusher would merge two sessions into one file.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'mine', matched: [], state: 'miss' }]);
  await writeQueue(dir, 'stale002', [{ at: '2026-09-18T09:00:00Z', kind: 'ask', q: 'theirs', matched: [], state: 'miss' }]);
  // Idle relative to the clock this run uses, which is `AT` — not to the wall clock.
  const old = (AT.getTime() - SWEEP_AFTER_MS * 2) / 1000;
  await utimes(join(dir, 'stale002.jsonl'), old, old);

  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  assert.deepEqual(logFiles(state), [`v2/${logPath(SESSION, AT)}`, `v2/${logPath('stale002', AT)}`].sort());
  assert.deepEqual(linesOfSession(state, 'stale002').map((l) => l.q), ['theirs'], 'and it holds only its own lines');
}));

test('a line carrying a real .env.local value is dropped, the push still happens, and the value never leaves', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const api = fakeApi(state);
  const leaky = makeEntry({ id: 'KB-33333333', subject: 'a leaky fact', anchors: ['/sign-in'] });

  await writeQueue(dir, SESSION, [
    { at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a clean question', matched: [], state: 'miss' },
    captureLine(leaky, 'I signed in with hunter2-not-really and the page did X.'),
    confirmLine('KB-11111111', 'entries/KB-11111111.md'),
  ]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed', 'losing one line is cheap; losing the session\'s whole log is not');
  assert.equal(r.dropped, 1);

  for (const [path, text] of state.files) {
    assert.ok(!text.includes('hunter2-not-really'), `the value reached ${path}`);
  }
  assert.equal(state.files.has('v2/entries/KB-33333333.md'), false, 'the mutation is not applied either');

  const lines = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.kind === 'redacted').map((l) => l.why), ['secret-scan']);
  assert.ok(lines.some((l) => l.kind === 'ask'), 'the clean line went');
  assert.equal(JSON.parse(state.files.get('v2/index.json')).entries[0].trust, 2, 'the clean confirm applied');
}));

// ─── containment ──────────────────────────────────────────────────────────────────────────────

test('a path outside entries/ index.json log/ stops the push — always, not only the first time', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state);
  // Distinct anchors on purpose: with the base entry's anchors this would be REFUSED as a
  // duplicate and converted to a confirm, and the containment check below would never be reached.
  const hostile = makeEntry({ id: 'KB-44444444', subject: 'innocent', anchors: ['/checkout'] });
  hostile.data.id = '../../.github/workflows/gates.yml';           // a hand-written queue line
  await writeQueue(dir, SESSION, [captureLine(hostile)]);

  const r = await run(env, api);
  assert.equal(r.state, 'failed');
  assert.equal(r.reason, 'contained');
  assert.equal(api.calls.includes('createBlob'), false, 'nothing was even uploaded');
}));

test('outsideBase names exactly the three paths the base owns', () => {
  const inside = ['v2/index.json', 'v2/entries/KB-11111111.md', 'v2/log/2026-09-18/x.jsonl'];
  assert.deepEqual(outsideBase(inside, 'v2'), []);
  assert.deepEqual(outsideBase([...inside, 'v2/kb.json', 'captured/x.md', 'README.md'], 'v2'),
    ['v2/kb.json', 'captured/x.md', 'README.md']);
  // kb.json is deliberately NOT writable: the manifest decides whether this is a base at all, and
  // a push that can rewrite it can turn a base into something else without anyone reading a diff.
});

test('it NORMALISES first — a prefix test alone lets `entries/../../x` through', () => {
  assert.deepEqual(
    outsideBase(['v2/entries/../../.github/workflows/gates.yml'], 'v2'),
    ['v2/entries/../../.github/workflows/gates.yml'],
  );
  for (const bad of ['v2/entries/..\\..\\x.md', '/v2/index.json', 'v2/entries/./x.md']) {
    assert.deepEqual(outsideBase([bad], 'v2'), [bad], bad);
  }
});

// ─── retention ────────────────────────────────────────────────────────────────────────────────

test('logs older than 90 days are removed in the SAME commit that writes today\'s', () => {
  const old = 'v2/log/2026-06-01/20260601T100000Z-aaaaaaaa.jsonl';      // 109 days before AT
  const recent = 'v2/log/2026-08-01/20260801T100000Z-bbbbbbbb.jsonl';   // 48 days
  assert.deepEqual(expiredLogs([old, recent, 'v2/index.json', 'v2/entries/KB-11111111.md'], { at: AT, prefix: 'v2' }), [old]);
  assert.equal(RETENTION_DAYS, 90);
});

test('a folder that is not a date is left alone rather than guessed at', () => {
  assert.deepEqual(expiredLogs(['v2/log/README.md', 'v2/log/not-a-date/x.jsonl'], { at: AT, prefix: 'v2' }), []);
});

test('retention selects a NESTED path exactly as it selected a flat one', () => {
  // `expiredLogs` takes the FIRST segment after `log/` and ignores everything below it, so the
  // session folder STEP 3c inserts should be invisible to it. That reasoning is sound and it is
  // also the kind of thing that is true until somebody adds a depth assumption for an unrelated
  // reason, so it is pinned rather than argued: all three published shapes, one window, and the
  // same verdict on each — the two old days go, today's stays, whatever depth it sits at.
  const flatStamped = 'v2/log/2026-06-01/20260601T100000Z-aaaaaaaa.jsonl';   // 109 days before AT
  const flatSeq = 'v2/log/2026-06-02/aaaaaaaa-0001.jsonl';                   // 108 days
  const nested = 'v2/log/2026-06-03/aaaaaaaa/aaaaaaaa-0001.jsonl';           // 107 days
  const keptNested = 'v2/log/2026-09-18/bbbbbbbb/bbbbbbbb-0001.jsonl';       // today
  assert.deepEqual(
    expiredLogs([flatStamped, flatSeq, nested, keptNested], { at: AT, prefix: 'v2' }),
    [flatStamped, flatSeq, nested].sort(),
  );
  // And the day is still read off the DAY folder, not off however many segments follow it: a
  // nested path under a fresh day is not expired just because it is one level deeper.
  assert.deepEqual(expiredLogs([keptNested], { at: AT, prefix: 'v2' }), []);
});

test('retention reads the date off the NAME of a current file, and leaves a non-date name alone', () => {
  const expired = `v2/${logPath('aaaaaaaa', new Date('2026-06-01T10:00:00Z'))}`;  // 109 days before AT
  const kept = `v2/${logPath('bbbbbbbb', AT)}`;                                   // today
  assert.deepEqual(expiredLogs([expired, kept], { at: AT, prefix: 'v2' }), [expired]);
  // Eight digits that are not a date, or a name with no date at all, are not guessed at.
  assert.deepEqual(expiredLogs(['v2/log/99999999-x.jsonl', 'v2/log/handwritten.jsonl', 'v2/log/20260601-x.txt'], { at: AT, prefix: 'v2' }), []);
});

test('the retention deletion rides in the push', () => withQueue(async ({ dir, env }) => {
  const stale = 'v2/log/2026-01-01/20260101T100000Z-cccccccc.jsonl';
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })], { extra: { [stale]: '{"kind":"ask"}\n' } });
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);

  assert.equal((await run(env, api)).state, 'pushed');
  assert.deepEqual(api.lastTree.entries.filter((e) => e.sha === null).map((e) => e.path), [stale]);
  assert.equal(state.files.has(stale), false);
}));

// ─── no token, no base ────────────────────────────────────────────────────────────────────────

test('no token is not an error: the queue is kept for the first session that has one', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await flush({ env, base: BASE, token: null, api: fakeApi(state), now });
  assert.equal(r.state, 'no-token');
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true);
}));

test('a DRY RUN needs no token: the review comes before the credential, not after it', () => withQueue(async ({ dir, env }) => {
  // The dry run exists to be read by a person BEFORE a push is approved. Gating it on the WRITE
  // credential would mean nobody without push access could review what their own session queued —
  // and the base is public, so every read the plan needs answers unauthenticated.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [captureLine(makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/checkout'] }))]);

  const r = await flush({ env, base: BASE, token: null, api, dryRun: true, now });
  assert.equal(r.state, 'dry-run', 'a dry run reports a PLAN, never no-token');
  assert.deepEqual(r.plan.writes.map((w) => w.path).sort(),
    ['v2/entries/KB-22222222.md', 'v2/index.json', `v2/${logPath(SESSION, AT)}`].sort());
  assert.equal(api.calls.includes('createBlob'), false, 'and it still sends nothing');
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true, 'the queue is untouched');
}));

test('a base at the REPOSITORY ROOT writes root paths — the prefix was only ever in the locator', () => withQueue(async ({ dir, env }) => {
  // The base lived under a `v2/` prefix while it shared the repository with an older corpus, and was
  // lifted to the root on 2026-09-18 when that corpus moved to an archive branch. Only the declared
  // LOCATOR changed: `coordinatesOf()` parses the prefix out, `full()` composes every path through
  // it, and `outsideBase()` / `expiredLogs()` already took it as a parameter defaulting to empty. An
  // index row's `path` reads `entries/...` either way, so not one stored byte had to be rewritten.
  const ROOT = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main';
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })], { prefix: '' });
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [captureLine(makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/checkout'] }))]);

  const r = await flush({ env, base: ROOT, token: 'test-token', api, now, sleep: async () => {} });
  assert.equal(r.state, 'pushed');
  assert.deepEqual(r.plan.writes.map((w) => w.path).sort(),
    ['entries/KB-22222222.md', 'index.json', logPath(SESSION, AT)].sort(),
    'no prefix, and no leading slash either');
  assert.equal(JSON.parse(state.files.get('index.json')).count, 2);

  // Containment still names exactly the three paths the base owns, now rooted -- and a stale `v2/`
  // path is refused rather than quietly written beside the base it used to be.
  assert.deepEqual(outsideBase(['index.json', 'entries/x.md', 'log/2026-09-18/y.jsonl'], ''), []);
  assert.deepEqual(outsideBase(['kb.json', 'README.md', 'v2/index.json'], ''),
    ['kb.json', 'README.md', 'v2/index.json']);
}));

test('a local base is not a writable one, and says so instead of guessing at a repo', async () => {
  const r = await flush({ env: { KB_QUEUE_DIR: tmpdir() }, base: 'C:/some/checkout/v2', token: 't' });
  assert.equal(r.state, 'no-base');
  assert.match(r.why, /not a writable base/);
});

test('a push to a repo that is not the declared base is REFUSED — reading it is fine, writing is not', () => withQueue(async ({ dir, env }) => {
  // PR #313 review: the write coordinates came from whatever locator the session read, so a session
  // talked into `KB_BASE=<attacker>/…` committed its whole queue there under the developer's token.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await run(env, api, { base: 'https://raw.githubusercontent.com/someone/kb-mirror/main/v2' });
  assert.equal(r.state, 'foreign-base');
  assert.match(r.why, /KB_ALLOW_ANY_BASE=1/);
  assert.deepEqual(api.calls, [], 'nothing was read, gated or sent');
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true, 'the queue is untouched');
  // The explicit, human-set escape opens it; case alone never does anything.
  const opened = await run({ ...env, KB_ALLOW_ANY_BASE: '1' }, api, { base: 'https://raw.githubusercontent.com/someone/kb-mirror/main/v2' });
  assert.equal(opened.state, 'pushed', opened.why);
}));

test('the pin compares owner/repo case-insensitively and ignores branch and prefix', () => {
  assert.equal(writeRefusal({ owner: 'virtocommerce', repo: 'VC-KNOWLEDGE', branch: 'x', prefix: 'v2' }, {}), null);
  assert.equal(WRITE_TARGET.owner, 'VirtoCommerce');
  assert.equal(WRITE_TARGET.repo, 'vc-knowledge');
  assert.ok(writeRefusal({ owner: 'VirtoCommerce', repo: 'vc-knowledge-fork' }, {}));
  assert.ok(writeRefusal({ owner: 'x', repo: 'vc-knowledge' }, { KB_ALLOW_ANY_BASE: 'true' }), 'only the literal 1 opens it');
});

test('an empty queue pushes nothing at all', () => withQueue(async ({ env }) => {
  const r = await run(env, fakeApi(makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })])));
  assert.equal(r.state, 'nothing');
}));

// ─── the sweep ────────────────────────────────────────────────────────────────────────────────

test('the sweep takes IDLE foreign queue files and never a live one', () => withQueue(async ({ dir, env }) => {
  await writeQueue(dir, SESSION, [{ kind: 'ask' }]);
  await writeQueue(dir, 'fresh001', [{ kind: 'ask' }]);
  await writeQueue(dir, 'stale002', [{ kind: 'ask' }]);
  const old = (Date.now() - SWEEP_AFTER_MS * 2) / 1000;
  await utimes(join(dir, 'stale002.jsonl'), old, old);

  const swept = await queueFiles({ env, now: () => new Date(), sweep: true, includeMine: false });
  assert.deepEqual(swept.map((f) => f.session), ['stale002'],
    'a file still being appended to by a live session is never taken mid-write');

  const all = await queueFiles({ env, now: () => new Date(), sweep: true });
  assert.deepEqual(all.map((f) => f.session).sort(), [SESSION, 'stale002']);
  assert.equal(all[0].mine, true);
}));

test('the sweep is paced by a stamp, and the stamp is written even when the push FAILED', () => withQueue(async ({ dir, env }) => {
  assert.equal(await shouldSweep({ env }), true, 'never flushed on this machine');

  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state, { onUpdateRef: () => ({ ok: false, status: 500, reason: 'unreachable', detail: 'HTTP 500' }) });
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  assert.equal((await flush({ env, base: BASE, token: 't', api, now: () => new Date(), sleep: async () => {} })).state, 'failed');

  // Pacing on success alone would make every invocation retry for as long as the network is down,
  // which is the hammering the plan rules out. The cadence IS the retry policy.
  assert.equal(await shouldSweep({ env }), false);
  assert.equal(await shouldSweep({ env, now: () => new Date(Date.now() + SWEEP_AFTER_MS * 2) }), true);
}));

// ─── small, load-bearing ──────────────────────────────────────────────────────────────────────

test('the commit message says what it did, mechanically', () => {
  assert.equal(commitMessage({ session: 'f3d05dd3', captures: 1, confirms: 2, disputes: 0, logs: 1 }),
    'kb: 1 entry, 2 confirmations, 1 log (session f3d05dd3)');
  assert.equal(commitMessage({ session: 'f3d05dd3', captures: 0, confirms: 0, disputes: 0, logs: 2 }),
    'kb: 2 logs (session f3d05dd3)');
});

test('a dry run sends nothing and shows everything', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const api = fakeApi(state);
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a new fact', anchors: ['/mine'] });
  await writeQueue(dir, SESSION, [captureLine(fresh)]);

  const r = await run(env, api, { dryRun: true });
  assert.equal(r.state, 'dry-run');
  assert.deepEqual(r.plan.writes.map((w) => w.path).sort(),
    ['v2/entries/KB-22222222.md', 'v2/index.json', `v2/${logPath(SESSION, AT)}`].sort());
  assert.equal(api.calls.includes('createBlob'), false);
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true, 'and the queue is untouched');
}));

test('the gate can decline, and declining changes nothing', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await run(env, api, { gate: async () => false });
  assert.equal(r.state, 'declined');
  assert.equal(api.calls.includes('createBlob'), false);
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true);
}));

test('the gate is shown the exact files, the message and the parent', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  let shown = null;
  await run(env, fakeApi(state), { gate: async (plan) => { shown = plan; return false; } });
  assert.equal(shown.parent, 'c0000000');
  assert.match(shown.message, /^kb: 1 log \(session f3d05dd3\)$/);
  // A log-only push carries NO index: see the test below for why that is the rule and not an
  // accident of this fixture.
  assert.deepEqual(shown.writes.map((w) => w.path), [`v2/${logPath(SESSION, AT)}`]);
  assert.deepEqual(shown.deletions, []);
}));

test('a push that moved no row leaves index.json alone — `generated` is not a reason to rewrite it', () => withQueue(async ({ dir, env }) => {
  // `generated` changes on every push by construction, so writing the index unconditionally makes
  // a log-only push rewrite the one file everybody reads for a diff that reports nothing, and
  // makes "did the index change?" unanswerable from the history. Measured on the first ordinary
  // push after the base moved to the repository root: `+1 -1`, `generated` alone.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const before = state.files.get('v2/index.json');
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed');
  assert.deepEqual(r.plan.writes.map((w) => w.path), [`v2/${logPath(SESSION, AT)}`]);
  assert.equal(state.files.get('v2/index.json'), before, 'not one byte, including the timestamp');
}));

test('...but a row that DID move is written, timestamp and all', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const before = state.files.get('v2/index.json');
  const api = fakeApi(state);
  await writeQueue(dir, SESSION, [confirmLine('KB-11111111', 'entries/KB-11111111.md')]);

  const r = await run(env, api);
  assert.equal(r.state, 'pushed');
  assert.ok(r.plan.writes.some((w) => w.path === 'v2/index.json'), 'a trust bump is a row change');
  const after = JSON.parse(state.files.get('v2/index.json'));
  assert.notEqual(state.files.get('v2/index.json'), before);
  assert.equal(after.entries[0].trust, 2);
  assert.equal(after.generated, AT.toISOString(), 'and THAT is what generated should mean');
}));

// ── the own-queue deadline (PLAN §19) ─────────────────────────────────────────────────────────
// Until 2026-09-19 a session published its own lines ONLY when stdin closed, and `sweepIfDue`
// excluded them by construction. Nobody ends a session, and an actively used one was never idle
// long enough for another session to sweep it either — so the more a session used the base, the
// less likely its evidence was to arrive at all.
test('ownFlushDue is decided by the OLDEST line, not the file mtime', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-ownflush-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { KB_QUEUE_DIR: dir, KB_SESSION: 'ownflush' };
  const path = queuePath(env);
  const line = (minutesAgo, q) => JSON.stringify({
    kind: 'ask', at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), q,
  });

  assert.equal(await ownFlushDue({ env }), false, 'an empty queue is never due');

  await writeFile(path, line(0, 'fresh') + '\n', 'utf8');
  assert.equal(await ownFlushDue({ env }), false, 'a line written now waits');

  await writeFile(path, line(6, 'old') + '\n', 'utf8');
  assert.equal(await ownFlushDue({ env }), true, 'a line older than the interval is due');

  // THE ONE THAT MATTERS. Pacing on mtime would let a session that keeps asking keep resetting its
  // own deadline — the original defect, reintroduced one level down.
  await writeFile(path, line(6, 'old') + '\n' + line(0, 'fresh') + '\n', 'utf8');
  assert.equal(await ownFlushDue({ env }), true, 'a fresh append does not postpone an old line');
});

// --- `run`: the two lines the single writer does not stamp -----------------------------------
//
// FOUND BY THE LIVE SMOKE, NOT BY THE UNIT SUITE, which is what the smoke is for. The first file
// STEP 4 published carried `run` on all seven verb lines and nothing on the `flush` line that
// summarised them -- and the flush line is the one an outsider reads first, because it is the one
// that says what was delivered. `flush` is built by hand in push.mjs (it must be: it reports on the
// very write that is happening), and `session` is about somebody ELSE's session.
//
// The two pull in OPPOSITE directions, which is why neither can be left to a default: a `flush`
// line is about a DELIVERY made by this process and takes the PUSHER's run, while a `session` line
// is about a session that has ended and takes that session's own. Exactly the split `who` above is
// pinned against, one field along.

const AS_RUN = (env, root, handle = 'VCST-1234') => ({ ...asWho(env, root), KB_RUN: handle });

test('the flush line carries the PUSHER’s run handle, like the mark and the handle beside it', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  await knowWho(dir, 'octo-pusher');
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);
  assert.equal((await run(AS_RUN(env, root), fakeApi(state))).state, 'pushed');

  // Only the flush line is asserted here, and deliberately: the queued `ask` above is a hand-written
  // FIXTURE that never went through `queue.mjs`'s writer, so it carries whatever this test put in
  // it. That the writer stamps the verb lines is `kb-log-fields.test.mjs`'s business; this file owns
  // the one line the writer does not touch.
  assert.equal(logLines(state).find((l) => l.kind === 'flush').run, 'VCST-1234');
})));

test('a pusher running under no run handle writes a flush line with none', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);
  assert.equal((await run(asWho(env, root), fakeApi(state))).state, 'pushed');

  assert.ok(!('run' in logLines(state).find((l) => l.kind === 'flush')), 'absent, never null');
})));

test('a swept queue file keeps the run ITS session wrote under, and the pusher does not restamp it', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // Two different runs in one commit is not a defect; it is the log telling the truth about who did
  // what. Re-stamping a swept line would rewrite somebody else's record to say it belonged to a
  // ticket it had nothing to do with.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const foreign = join(dir, 'abcd1234.jsonl');
  await writeFile(foreign, `${JSON.stringify({ at: '2026-09-18T09:00:00Z', kind: 'ask', q: 'somebody else asked this', matched: [], state: 'miss', run: 'REL-9' })}\n`, 'utf8');
  const old = new Date(AT.getTime() - SWEEP_AFTER_MS - 60_000);
  await utimes(foreign, old, old);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);

  assert.equal((await run(AS_RUN(env, root), fakeApi(state))).state, 'pushed');

  const theirs = state.files.get(`v2/${logPath('abcd1234', AT)}`).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(theirs[0].run, 'REL-9', 'their run, not the pusher’s');
  assert.equal(logLines(state).find((l) => l.kind === 'flush').run, 'VCST-1234');
})));

test('a published `session` line carries the run of the session it DESCRIBES', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // Stamped onto the reach state by that session's own hook while it was still running, and carried
  // from there — the same route `who` takes, for the same reason: the sweeper may be running under
  // a different ticket entirely, or none.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const quiet = reachPath(dir, 'quiet003');
  await writeFile(quiet, JSON.stringify({ session: 'quiet003', cursor: 0, tools: 300, turns: 9, touchAt: [], firstAt: '2026-09-18T08:00:00Z', lastAt: '2026-09-18T09:00:00Z', who: 'octo-quiet', run: 'REL-9' }), 'utf8');
  const old = new Date(AT.getTime() - 60 * 60 * 1000);
  await utimes(quiet, old, old);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);

  assert.equal((await run(AS_RUN(env, root), fakeApi(state))).state, 'pushed');

  const line = sessionLine(state, 'quiet003');
  assert.equal(line.session, 'quiet003');
  assert.equal(line.run, 'REL-9', 'the run it ran under, not the one that sent it');
  assert.equal(logLines(state).find((l) => l.kind === 'flush').run, 'VCST-1234', 'and ours is unaffected');
})));

test('a `session` line for a state that never saw a run handle carries none', () => withQueue(async ({ dir, env }) => withRoot(async (root) => {
  // NOT filled in from the pusher, which is the whole point: an unknown run is a gap a reader can
  // see, and a confident wrong one is a gap they cannot.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const quiet = reachPath(dir, 'quiet004');
  await writeFile(quiet, JSON.stringify({ session: 'quiet004', cursor: 0, tools: 12, turns: 2, touchAt: [], firstAt: '2026-09-18T08:00:00Z', lastAt: '2026-09-18T09:00:00Z' }), 'utf8');
  const old = new Date(AT.getTime() - 60 * 60 * 1000);
  await utimes(quiet, old, old);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'a real question?', matched: [], state: 'miss' }]);

  assert.equal((await run(AS_RUN(env, root), fakeApi(state))).state, 'pushed');

  const line = sessionLine(state, 'quiet004');
  assert.equal(line.session, 'quiet004');
  assert.ok(!('run' in line), 'no run beats the pusher’s');
})));

test('KB_ENABLED=0: the flush sends nothing and the queue is left exactly as it was', () => withQueue(async ({ dir, env }) => {
  const api = fakeApi(makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]));
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const r = await run({ ...env, KB_ENABLED: '0' }, api);
  assert.equal(r.state, 'disabled');
  assert.deepEqual(api.calls, []);
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true);
}));

// ─── the queue is released by what was READ, not deleted whole (PR #313 review) ───────────────

test('a line appended WHILE the push is in flight survives it — only the consumed bytes are released', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state);
  const file = join(dir, `${SESSION}.jsonl`);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  // The capture that follows an ask by seconds, landing between the read and the ref update.
  const late = captureLine(makeEntry({ id: 'KB-33333333', subject: 'written mid-push', anchors: ['/late'] }));
  const update = api.updateRef;
  api.updateRef = async (args) => { await appendFile(file, `${JSON.stringify(late)}\n`, 'utf8'); return update(args); };
  const r = await run(env, api);
  assert.equal(r.state, 'pushed', r.why);
  const left = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(left, [late], 'the late capture is still queued, and nothing already published is');
}));

test('releaseConsumed keeps everything when the file is not the one that was read', () => withQueue(async ({ dir }) => {
  const file = join(dir, 'x.jsonl');
  await writeFile(file, 'b\n', 'utf8');
  const r = await releaseConsumed(file, Buffer.from('a\n'));
  assert.deepEqual(r, { released: 0, kept: 2 });
  assert.equal(await readFile(file, 'utf8'), 'b\n');
  assert.deepEqual(await releaseConsumed(join(dir, 'gone.jsonl'), Buffer.from('a')), { released: 0, kept: 0 });
}));

test('orderQueue restores write order by `at`, stable, and an undated line keeps its place', () => {
  const lines = [{ at: '2026-09-18T10:05:00.000Z', n: 3 }, { at: '2026-09-18T10:01:00.000Z', n: 1 }, { n: 2 }, { at: '2026-09-18T10:01:00.000Z', n: 4 }];
  assert.deepEqual(orderQueue(lines).map((l) => l.n), [1, 2, 4, 3]);
});

// ─── a re-applied mutation is not a second observation (PR #313 review) ───────────────────────

test('a capture pushed TWICE leaves ONE evidence item — no inflated trust, no conversion counted', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const fresh = makeEntry({ id: 'KB-22222222', subject: 'a brand new fact', anchors: ['/checkout/shipping'] });
  const line = captureLine(fresh);
  await writeQueue(dir, SESSION, [line]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  // The same queue line again: a lost CAS retried, or a second pusher before the release.
  await writeQueue(dir, SESSION, [line]);
  const r2 = await run(env, fakeApi(state));
  assert.equal(r2.state, 'pushed', r2.why);
  assert.equal(r2.converted, 0, 'a repeat is not a conversion');
  const { data } = parseEntry(state.files.get('v2/entries/KB-22222222.md'), 'KB-22222222');
  assert.equal(data.evidence.length, 1);
  assert.equal(linesOfSession(state, SESSION).filter((l) => l.kind === 'capture-refused').length, 0);
}));

test('a confirm applied twice appends once; a genuinely later observation still appends', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const c = confirmLine('KB-11111111', 'entries/KB-11111111.md');
  await writeQueue(dir, SESSION, [c, c]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  const later = { ...c, payload: { ...c.payload, item: { ...c.payload.item, at: '2026-09-18T10:41:00Z' } } };
  await writeQueue(dir, SESSION, [c, later]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  const { data } = parseEntry(state.files.get('v2/entries/KB-11111111.md'), 'KB-11111111');
  assert.equal(data.evidence.length, 3, 'the seed, the confirm once, and the later one');
}));

test('sameEvidence is exact on the observation key', () => {
  const e = { at: 'a', by: 's', method: 'observation', deployment: 'd' };
  assert.equal(sameEvidence(e, { ...e, note: 'different prose is still the same observation' }), true);
  assert.equal(sameEvidence(e, { ...e, at: 'b' }), false);
  assert.equal(sameEvidence(e, { ...e, contradicts: true }), false);
});

// ─── a push that fails is visible afterwards (PR #313 review) ─────────────────────────────────

test('a 403 on every push is RECORDED, sticky across a later "nothing", and cleared only by a push that lands', () => withQueue(async ({ dir, env }) => {
  // The persistent case the detached hook hid: a token without push rights.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const denied = fakeApi(state, { onUpdateRef: () => ({ ok: false, status: 403, reason: 'denied', detail: 'HTTP 403' }) });
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  assert.equal((await run(env, denied)).state, 'failed');
  let s = readPushStatus(env);
  assert.equal(s.last.state, 'failed');
  assert.equal(s.lastFailure.state, 'failed');
  // 2: the ask, and the failed flush line the push queues about itself.
  assert.equal(queueBacklog(env).lines, 2, 'the queue is still there, and stat can say so');
  assert.equal(queueBacklog(env).oldest, '2026-09-18T10:02:00Z');

  // It drains, and the failure is cleared — not by "nothing to do", only by a push that landed.
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  assert.equal((await run(env, fakeApi(state))).state, 'nothing');
  s = readPushStatus(env);
  assert.equal(s.last.state, 'nothing');
  assert.equal(s.lastFailure, null);
  assert.equal(s.lastPushed.state, 'pushed');
  assert.ok(s.lastPushed.commit);
}));

test('a refused foreign base is recorded as a failure too, and a dry run is not recorded at all', () => withQueue(async ({ dir, env }) => {
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  await run(env, fakeApi(makeBase([])), { dryRun: true });
  assert.deepEqual(readPushStatus(env), {});
  await run(env, fakeApi(makeBase([])), { base: 'https://raw.githubusercontent.com/someone/else/main/v2' });
  assert.equal(readPushStatus(env).lastFailure.state, 'foreign-base');
  assert.ok(!JSON.stringify(readPushStatus(env)).includes('"q"'), 'no queue line is ever stored in the status');
}));

// ─── KB_PUSH_CONFIRM=1: nobody to ask means nothing is sent (PR #313 review) ──────────────────

test('KB_PUSH_CONFIRM=1: a push with no gate HOLDS — nothing read, nothing sent, queue intact', () => withQueue(async ({ dir, env }) => {
  const api = fakeApi(makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]));
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const confirmEnv = { ...env, KB_PUSH_CONFIRM: '1' };
  const r = await run(confirmEnv, api);
  assert.equal(r.state, 'held');
  assert.deepEqual(api.calls, []);
  assert.equal(existsSync(join(dir, `${SESSION}.jsonl`)), true);
  assert.equal(readPushStatus(confirmEnv).last.state, 'held', 'the hold is visible in stat');
  // The sweep path holds too — it never carries a gate.
  assert.equal(r.why.includes('npm run kb -- push'), true);
}));

test('KB_PUSH_CONFIRM=1: a push WITH a gate is shown the plan and sends only on yes', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  const confirmEnv = { ...env, KB_PUSH_CONFIRM: '1' };
  assert.equal((await run(confirmEnv, fakeApi(state), { gate: async () => false })).state, 'declined');
  let shown = null;
  const r = await run(confirmEnv, fakeApi(state), { gate: async (plan) => { shown = plan; return true; } });
  assert.equal(r.state, 'pushed', r.why);
  assert.ok(shown?.writes?.length, 'the operator saw what was written');
}));
