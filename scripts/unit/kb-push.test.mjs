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
import { join } from 'node:path';

import { stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { buildIndex, buildRow, entryPath } from '../kb/core/index-build.mjs';
import {
  RETENTION_DAYS, SWEEP_AFTER_MS, appendEvidence, commitMessage, expiredLogs, flush, logPath,
  outsideBase, queueFiles, shouldSweep,
} from '../kb/core/push.mjs';

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
function makeBase(entries, { generated = '2026-09-18T09:00:00Z', extra = {} } = {}) {
  const files = new Map(Object.entries(extra));
  for (const e of entries) files.set(`v2/${e.path}`, e.text);
  const index = buildIndex(entries.map((e) => buildRow(e.data, e.path)), { generated });
  files.set('v2/index.json', `${JSON.stringify(index, null, 2)}\n`);
  return { head: 'c0000000', files };
}

/** The Git Data API, in memory. `onUpdateRef` is how the ref is made to move under our feet. */
function fakeApi(state, { onUpdateRef = null } = {}) {
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

test('the log path is date folder, UTC stamp, session id', () => {
  assert.equal(logPath('f3d05dd3', new Date('2026-09-18T11:10:03Z')), 'log/2026-09-18/20260918T111003Z-f3d05dd3.jsonl');
  // The session id is not decoration: two sessions can start in the same second, and one session
  // can push twice. Without it, one session's log silently replaces another's.
  assert.notEqual(logPath('aaaaaaaa', AT), logPath('bbbbbbbb', AT));
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
  const refused = state.files.get(`v2/${logPath(SESSION, AT)}`).trim().split('\n')
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
  assert.deepEqual(shown.writes.map((w) => w.path), ['v2/index.json', `v2/${logPath(SESSION, AT)}`]);
  assert.deepEqual(shown.deletions, []);
}));
