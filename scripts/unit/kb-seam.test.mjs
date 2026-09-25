// The SEAM (scripts/kb/core/reader.mjs) and base resolution (core/base.mjs).
//
// NOT ONE NETWORK CALL IN THIS FILE, OR ANY kb-*.test.mjs. That is the property the seam exists to
// buy: a test that reaches the network is slow, flaky, and eventually skipped, at which point the
// thing it guarded is unguarded and nobody notices. Every "network" condition here is a stub
// reader -- which is also the proof that the stub is enough, i.e. that session 2's HTTP reader can
// be dropped in behind the same four methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReader, localReader, registerReader, registeredSchemes } from '../kb/core/reader.mjs';
import { DEFAULT_BASE, openBase, resolveBase } from '../kb/core/base.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');

// ─── the reader contract ──────────────────────────────────────────────────────────────────────

test('a reader returns a discriminated result and never throws for a read failure', async () => {
  const r = localReader(FIXTURE);
  const ok = await r.readManifest();
  assert.equal(ok.ok, true);
  assert.match(ok.text, /"schema"/);

  // The distinction that must survive: absent is not the same as could-not-ask.
  const gone = await r.readEntry('entries/KB-NOSUCH0.md');
  assert.equal(gone.ok, false);
  assert.equal(gone.reason, 'missing');
});

test('the two failure reasons are distinct values, not two spellings of one', async () => {
  const r = localReader(join(FIXTURE, 'does-not-exist'));
  const res = await r.readManifest();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'missing', 'a directory that is not there is MISSING, not unreachable');
});

