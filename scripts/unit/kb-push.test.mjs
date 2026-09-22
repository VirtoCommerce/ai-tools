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
import { readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { buildIndex, buildRow, entryPath } from '../kb/core/index-build.mjs';
import {
  RETENTION_DAYS, SWEEP_AFTER_MS, appendEvidence, commitMessage, expiredLogs, flush, logPath,
  outsideBase, ownFlushDue, queueFiles, readSeq, seqLabel, shouldSweep, unionLines,
} from '../kb/core/push.mjs';
import { queuePath } from '../kb/core/queue.mjs';
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

const captureLine = (entry, body = 'The claim, in prose.') => ({
  at: '2026-09-18T10:15:00Z', kind: 'capture', id: entry.data.id, subject: entry.data.subject,
  payload: { entry: entry.data, body, key: 'k' },
});

const confirmLine = (id, path) => ({
  at: '2026-09-18T10:40:00Z', kind: 'confirm', id, deployment: 'vcptcore_stable', trust: 2,
  payload: { id, path, item: { method: 'observation', deployment: 'vcptcore_stable', at: '2026-09-18T10:40:00Z', by: `session:${SESSION}` } },
});

const run = (env, api, over = {}) => flush({ env, base: BASE, token: 'test-token', api, now, sleep: async () => {}, ...over });

/** This session's pushed log file, parsed. */
const logLines = (state) => state.files.get(`v2/${logPath(SESSION, AT, 1)}`)
  .trim().split('\n').map((l) => JSON.parse(l));

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
    `v2/${logPath(SESSION, AT, 1)}`,
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

  const log = state.files.get(`v2/${logPath(SESSION, AT, 1)}`);
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

  const lines = state.files.get(`v2/${logPath(SESSION, AT, 1)}`).trim().split('\n').map((l) => JSON.parse(l));
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

  const theirs = state.files.get(`v2/${logPath('abcd1234', AT, 1)}`).trim().split('\n').map((l) => JSON.parse(l));
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

  const line = logLines(state).find((l) => l.kind === 'session');
  assert.equal(line.session, 'quiet001');
  assert.equal(line.who, 'octo-quiet', 'the person who ran it, not the person who sent it');
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

  const line = logLines(state).find((l) => l.kind === 'session');
  assert.equal(line.session, 'quiet002');
  assert.ok(!('who' in line), 'no identity beats the pusher’s');
})));

test('the log path is date folder, session FOLDER, session id, and the push SEQUENCE — no wall clock', () => {
  assert.equal(logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z'), 3),
    'log/2026-09-18/f3d05dd3/f3d05dd3-0003.jsonl');
  // The session id is not decoration: two sessions can start in the same second, and one session
  // can push twice. Without it, one session's log silently replaces another's.
  assert.notEqual(logPath('aaaaaaaa', AT, 1), logPath('bbbbbbbb', AT, 1));
  // AND THE TIME OF DAY IS NOT IN IT. Two processes publishing one queue do not share a clock, so
  // a stamp made them two files holding the same lines; they DO compute the same sequence number,
  // so they now compute the same path.
  assert.equal(logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z'), 3),
    logPath('f3d05dd3', new Date('2026-09-18T11:10:11Z'), 3), 'eight seconds apart, one path');
  assert.equal(seqLabel(3), '0003');
  assert.equal(seqLabel(10_000), '10000', 'the width is a floor, not a ceiling');
});

test('the FILE NAME did not change when the folder appeared — which is why no parser did', () => {
  // The whole safety argument of STEP 3c in one assertion (PLAN §21.11). The directory is additive:
  // strip it and you have byte-for-byte what STEP 3b published, so `sessionOf()` — which reads the
  // BASENAME and nothing else — needs no third shape and no change of premise.
  const nested = logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z'), 3);
  assert.equal(basename(nested), 'f3d05dd3-0003.jsonl');
  assert.equal(nested.split('/').slice(0, 3).join('/') + '/' + basename(nested),
    nested, 'exactly one directory was inserted, in the middle');

  // And the reader gets the same answer off the nested path as off the flat one. This is the
  // assertion that would fail if anybody later "tidied up" the repetition into `<seq>.jsonl`.
  assert.equal(sessionOf(nested), 'f3d05dd3');
  assert.equal(sessionOf('log/2026-09-18/f3d05dd3-0003.jsonl'), 'f3d05dd3');
  assert.equal(dayOf(nested), '2026-09-18');

  // A file DETACHED from its path still names its session — the second reason the name repeats:
  // downloaded, attached to a ticket, pasted into a report, it is still self-describing.
  assert.equal(sessionOf(basename(nested)), 'f3d05dd3');
});

