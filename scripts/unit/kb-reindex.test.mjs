// `reindex` — the repair verb (scripts/kb/core/verbs.mjs, PLAN §2).
//
// NOT ONE NETWORK CALL IN THIS FILE. Every base here is a temporary copy of the fixture directory.
//
// WHAT IS UNDER TEST, and why it is not "does it write a file": `reindex` is the remedy that three
// user-facing drift messages name. Those messages are worth nothing unless running it actually
// RECONCILES the index with the entries -- and unless it says what moved, because a row that
// vanished is either the drift being fixed or an entry that stopped parsing, and only an operator
// can tell those apart. A repair that silently drops what it cannot understand is worse than no
// repair at all: it turns a loud inconsistency into a quiet omission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBase } from '../kb/core/base.mjs';
import { publicLocator, reindex } from '../kb/core/verbs.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');

/** A throwaway copy of the fixture base, so a test that mutates it cannot reach the next one. */
async function withBase(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reindex-'));
  const queue = mkdtempSync(join(tmpdir(), 'kb-reindex-q-'));
  cpSync(FIXTURE, dir, { recursive: true });
  try {
    // AWAITED inside the try, not returned out of it: `return fn(...)` hands the promise back and
    // lets `finally` delete the directory while the test is still using it.
    return await fn({ dir, env: { ...process.env, KB_QUEUE_DIR: queue } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(queue, { recursive: true, force: true });
  }
}

const open = (dir) => openBase({ baseArg: dir, env: { ...process.env, KB_BASE: '' } });
const readIndex = (dir) => JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

// ─── the invariant: rebuilding an intact base changes nothing ──────────────────────────────────

test('reindexing an intact base reproduces every row and reports nothing moved', async () => {
  // The strongest statement this verb can make. The fixture index was written by hand from PLAN §2;
  // if the builder disagreed with it, the repair verb would "fix" a correct base into a different
  // one every time somebody ran it.
  //
  // Compared ROW BY ROW, keyed by id, rather than as whole files: the fixture was hand-written in
  // no particular order and `buildIndex` sorts by id, so a file comparison would fail on the one
  // difference that carries no information. The order is asserted separately, below, where it is
  // the actual subject.
  await withBase(async ({ dir, env }) => {
    const before = readIndex(dir);
    const r = await reindex(open(dir), { env, generated: before.generated });
    assert.equal(r.state, 'answer');
    assert.equal(r.entries, before.count);
    assert.deepEqual(r.added, []);
    assert.deepEqual(r.removed, []);
    assert.deepEqual(r.retrusted, []);
    assert.deepEqual(r.problems, []);

    const after = readIndex(dir);
    assert.equal(after.count, before.count);
    assert.equal(after.schema, before.schema);
    for (const was of before.entries) {
      assert.deepEqual(after.entries.find((x) => x.id === was.id), was, `${was.id} was rewritten`);
    }
  });
});

test('the rebuilt index is sorted by id, so two operators repairing one base get the same bytes', async () => {
  await withBase(async ({ dir, env }) => {
    await reindex(open(dir), { env });
    const ids = readIndex(dir).entries.map((r) => r.id);
    assert.deepEqual(ids, [...ids].sort());
  });
});

test('--dry-run reports the same thing and writes nothing', async () => {
  await withBase(async ({ dir, env }) => {
    const before = readFileSync(join(dir, 'index.json'), 'utf8');
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ schema: 1, count: 0, entries: [] }));
    const wrecked = readFileSync(join(dir, 'index.json'), 'utf8');
    const r = await reindex(open(dir), { env, write: false });
    assert.equal(r.state, 'answer');
    assert.equal(r.added.length, 6, 'it must still say what it would do');
    assert.equal(readFileSync(join(dir, 'index.json'), 'utf8'), wrecked, 'a dry run writes nothing');
    assert.notEqual(wrecked, before);
  });
});

// ─── the three kinds of drift it exists for ───────────────────────────────────────────────────

test('an entry present but not indexed is ADDED and named', async () => {
  await withBase(async ({ dir, env }) => {
    writeFileSync(join(dir, 'entries', 'KB-0000FEED.md'),
      '---\nid: KB-0000FEED\nsubject: a new subject\nplane: experiential\nquestion: q?\nstatus: active\n'
      + 'appliesTo:\n  - axis: surface\n    value: storefront-ui\nanchors:\n  - coordinate: /x\n'
      + 'evidence:\n  - method: observation\n    deployment: d\n---\n\nbody\n');
    const r = await reindex(open(dir), { env });
    assert.deepEqual(r.added, ['KB-0000FEED']);
    assert.ok(readIndex(dir).entries.some((x) => x.id === 'KB-0000FEED'));
  });
});