test('a read that FAILED for any other reason is UNREACHABLE, never "missing"', async () => {
  // THE SEAM'S OWN STATED INVARIANT, and until 2026-09-22 nothing pinned it. `reader.mjs` opens with
  // "a reader NEVER THROWS for a 'could not read' condition, and it never returns an empty result
  // for one either ... Making the distinction part of the RETURN TYPE means it cannot be lost by
  // accident." Review 3 replaced `reasonFor`'s entire body with `return 'missing'` - collapsing
  // every failure into "the base answered and it is not there" - and all 483 kb tests passed.
  //
  // WHY THAT MATTERS MORE THAN IT LOOKS. This one word is where exit 1 and exit 3 come from, and
  // CLAUDE.md states the consequence in terms: "Confusing 1 with 3 is how an agent invents a fact."
  // Exit 1 says nobody wrote it down, so go and find out; exit 3 says we could not ask. An
  // unreachable base reported as empty sends an agent to establish, and then capture, something the
  // base may already hold - which is the duplicate-knowledge failure this project exists to remove.
  //
  // A permission error is the cheapest real non-ENOENT failure to arrange, and it is arranged
  // through the reader's own door rather than by calling `reasonFor` directly: the invariant is
  // about what the SEAM returns, and a test of the private helper would not notice a caller that
  // stopped using it.
  const dir = mkdtempSync(join(tmpdir(), 'kb-seam-eacces-'));
  try {
    const file = join(dir, 'entries', 'KB-11111111.md');
    mkdirSync(join(dir, 'entries'), { recursive: true });
    writeFileSync(file, 'x', 'utf8');
    // A DIRECTORY where a file is expected: reading it yields EISDIR on every platform this runs on,
    // which is a genuine "could not read" that is emphatically not "not there".
    rmSync(file);
    mkdirSync(file);

    const res = await localReader(dir).readEntry('entries/KB-11111111.md');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'unreachable', 'the entry IS there - we could not read it, which is a different fact');
    assert.notEqual(res.reason, 'missing', 'collapsing these two is how exit 3 becomes exit 1');
    assert.ok(res.detail, 'and the reason a human needs is carried, not swallowed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an index `path` cannot reach outside the base', async () => {
  const r = localReader(FIXTURE);
  for (const evil of ['../../../package.json', 'C:/Windows/win.ini', '/etc/passwd', 'entries/../../package.json']) {
    const res = await r.readEntry(evil);
    assert.equal(res.ok, false, `${evil} must not be readable`);
    assert.equal(res.reason, 'missing');
  }
});

// ─── choosing an implementation ───────────────────────────────────────────────────────────────

test('a locator with no registered reader REFUSES — it never falls through to another base', () => {
  // PLAN §12 rule 2. A probe pointed at a bogus base once answered confidently out of the real
  // corpus; the only safe response to "I do not know how to read that" is to stop.
  //
  // The scheme moved in session 2: `https` now HAS an implementation, so the rule is demonstrated
  // on one that does not. That is not a weaker test -- the rule was never about https, it is about
  // what `createReader` does when it is handed something it cannot read. Rewriting it to keep
  // asserting that https is unimplemented would have been asserting the absence of this session.
  const { reader, why } = createReader('ftp://example.invalid/v2');
  assert.equal(reader, null);
  assert.match(why, /no reader is registered for "ftp:\/\/"/);
  assert.match(why, /have: .*https/, 'and it says which schemes DO have one');
});

test('https has an implementation now, and it is the one the default base needs', () => {
  const { reader, why } = createReader('https://example.invalid/v2');
  assert.equal(why, null);
  assert.equal(reader.kind, 'http');
  // Registered in base.mjs rather than here, because `openBase` is the door every caller goes
  // through -- registering it at one call site would give that caller a working default base and
  // the next caller a refusal on the same locator.
  assert.ok(registeredSchemes().includes('https'));
});

test('a scheme can be registered without touching anything above the seam', async () => {
  const calls = [];
  registerReader('stub', (locator) => ({
    kind: 'stub', locator, how: 'test',
    readManifest: async () => (calls.push('manifest'), { ok: true, text: '{"schema":1,"indexes":{"experiential":"index.json"}}' }),
    readIndex: async () => ({ ok: true, text: '{"entries":[]}' }),
    readEntry: async () => ({ ok: false, reason: 'unreachable', detail: 'ETIMEDOUT' }),
  }));
  assert.ok(registeredSchemes().includes('stub'));
  const { reader } = createReader('stub://somewhere');
  assert.equal(reader.kind, 'stub');
  assert.equal((await reader.readManifest()).ok, true);
  assert.deepEqual(calls, ['manifest']);
});

test('a plain path and a file:// URL are the same local base', () => {
  assert.equal(createReader(FIXTURE).reader.locator, createReader(`file://${FIXTURE}`).reader.locator);
});

// ─── the base is DECLARED, never discovered ───────────────────────────────────────────────────

test('resolveBase honours --base, then KB_BASE, then the declared default — and says which', () => {
  assert.deepEqual(resolveBase({ baseArg: 'D:/somewhere', env: { KB_BASE: 'ignored' } }),
    { locator: 'D:/somewhere', how: '--base on the command line', source: 'flag' });
  assert.deepEqual(resolveBase({ baseArg: null, env: { KB_BASE: 'D:/from-env' } }),
    { locator: 'D:/from-env', how: 'KB_BASE in the environment', source: 'env' });
  assert.deepEqual(resolveBase({ baseArg: null, env: {} }),
    { locator: DEFAULT_BASE, how: 'the declared default base', source: 'default' });
});

test('resolveBase never searches: an empty env does not go looking for a nearby kb.json', () => {
  // The whole content of rule 1. Two earlier versions searched, and both could answer out of a
  // corpus nobody had named.
  const chosen = resolveBase({ baseArg: null, env: {} });
  assert.equal(chosen.source, 'default');
  assert.equal(chosen.locator, DEFAULT_BASE);
});

test('openBase reports HOW it was chosen, always — `stat` prints both', () => {
  const opened = openBase({ baseArg: FIXTURE, env: {} });
  assert.equal(opened.reader.kind, 'local');
  assert.equal(opened.how, '--base on the command line');
  assert.equal(opened.reader.how, opened.how);
});

test('the declared default opens through the https reader', () => {
  // CHANGED IN SESSION 2. This used to assert `reader === null` -- true only while the seam was
  // empty, which is what kept session 1 network-free even when nothing was configured. The tests
  // stay offline by a different and better mechanism now: the spawned-CLI trap replaces fetch, so
  // reaching for the network FAILS LOUDLY instead of being impossible. Opening a reader is not a
  // network call; nothing is fetched until a read is asked for.
  const opened = openBase({ baseArg: null, env: {} });
  assert.equal(opened.why, null);
  assert.equal(opened.reader.kind, 'http');
  assert.equal(opened.locator, DEFAULT_BASE);
  assert.equal(opened.how, 'the declared default base');
});