test('an all-digit session key still parses under the nested path', () => {
  // STEP 3b's load-bearing case, re-run through the new shape rather than restated: a session key
  // may be all digits, so a stamped name satisfies the sequenced pattern too and the ORDER the two
  // are tried in is what keeps it right. Nesting must not disturb that, and it cannot, because the
  // basename is untouched — but "cannot" is a claim and this is the test of it.
  assert.equal(sessionOf(logPath('12345678', AT, 2)), '12345678');
  assert.equal(sessionOf('log/2026-09-21/20260921T090000Z-12345678.jsonl'), '12345678');
});

test('a session key that cannot be a path segment is refused by containment, not published', () => {
  // The key is now a DIRECTORY as well as part of a file name, so what it can carry matters more
  // than it did (PLAN §7.1a's lesson). `shortSession()` already refuses anything outside
  // [A-Za-z0-9_-], and a swept foreign queue file named `..jsonl` would yield `.` — which the flat
  // shape published as a strange but legal file name and the nested one now FAILS CLOSED on,
  // because `outsideBase()` rejects a `.` or `..` segment outright. Stricter, in the safe direction.
  for (const key of ['.', '..']) {
    assert.deepEqual(outsideBase([`v2/${logPath(key, AT, 1)}`], 'v2'), [`v2/${logPath(key, AT, 1)}`], key);
  }
  // An ordinary key is of course still inside.
  assert.deepEqual(outsideBase([`v2/${logPath('f3d05dd3', AT, 1)}`], 'v2'), []);
});

test('a path with no sequence number is REFUSED, not defaulted to the first file', () => {
  // A default would union a push's lines into the session's FIRST file, which surfaces as a log
  // file nobody can explain — the failure mode this whole change exists to remove, reintroduced
  // through the convenience of a fallback.
  for (const bad of [undefined, null, 0, -1, 1.5, 'three']) {
    assert.throws(() => logPath('f3d05dd3', AT, bad), /sequence number/, String(bad));
  }
});

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

  const lines = state.files.get(`v2/${logPath(SESSION, AT, 1)}`).trim().split('\n').map((l) => JSON.parse(l));
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

test('an id collision converts too — writing the blob would REPLACE somebody else\'s entry', () => withQueue(async ({ dir, env }) => {
  // The id is minted from the subject, so two entries with one id have the same subject verbatim.
  // Different anchors means the anchors+scope test misses it; the blob write would not.
  const theirs = makeEntry({ id: 'KB-AAAAAAAA', subject: 'one subject', anchors: ['/theirs'], body: 'THEIR PROSE' });
  const state = makeBase([theirs]);
  const mine = makeEntry({ id: 'KB-AAAAAAAA', subject: 'one subject', anchors: ['/mine'], body: 'MY PROSE' });
  await writeQueue(dir, SESSION, [captureLine(mine, 'MY PROSE')]);

  const r = await run(env, fakeApi(state));
  assert.equal(r.converted, 1);
  const entry = state.files.get('v2/entries/KB-AAAAAAAA.md');
  assert.ok(entry.includes('THEIR PROSE'), 'their prose survived');
  assert.ok(!entry.includes('MY PROSE'));
  const refused = state.files.get(`v2/${logPath(SESSION, AT, 1)}`).trim().split('\n')
    .map((l) => JSON.parse(l)).find((l) => l.kind === 'capture-refused');
  assert.equal(refused.why, 'id-collision');
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
// The whole fix is that the path stops carrying a wall clock. Two processes publishing one queue
// do not share a clock; they do share a counter, so they compute one path — and a path written
// twice is MERGED. These tests are about the three ways that can go wrong: the number moving
// between attempts, the merge losing a line, and the read the merge depends on failing.

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

test('two pushes of ONE queue write ONE file, and the second merges into it', () => withQueue(async ({ dir, env }) => {
  // The published incident, reproduced. Process B loaded the queue before A removed it, so B's view
  // of this machine is the one restored here: the queue file as it was, and a counter A had not yet
  // advanced — `writeSeq` runs after the removal precisely so that ordering holds.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const queued = [
    { at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'first question', matched: [], state: 'miss' },
    { at: '2026-09-18T10:03:00Z', kind: 'ask', q: 'second question', matched: [], state: 'miss' },
    { at: '2026-09-18T10:04:00Z', kind: 'ask', q: 'third question', matched: [], state: 'miss' },
  ];
  await writeQueue(dir, SESSION, queued);

  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  assert.equal(await readSeq(env, SESSION), 1, 'the counter advanced once the queue was gone');

  await writeQueue(dir, SESSION, queued);                   // B's copy, loaded before A removed it
  await rm(join(dir, `${SESSION}.seq`), { force: true });   // and B's counter read, taken before A's write
  // Eight seconds later, which is the interval the base actually recorded — and under the old
  // naming that alone was enough to make a second file.
  const later = new Date(AT.getTime() + 8_000);
  assert.equal((await run(env, fakeApi(state), { now: () => later })).state, 'pushed');

  const logs = [...state.files.keys()].filter((p) => p.startsWith('v2/log/'));
  assert.deepEqual(logs, [`v2/${logPath(SESSION, AT, 1)}`], 'ONE file — the timestamp is what made it two');

  const lines = state.files.get(logs[0]).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.kind === 'ask').map((l) => l.q),
    ['first question', 'second question', 'third question'],
    'each question counted ONCE — the inflation is what made that window unreadable');
  // BOTH flush lines stay. Two deliveries really did happen and a log that describes its own
  // delivery has to say so; what this removes is the double COUNTING of the work, not the evidence
  // that somebody published it twice.
  assert.equal(lines.filter((l) => l.kind === 'flush').length, 2);
}));

