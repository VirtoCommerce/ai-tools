// The HTTPS reader (scripts/kb/core/http-reader.mjs).
//
// NOT ONE NETWORK CALL IN THIS FILE. Every response below comes from an injected transport, which
// is the whole reason the transport is injectable: the mapping from HTTP status to `reason` is the
// single most important thing in this module, and testing it against the real GitHub would mean
// testing three of the eight cases and hoping about the rest. Here all of them are exercised,
// offline, in milliseconds.
//
// WHAT IS ACTUALLY UNDER TEST: that `missing` and `unreachable` cannot collapse into each other.
// PLAN §3.5 exists because "I asked and nobody wrote this down" and "I could not ask" mean opposite
// things -- the first is work to do, the second is a retry. An agent that confuses them concludes
// the base is empty and then guesses, or writes a duplicate of an entry that already exists. A
// single over-broad `catch` in the reader would produce exactly that, silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheDir, httpReader, maxAgeOf, resolveUrl } from '../kb/core/http-reader.mjs';

const BASE = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main/v2';

/** A response object with only the surface the reader touches. */
const res = (status, body = '', headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => body,
  headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
});

/** A transport that records what it was asked for and replies from a script. */
function transport(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const next = typeof script === 'function' ? script(url, calls.length) : script;
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

/** Each cache test gets its own directory: a cache shared between tests is a test ordering bug. */
async function withCache(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-cache-'));
  try {
    // AWAITED inside the try: `return fn(...)` would let `finally` delete the cache directory
    // while the test still depended on it, which is a cache test that proves nothing.
    return await fn({ KB_CACHE_DIR: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── the mapping that must not collapse ───────────────────────────────────────────────────────

test('404 is `missing` — the base answered and the file is not in it', async () => {
  const { fetchImpl } = transport(res(404));
  const r = await httpReader(BASE, { fetchImpl }).readEntry('entries/KB-00000000.md');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
});

test('every "could not ask" status is `unreachable`, one by one', async () => {
  // Enumerated rather than sampled. 403 is GitHub's rate-limit answer as well as its forbidden
  // one; 5xx is the CDN having a bad day. NONE of them is evidence about what the base holds, and
  // reporting any of them as `missing` would tell an agent the base is empty when it is not.
  for (const status of [400, 401, 403, 429, 500, 502, 503, 504]) {
    const { fetchImpl } = transport(res(status));
    const r = await httpReader(BASE, { fetchImpl }).readEntry('entries/KB-00000000.md');
    assert.equal(r.ok, false, `${status} must not read as ok`);
    assert.equal(r.reason, 'unreachable', `HTTP ${status} must be unreachable, not missing`);
  }
});

test('a thrown transport error is `unreachable` and never escapes as an exception', async () => {
  for (const err of [
    Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }),
    new Error('KB-NETWORK-TRAP: fetch was called'),
  ]) {
    const { fetchImpl } = transport(err);
    const r = await httpReader(BASE, { fetchImpl }).readManifest();
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unreachable');
    assert.ok(r.detail.length > 0, 'a failure must say what happened');
  }
});

test('a timeout reads as `unreachable`, not as a missing file', async () => {
  const { fetchImpl } = transport(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
  const r = await httpReader(BASE, { fetchImpl, timeoutMs: 5 }).readEntry('entries/KB-00000000.md');
  assert.equal(r.reason, 'unreachable');
  assert.match(r.detail, /timeout/);
});

test('a runtime with no fetch is `unreachable` — it is not an empty base', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    const r = await httpReader(BASE, {}).readManifest();
    assert.equal(r.reason, 'unreachable');
  } finally {
    globalThis.fetch = saved;
  }
});

test('a 200 returns the text', async () => {
  const { fetchImpl, calls } = transport(res(200, '# hello'));
  const r = await httpReader(BASE, { fetchImpl }).readEntry('entries/KB-27B4CD10.md');
  assert.deepEqual(r, { ok: true, text: '# hello' });
  assert.equal(calls[0].url, `${BASE}/entries/KB-27B4CD10.md`);
});

// ─── a path out of the index is data, not a trusted input ─────────────────────────────────────

test('an index `path` cannot reach outside the base', async () => {
  // The index arrives over the network from a public repository anyone can open a PR against, so
  // a row is data. `../../` in one would otherwise make the tool fetch a URL nobody declared --
  // the "answering out of a corpus nobody named" failure PLAN §12 rule 2 exists to prevent.
  const { fetchImpl, calls } = transport(res(200, 'nope'));
  const reader = httpReader(BASE, { fetchImpl });
  for (const evil of ['../../../secrets.json', '/etc/passwd', '//evil.example/x', 'https://evil.example/x', 'entries/../../../x']) {
    const r = await reader.readEntry(evil);
    assert.equal(r.ok, false, `${evil} must not be fetched`);
    assert.equal(r.reason, 'missing');
  }
  assert.equal(calls.length, 0, 'not one of those may reach the transport');
});

test('resolveUrl keeps a legitimate relative path and joins it to the base', () => {
  assert.equal(resolveUrl(BASE, 'entries/KB-1.md'), `${BASE}/entries/KB-1.md`);
  assert.equal(resolveUrl(`${BASE}/`, 'index.json'), `${BASE}/index.json`);
  assert.equal(resolveUrl(BASE, ''), null);
  assert.equal(resolveUrl(BASE, null), null);
});

// ─── the session cache ────────────────────────────────────────────────────────────────────────

test('within max-age the index is served with NO request at all', async () => {
  // This is what makes "≈0.35 s for every question after the first" true. Each `kb ask` is its own
  // process, so "fetch the index once per session" can only mean an on-disk cache -- without it
  // every question pays the index fetch again.
  await withCache(async (env) => {
    const { fetchImpl, calls } = transport(res(200, '{"a":1}', { etag: '"v1"', 'cache-control': 'max-age=300' }));
    let clock = 1_000_000;
    const reader = httpReader(BASE, { fetchImpl, env, now: () => clock });

    const first = await reader.readIndex('index.json');
    assert.equal(first.text, '{"a":1}');
    assert.equal(calls.length, 1);

    clock += 299_000;
    const second = await reader.readIndex('index.json');
    assert.equal(second.text, '{"a":1}');
    assert.equal(second.cache, 'fresh');
    assert.equal(calls.length, 1, 'a fresh cache must not produce a second request');
  });
});

test('past max-age it revalidates with If-None-Match and a 304 serves the cached body', async () => {
  await withCache(async (env) => {
    let clock = 1_000_000;
    const { fetchImpl, calls } = transport((url, n) => (n === 1
      ? res(200, '{"a":1}', { etag: '"v1"', 'cache-control': 'max-age=300' })
      : res(304, '', { 'cache-control': 'max-age=300' })));
    const reader = httpReader(BASE, { fetchImpl, env, now: () => clock });

    await reader.readIndex('index.json');
    clock += 301_000;
    const again = await reader.readIndex('index.json');
    assert.equal(again.ok, true);
    assert.equal(again.text, '{"a":1}');
    assert.equal(again.cache, 'revalidated');
    assert.equal(calls[1].headers['if-none-match'], '"v1"', 'the second request must be conditional');

    // The 304 re-stamps the cache, so the next question inside the window skips the trip too.
    clock += 1_000;
    const third = await reader.readIndex('index.json');
    assert.equal(third.cache, 'fresh');
    assert.equal(calls.length, 2);
  });
});

test('a 200 on revalidation replaces the cached copy', async () => {
  await withCache(async (env) => {
    let clock = 1_000_000;
    const { fetchImpl } = transport((url, n) => (n === 1
      ? res(200, 'old', { etag: '"v1"', 'cache-control': 'max-age=300' })
      : res(200, 'new', { etag: '"v2"', 'cache-control': 'max-age=300' })));
    const reader = httpReader(BASE, { fetchImpl, env, now: () => clock });
    await reader.readIndex('index.json');
    clock += 301_000;
    assert.equal((await reader.readIndex('index.json')).text, 'new');
    assert.equal((await reader.readIndex('index.json')).text, 'new');
  });
});

test('a failing revalidation is `unreachable` — a stale cache never masquerades as a fresh read', async () => {
  // The honest answer when the base cannot be reached is "I could not ask", and it must survive
  // the cache: serving a stale index as if it were current is how an agent comes to believe it has
  // read a base it has not.
  await withCache(async (env) => {
    let clock = 1_000_000;
    const { fetchImpl } = transport((url, n) => (n === 1
      ? res(200, 'old', { etag: '"v1"', 'cache-control': 'max-age=300' })
      : new Error('ENOTFOUND')));
    const reader = httpReader(BASE, { fetchImpl, env, now: () => clock });
    await reader.readIndex('index.json');
    clock += 301_000;
    const r = await reader.readIndex('index.json');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unreachable');
  });
});

test('a 404 on the index is `missing` even with a cached copy in hand', async () => {
  await withCache(async (env) => {
    let clock = 1_000_000;
    const { fetchImpl } = transport((url, n) => (n === 1
      ? res(200, 'old', { etag: '"v1"', 'cache-control': 'max-age=300' })
      : res(404)));
    const reader = httpReader(BASE, { fetchImpl, env, now: () => clock });
    await reader.readIndex('index.json');
    clock += 301_000;
    assert.equal((await reader.readIndex('index.json')).reason, 'missing');
  });
});

test('the manifest is NOT served from cache — it decides whether this is a base at all', async () => {
  await withCache(async (env) => {
    const { fetchImpl, calls } = transport(res(200, '{"schema":1}', { etag: '"v1"', 'cache-control': 'max-age=300' }));
    const reader = httpReader(BASE, { fetchImpl, env });
    await reader.readManifest();
    await reader.readManifest();
    assert.equal(calls.length, 2, 'being told "not a base" out of a stale copy sends an operator to a config problem that no longer exists');
  });
});

test('an unwritable cache costs a round trip and never a read', async () => {
  const { fetchImpl, calls } = transport(res(200, '{"a":1}', { 'cache-control': 'max-age=300' }));
  // A path that cannot be a directory: mkdir fails, the store is skipped, the read still works.
  const reader = httpReader(BASE, { fetchImpl, env: { KB_CACHE_DIR: join(import.meta.filename, 'nope') } });
  assert.equal((await reader.readIndex('index.json')).ok, true);
  assert.equal((await reader.readIndex('index.json')).ok, true);
  assert.equal(calls.length, 2);
});

test('two bases do not share one cache entry', async () => {
  await withCache(async (env) => {
    const { fetchImpl, calls } = transport((url) => res(200, url, { 'cache-control': 'max-age=300' }));
    const a = httpReader('https://example.test/a', { fetchImpl, env });
    const b = httpReader('https://example.test/b', { fetchImpl, env });
    assert.equal((await a.readIndex('index.json')).text, 'https://example.test/a/index.json');
    assert.equal((await b.readIndex('index.json')).text, 'https://example.test/b/index.json');
    assert.equal(calls.length, 2);
  });
});

// ─── small pieces ─────────────────────────────────────────────────────────────────────────────

test('maxAgeOf reads the header raw sends, and treats an absent one as "always revalidate"', () => {
  assert.equal(maxAgeOf('max-age=300'), 300);
  assert.equal(maxAgeOf('public, max-age=300, immutable'), 300);
  assert.equal(maxAgeOf('no-cache'), 0);
  assert.equal(maxAgeOf(null), 0);
});

test('the cache lives in a scratchpad, never in the repo', () => {
  // Same rule as the queue: these files are transient, and a cache in the working tree shows up in
  // `git status` and gets committed by somebody tidying up.
  assert.equal(cacheDir({ KB_CACHE_DIR: 'X' }), 'X');
  assert.ok(cacheDir({}).startsWith(tmpdir()));
});
