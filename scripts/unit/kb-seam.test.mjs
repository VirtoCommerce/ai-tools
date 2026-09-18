// The SEAM (scripts/kb/core/reader.mjs) and base resolution (core/base.mjs).
//
// NOT ONE NETWORK CALL IN THIS FILE, OR ANY kb-*.test.mjs. That is the property the seam exists to
// buy: a test that reaches the network is slow, flaky, and eventually skipped, at which point the
// thing it guarded is unguarded and nobody notices. Every "network" condition here is a stub
// reader -- which is also the proof that the stub is enough, i.e. that session 2's HTTP reader can
// be dropped in behind the same four methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  const { reader, why } = createReader('https://example.invalid/v2');
  assert.equal(reader, null);
  assert.match(why, /no reader is registered for "https:\/\/"/);
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

test('the declared default needs a reader nobody has registered yet — so it refuses, offline', () => {
  // This is what keeps session 1 network-free even when nothing is configured: the default base is
  // an https URL, and with no https reader it cannot be reached, only refused.
  const opened = openBase({ baseArg: null, env: {} });
  assert.equal(opened.reader, null);
  assert.match(opened.why, /no reader is registered/);
});