test('a session pushing TWICE over its life gets 0001 then 0002 — the number is not frozen', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'one', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:20:00Z', kind: 'ask', q: 'two', matched: [], state: 'miss' }]);
  assert.equal((await run(env, fakeApi(state))).state, 'pushed');

  assert.deepEqual(
    [...state.files.keys()].filter((p) => p.startsWith('v2/log/')).sort(),
    [`v2/${logPath(SESSION, AT, 1)}`, `v2/${logPath(SESSION, AT, 2)}`],
    'two genuine publications are two files, and they sort in the order they happened',
  );
  assert.equal(await readSeq(env, SESSION), 2);
}));

test('a FAILED push does not advance the number — nothing was published', () => withQueue(async ({ dir, env }) => {
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  const api = fakeApi(state, { onUpdateRef: () => ({ ok: false, status: 500, reason: 'unreachable', detail: 'HTTP 500' }) });
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'x', matched: [], state: 'miss' }]);
  assert.equal((await run(env, api)).state, 'failed');
  assert.equal(await readSeq(env, SESSION), 0, 'the next attempt is still this session\'s first');
}));

test('readSeq resolves every uncertainty DOWNWARDS — missing, blank or nonsense is 0', () => withQueue(async ({ dir, env }) => {
  // Under-counting writes a path that already exists and is merged into; over-counting writes a
  // second file holding the same lines, which is the defect. So the asymmetry is deliberate and
  // pinned: nothing here may ever guess high.
  assert.equal(await readSeq(env, SESSION), 0, 'no file at all');
  for (const junk of ['', '   ', 'seven', '-3', '{"n":2}']) {
    await writeFile(join(dir, `${SESSION}.seq`), junk, 'utf8');
    assert.equal(await readSeq(env, SESSION), 0, JSON.stringify(junk));
  }
  await writeFile(join(dir, `${SESSION}.seq`), '4\n', 'utf8');
  assert.equal(await readSeq(env, SESSION), 4);
}));

