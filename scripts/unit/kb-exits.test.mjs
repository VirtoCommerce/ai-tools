// The four exit states (PLAN §3.5) -- and the one invariant that makes them worth having.
//
// "I asked and nobody wrote this down" and "I could not ask" mean OPPOSITE things and must never
// look alike. The first is work to do; the second is a retry. Collapse them and an agent that
// could not reach the base concludes "the base doesn't know", then guesses -- or writes a new
// entry duplicating one that already exists, so the base starts commissioning work it has already
// done.
//
// Everything unreachable here is a stub reader. No network, by construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { EXIT, HEADLINE, STATES, exitFor } from '../kb/core/exits.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { loadIndex } from '../kb/core/index-load.mjs';
import { ask, show } from '../kb/core/verbs.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * The shared `withTempDir` is synchronous -- it removes the directory as soon as `fn` RETURNS,
 * which for an async `fn` is before it has done anything. Every test here is async, so it needs
 * the awaiting form.
 */
async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-test-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = (reader) => ({ reader, locator: 'test', how: 'test', why: null });
/** Queue writes go to a temp dir so a test never touches the real one. */
const envIn = (dir) => ({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'testsess' });

/** A reader whose index loads but whose bodies time out -- the mid-session network failure. */
function indexOkBodiesDown(dir) {
  const real = localReader(dir);
  return { ...real, readEntry: async () => ({ ok: false, reason: 'unreachable', detail: 'ETIMEDOUT' }) };
}

/** A reader that cannot be reached at all. */
const allDown = () => ({
  kind: 'stub', locator: 'stub://down', how: 'test',
  readManifest: async () => ({ ok: false, reason: 'unreachable', detail: 'ETIMEDOUT' }),
  readIndex: async () => ({ ok: false, reason: 'unreachable', detail: 'ETIMEDOUT' }),
  readEntry: async () => ({ ok: false, reason: 'unreachable', detail: 'ETIMEDOUT' }),
});

// ─── the map itself ───────────────────────────────────────────────────────────────────────────

test('the four states map to the four codes', () => {
  assert.deepEqual(STATES.map(exitFor), [EXIT.ANSWER, EXIT.NO_COVERAGE, EXIT.NO_BASE, EXIT.UNREACHABLE]);
  assert.deepEqual([EXIT.ANSWER, EXIT.NO_COVERAGE, EXIT.NO_BASE, EXIT.UNREACHABLE], [0, 1, 2, 3]);
});

test('THE INVARIANT: an unknown state is UNREACHABLE and never NO_COVERAGE', () => {
  // "I do not know what happened" is far closer to "I could not ask" than to "I asked and the
  // answer was nothing" -- and only one of those two errors makes an agent invent facts.
  for (const bogus of ['', null, undefined, 'error', 'timeout', 'empty', 'nothing']) {
    assert.equal(exitFor(bogus), EXIT.UNREACHABLE, `${JSON.stringify(bogus)} must not become exit 1`);
  }
});

test('the headline for exit 3 says outright that it is not a miss', () => {
  assert.match(HEADLINE.unreachable, /NOT read/);
  assert.match(HEADLINE.unreachable, /not "nothing is known"/);
  assert.match(HEADLINE.miss, /holds nothing/);
});

// ─── loadIndex tells the two apart at the source ──────────────────────────────────────────────

test('a directory with no kb.json is NO BASE — it stops, it does not read empty', () => {
  // PLAN §12 rule 2: a named base that turns out not to be a base STOPS. Carrying on with an empty
  // index would present as "the base holds nothing on this", which is the exact confusion.
  return withTempDir(async (dir) => {
    const r = await loadIndex(localReader(dir));
    assert.equal(r.state, 'no-base');
    assert.equal(exitFor(r.state), EXIT.NO_BASE);
  });
});

test('an unreachable manifest is UNREACHABLE, not no-base and not a miss', async () => {
  const r = await loadIndex(allDown());
  assert.equal(r.state, 'unreachable');
  assert.equal(exitFor(r.state), EXIT.UNREACHABLE);
});

test('a manifest declaring an index the base does not have is a BROKEN base, not an empty one', () => {
  return withTempDir(async (dir) => {
    writeFileSync(join(dir, 'kb.json'), JSON.stringify({ schema: 1, indexes: { experiential: 'index.json' } }));
    const r = await loadIndex(localReader(dir));
    assert.equal(r.state, 'no-base');
    assert.match(r.why, /declares index\.json/);
  });
});

test('a manifest with no indexes declared is malformed, not empty', () => {
  return withTempDir(async (dir) => {
    writeFileSync(join(dir, 'kb.json'), JSON.stringify({ schema: 1 }));
    const r = await loadIndex(localReader(dir));
    assert.equal(r.state, 'no-base');
    assert.match(r.why, /declares no indexes/);
  });
});