test('an indexed entry whose file is gone is REMOVED and named', async () => {
  // This is the exact drift `ask` reports as "the index names <path>, which is not in the base".
  await withBase(async ({ dir, env }) => {
    rmSync(join(dir, 'entries', 'KB-27B4CD10.md'));
    const r = await reindex(open(dir), { env });
    assert.deepEqual(r.removed, ['KB-27B4CD10']);
    assert.equal(readIndex(dir).count, 5);
  });
});

test('a trust that no longer matches evidence[] is corrected and reported', async () => {
  // The other drift message: "index says trust 4, evidence[] has 3 — run `kb reindex`". If running
  // it did not actually move the number, the message would be sending people somewhere useless.
  await withBase(async ({ dir, env }) => {
    const file = join(dir, 'index.json');
    const idx = JSON.parse(readFileSync(file, 'utf8'));
    const row = idx.entries.find((x) => x.id === 'KB-27B4CD10');
    const real = row.trust;
    row.trust = real + 7;
    writeFileSync(file, JSON.stringify(idx, null, 2));

    const r = await reindex(open(dir), { env });
    assert.deepEqual(r.retrusted, [{ id: 'KB-27B4CD10', was: real + 7, now: real }]);
    assert.equal(readIndex(dir).entries.find((x) => x.id === 'KB-27B4CD10').trust, real);
  });
});

// ─── what it refuses to guess about ───────────────────────────────────────────────────────────

test('an unparseable entry is a PROBLEM, not a silent omission', async () => {
  await withBase(async ({ dir, env }) => {
    writeFileSync(join(dir, 'entries', 'KB-0000BAD1.md'), 'not frontmatter at all\n');
    const r = await reindex(open(dir), { env });
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].path, 'entries/KB-0000BAD1.md');
    assert.equal(r.entries, 6, 'the other six are still indexed');
  });
});

test('a file whose name disagrees with its own frontmatter id is a PROBLEM', async () => {
  // Two entries wearing one address. The id is derived from the subject, so this is never a thing
  // to guess about -- and picking either one would make a citation resolve to the wrong claim.
  await withBase(async ({ dir, env }) => {
    const text = readFileSync(join(dir, 'entries', 'KB-27B4CD10.md'), 'utf8');
    writeFileSync(join(dir, 'entries', 'KB-0000C0DE.md'), text);
    const r = await reindex(open(dir), { env });
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0].why, /wants entries\/KB-27B4CD10\.md/);
  });
});

test('an entry whose plane no index declares is a PROBLEM, never a quiet drop', async () => {
  // PLAN §2b: a new plane gets an index and one manifest line. Filing a `rules` entry into the
  // experiential index because it was the only one open is how an index starts lying.
  await withBase(async ({ dir, env }) => {
    const p = join(dir, 'entries', 'KB-27B4CD10.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('plane: experiential', 'plane: normative'));
    const r = await reindex(open(dir), { env });
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0].why, /plane "normative" is not in kb\.json indexes/);
  });
});

// ─── the base it cannot repair ────────────────────────────────────────────────────────────────

test('on a read-only network base it refuses and names the remedy', async () => {
  // `raw` is a CDN: it has no directory listing and nothing can be written back to it. Saying so —
  // and saying what to do instead — is the difference between a limitation and a dead end.
  const r = await reindex(openBase({ baseArg: null, env: { KB_BASE: '' } }), { env: process.env });
  assert.equal(r.state, 'no-base');
  assert.match(r.why, /cannot do/);
  assert.match(r.why, /kb reindex --base/);
});

test('a directory that is not a base is refused before anything is rebuilt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-notabase-'));
  try {
    const r = await reindex(open(dir), { env: process.env });
    assert.equal(r.state, 'no-base');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── what the reindex LOG line may say ────────────────────────────────────────────────────────

test('the logged base is categorised, never a local path — the log is a PUBLIC file', () => {
  // `reindex` is the one verb that must be pointed at a local checkout, so logging its locator
  // verbatim publishes a filesystem path carrying the operator's home directory and username. The
  // secret gate cannot catch that: it is a VALUE scan for credentials read out of `.env.local`,
  // and a home-directory path is not a credential. Measured: three queued lines read
  // `C:\Users\<name>\AppData\Local\Temp\dbg-6eY7Sr` before this existed.
  for (const local of [
    'C:\Users\somebody\AppData\Local\Temp\dbg-6eY7Sr',
    'C:/Users/somebody/checkout/v2',
    '/home/somebody/vc-knowledge/v2',
    './v2',
  ]) assert.equal(publicLocator(local), '(local checkout)', local);

  // A remote base is public by definition, and WHICH base was reindexed is the only part of this
  // field a reader of the log can use.
  const remote = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main/v2';
  assert.equal(publicLocator(remote), remote);
  assert.equal(publicLocator('http://localhost:8080/v2'), 'http://localhost:8080/v2');
  assert.equal(publicLocator(null), '(local checkout)');
});