test('the path does NOT move between CAS attempts — and the loser merges into the winner\'s file', () => withQueue(async ({ dir, env }) => {
  // RULE 1, and it is the easy one to get wrong silently. The sequence is taken once, before the
  // first attempt. Recomputing it after a lost compare-and-swap would see the WINNER'S file already
  // in the tree, take the next number, and write the duplicate this whole change removes.
  //
  // THIS TEST DID NOT ACTUALLY PIN THAT UNTIL 2026-09-22 (PLAN §22.2, finding F2). It scripted a
  // real 422 and asserted the two trees matched — and it would have gone on passing with the rule
  // deleted, because the number comes off a LOCAL `.seq` file and, inside one process, nothing
  // moves that file between attempt 1 and attempt 2. A recomputation would have read the same 0 and
  // reached the same answer. The test was measuring an arithmetic coincidence, not an ordering.
  //
  // What was missing is the other process. The winner does not only put its file in the tree, it
  // also advances the shared counter when its own queue file is gone (`writeSeq`) — and THAT is the
  // fact a recomputation on attempt 2 would read. So the winner now does both, and the assertion
  // below has teeth: with the rule intact attempt 2 still writes `-0001`; with the sequence moved
  // inside the retry loop it reads the advanced counter, takes `-0002`, and writes a second file
  // holding the same lines, which is the duplicate the base actually suffered.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  const theirLine = '{"at":"2026-09-18T11:09:00.000Z","kind":"ask","q":"the winner\'s question","state":"miss"}';

  const api = fakeApi(state, {
    onUpdateRef: (attempt, s) => {
      if (attempt > 1) return null;
      // The other process publishes THE SAME SESSION'S queue and wins the swap — which is exactly
      // what happened in the base, and the only reason nothing was lost there was luck.
      s.files.set(`v2/${logPath(SESSION, AT, 1)}`, `${theirLine}\n`);
      s.head = 'c0000001';
      return { ok: false, status: 422, reason: 'conflict', detail: 'ref moved' };
    },
  });
  const trees = [];
  const realTree = api.createTree;
  api.createTree = async (arg) => { trees.push(arg); return realTree(arg); };

  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'my question', matched: [], state: 'miss' }]);
  // The injected `sleep` is the window between the lost swap and the retry — the winner finishes
  // its own push there, counter included. It is used as the hook rather than a new seam precisely
  // because it already sits at the one moment this rule is about.
  const r = await run(env, api, {
    sleep: async () => { await writeFile(join(dir, `${SESSION}.seq`), '1\n', 'utf8'); },
  });
  assert.equal(r.state, 'pushed');
  assert.equal(r.attempts, 2, 'the retry ran, so the counter really was advanced between attempts');

  const logOf = (t) => t.entries.map((e) => e.path).filter((p) => p.startsWith('v2/log/'));
  assert.equal(trees.length, 2);
  assert.deepEqual(logOf(trees[0]), logOf(trees[1]), 'the retry wrote to the SAME path, not the next one');
  assert.deepEqual(logOf(trees[1]), [`v2/${logPath(SESSION, AT, 1)}`]);

  // And re-reading the head is what makes writing to that same path safe.
  const text = state.files.get(`v2/${logPath(SESSION, AT, 1)}`);
  assert.ok(text.startsWith(`${theirLine}\n`), 'the winner\'s line survived the loser\'s write');
  assert.ok(text.includes('my question'), 'and the loser\'s own line is there too');
}));

test('the counter advances AFTER the queue file is gone, never before', () => withQueue(async ({ dir, env }) => {
  // RULE 2, and until 2026-09-22 it was pinned by nothing at all (PLAN §22.2, finding F2). The
  // argument is in `writeSeq`: take A and B publishing one session's queue. B holds the lines, so B
  // read the queue file before A removed it. If A advanced the counter at the moment it LANDED,
  // B's counter read could still fall after it, B would take the next number, and the duplicate is
  // back. Advancing after the removal orders them — B's counter read precedes B's queue read,
  // precedes A's removal, precedes A's advance — so B cannot see the higher number.
  //
  // WHY THIS NEEDS AN INJECTED REMOVAL AND NOT A CLEVERER ASSERTION. It is a claim about the ORDER
  // of two effects, and by the time `flush` returns both have happened; from outside, the two
  // orderings are indistinguishable. That is the whole of the defect the review found: the rule
  // could be deleted and 468 tests stayed green. The observer has to stand BETWEEN them, and a
  // seam is the only way to put it there. What it watches is real and concurrent, so the seam buys
  // a property rather than merely exercising a line.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact', anchors: ['/cart'] })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'my question', matched: [], state: 'miss' }]);

  const seenAtRemoval = [];
  const r = await run(env, fakeApi(state), {
    removeQueueFile: async (path) => {
      // Exactly what a concurrent B would read at this instant, off the same shared counter file.
      seenAtRemoval.push(await readSeq(env, SESSION));
      await rm(path, { force: true });
    },
  });

  assert.equal(r.state, 'pushed');
  assert.deepEqual(seenAtRemoval, [0], 'a second process reading here still gets this session\'s first number');
  assert.equal(await readSeq(env, SESSION), 1, 'and it is advanced by the time the push returns');
  // The removal really is the injected one, so a future refactor that stops calling it fails here
  // rather than silently losing the observation point.
  assert.ok(!existsSync(queuePath(env)), 'the queue file is gone');
}));