test('the manifest carries a plane -> index map, and every declared index is loaded', async () => {
  const r = await loadIndex(localReader(FIXTURE));
  assert.equal(r.state, 'ok');
  assert.deepEqual(r.indexes, ['index.json']);
  assert.equal(r.manifest.indexes.experiential, 'index.json');
  assert.ok(r.rows.length >= 6);
});

// ─── ask, through each of the four ────────────────────────────────────────────────────────────

test('ask -> 0 when the base answers', () => withTempDir(async (q) => {
  const r = await ask('what does the Active column on /company/members reflect', opened(localReader(FIXTURE)), { env: envIn(q) });
  assert.equal(r.state, 'answer');
  assert.equal(exitFor(r.state), EXIT.ANSWER);
  assert.equal(r.hits[0].id, 'KB-27B4CD10');
}));

test('ask -> 1 when the base was read and nothing matched', () => withTempDir(async (q) => {
  const r = await ask('how do I configure a Kubernetes ingress controller', opened(localReader(FIXTURE)), { env: envIn(q) });
  assert.equal(r.state, 'miss');
  assert.equal(exitFor(r.state), EXIT.NO_COVERAGE);
  assert.deepEqual(r.hits, []);
}));

test('ask -> 2 when no reader could be built for the declared base', () => withTempDir(async (q) => {
  const r = await ask('anything', { reader: null, why: 'no reader is registered for "https://"' }, { env: envIn(q) });
  assert.equal(r.state, 'no-base');
  assert.equal(exitFor(r.state), EXIT.NO_BASE);
}));

test('ask -> 3 when the base could not be reached at all', () => withTempDir(async (q) => {
  const r = await ask('what does the Active column on /company/members reflect', opened(allDown()), { env: envIn(q) });
  assert.equal(r.state, 'unreachable');
  assert.equal(exitFor(r.state), EXIT.UNREACHABLE);
}));

// ─── graceful degradation: the index answered, the bodies did not ─────────────────────────────

test('a mid-session failure still NAMES the entry, and stays exit 3', () => withTempDir(async (q) => {
  // PLAN §3.5: "the base HAS an entry on this: KB-… — <subject>. Body unavailable." Strictly better
  // than silence, and it cannot be mistaken for a miss.
  const r = await ask('what does the Active column on /company/members reflect',
    opened(indexOkBodiesDown(FIXTURE)), { env: envIn(q) });
  assert.equal(r.state, 'unreachable', 'the agent got no answer, so it must conclude nothing');
  assert.equal(exitFor(r.state), EXIT.UNREACHABLE);
  assert.equal(r.hits[0].id, 'KB-27B4CD10');
  assert.match(r.hits[0].subject, /Active column/);
  assert.match(r.hits[0].unavailable, /body unavailable/);
}));

test('a hit whose body did not arrive does NOT report zero confirmations', () => withTempDir(async (q) => {
  // Computing trust from an absent evidence[] yields "0 confirmations" for an entry the index says
  // has four -- a confident understatement, the worst direction for a trust label to be wrong in.
  const r = await ask('what does the Active column on /company/members reflect',
    opened(indexOkBodiesDown(FIXTURE)), { env: envIn(q) });
  const hit = r.hits[0];
  assert.equal(hit.trust.label, 'unread');
  assert.equal(hit.trust.confirmations, 4, 'the index count stands in, marked provisional');
  assert.equal(hit.trust.provisional, true);
  assert.equal(hit.indexDrift, null, 'two numbers never compared cannot be said to disagree');
}));

// ─── retrieval excludes retired entries; `show` does not ──────────────────────────────────────

test('a retired entry is never returned by ask', () => withTempDir(async (q) => {
  const r = await ask('why do cart totals lag a quantity change on the cart page', opened(localReader(FIXTURE)), { env: envIn(q) });
  assert.ok(!(r.hits ?? []).some((h) => h.id === 'KB-A31DCF79'), 'retired must not be retrievable');
}));

test('show returns a retired entry, and says it is retired', () => withTempDir(async (q) => {
  // A reader holding an id is entitled to see what is behind it, including that it was retired.
  const r = await show('KB-A31DCF79', opened(localReader(FIXTURE)), { env: envIn(q) });
  assert.equal(r.state, 'answer');
  assert.equal(r.entry.status, 'retired');
}));

test('show on an id the index does not hold is a miss, not an unreachable', () => withTempDir(async (q) => {
  const r = await show('KB-00000000', opened(localReader(FIXTURE)), { env: envIn(q) });
  assert.equal(r.state, 'miss');
  assert.equal(exitFor(r.state), EXIT.NO_COVERAGE);
}));