test('a FAILED READ of the existing log aborts the push — it never falls through to an overwrite', () => withQueue(async ({ dir, env }) => {
  // THE ONE NEW WAY THIS CHANGE COULD LOSE DATA, so it gets a scripted transport rather than a
  // neighbouring test's side effect: reading the current content is what makes the merge a merge,
  // and code that treats a failed read as "no file there" writes a subset over a superset. The rule
  // is NO FILE → CREATE, READ FAILED → ABORT; the queue survives and the next push retries, which
  // is what every other failure in push.mjs already does.
  const existingPath = `v2/${logPath(SESSION, AT, 1)}`;
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
  assert.equal(await readSeq(env, SESSION), 0, 'and the number is unspent');
}));

test('a swept foreign queue is numbered under ITS OWN session, not the pusher\'s', () => withQueue(async ({ dir, env }) => {
  // A swept file keeps its original session id, which is what makes `--sessions` exact (§15.1). The
  // sequence has to follow it there: numbering a foreign log under the pusher's counter would make
  // two sessions share a path and one of them would be merged into the other's file.
  const state = makeBase([makeEntry({ id: 'KB-11111111', subject: 'a fact' })]);
  await writeQueue(dir, SESSION, [{ at: '2026-09-18T10:02:00Z', kind: 'ask', q: 'mine', matched: [], state: 'miss' }]);
  await writeQueue(dir, 'stale002', [{ at: '2026-09-18T09:00:00Z', kind: 'ask', q: 'theirs', matched: [], state: 'miss' }]);
  // Idle relative to the clock this run uses, which is `AT` — not to the wall clock.
  const old = (AT.getTime() - SWEEP_AFTER_MS * 2) / 1000;
  await utimes(join(dir, 'stale002.jsonl'), old, old);

  assert.equal((await run(env, fakeApi(state))).state, 'pushed');
  assert.deepEqual(
    [...state.files.keys()].filter((p) => p.startsWith('v2/log/')).sort(),
    [`v2/${logPath(SESSION, AT, 1)}`, `v2/${logPath('stale002', AT, 1)}`].sort(),
  );
  assert.equal(await readSeq(env, 'stale002'), 1, 'the swept session\'s own count advanced');
}));

// ─── the secret gate, in the push ─────────────────────────────────────────────────────────────

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

  const lines = state.files.get(`v2/${logPath(SESSION, AT, 1)}`).trim().split('\n').map((l) => JSON.parse(l));
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
  const keptNested = `v2/${logPath('bbbbbbbb', AT, 1)}`;                     // today
  assert.deepEqual(
    expiredLogs([flatStamped, flatSeq, nested, keptNested], { at: AT, prefix: 'v2' }),
    [flatStamped, flatSeq, nested].sort(),
  );
  // And the day is still read off the DAY folder, not off however many segments follow it: a
  // nested path under a fresh day is not expired just because it is one level deeper.
  assert.deepEqual(expiredLogs([keptNested], { at: AT, prefix: 'v2' }), []);
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
    ['v2/entries/KB-22222222.md', 'v2/index.json', `v2/${logPath(SESSION, AT, 1)}`].sort());
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
    ['entries/KB-22222222.md', 'index.json', logPath(SESSION, AT, 1)].sort(),
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
    ['v2/entries/KB-22222222.md', 'v2/index.json', `v2/${logPath(SESSION, AT, 1)}`].sort());
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
  assert.deepEqual(shown.writes.map((w) => w.path), [`v2/${logPath(SESSION, AT, 1)}`]);
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
  assert.deepEqual(r.plan.writes.map((w) => w.path), [`v2/${logPath(SESSION, AT, 1)}`]);
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

  const theirs = state.files.get(`v2/${logPath('abcd1234', AT, 1)}`).trim().split('\n').map((l) => JSON.parse(l));
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

  const line = logLines(state).find((l) => l.kind === 'session');
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

  const line = logLines(state).find((l) => l.kind === 'session');
  assert.equal(line.session, 'quiet004');
  assert.ok(!('run' in line), 'no run beats the pusher’s');
})));
