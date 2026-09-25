// WHO WROTE THE LINE — the resolver, its cache, and every way it is allowed to fail.
//
// The DERIVATION is what is pinned here, never the declaration (`.claude/rules/test-data.md`): the
// cache-key rule, the two freshness clocks, the keep-what-we-knew rule, and the deadline. The
// field's presence ON A LINE is pinned in `kb-log-fields.test.mjs`, which is where the log's shape
// lives.
//
// EVERY TEST ISOLATES BOTH `KB_QUEUE_DIR` AND `VC_ENV_ROOT`. The first because anything writing
// through `core/queue.mjs` must (PLAN §7.1a — the suite once left 73 smoke-test lines in a
// developer's real queue). The second because `writeToken` resolves through the repo's OWN
// `.env.local`, which on this machine holds a real token: without an empty root, "no token" is not
// a case these tests can express at all, and the ones that set a token would be testing whichever
// value happens to be configured.
//
// AND NO TEST HERE TOUCHES THE NETWORK. `viewer` is reached only through an injected `fetchImpl`;
// the one path that could reach out — `resolveWho` with no injection — is never exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { viewer } from '../kb/core/github-api.mjs';
import {
  WHO_RETRY_MS, WHO_TTL_MS, cachedWho, fingerprint, readWhoCache, resolveWho, whoPath,
} from '../kb/core/who.mjs';

const TOKEN = 'ghp_atestonlytokenvaluethatisnotreal01';

/** A queue directory and an env root with no env files in it, torn down afterwards. */
function withDirs(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-who-'));
  const root = mkdtempSync(join(tmpdir(), 'kb-who-root-'));
  try {
    return fn({ dir, env: { KB_QUEUE_DIR: dir, VC_ENV_ROOT: root, GITHUB_TOKEN: TOKEN } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

/** A transport that answers `GET /user` and counts how often it was asked. */
function fakeUser(login, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), auth: opts?.headers?.authorization ?? null });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(status === 200 ? { login } : { message: 'Bad credentials' }),
    };
  };
  return { fetchImpl, calls };
}

const seed = (dir, record) => writeFileSync(whoPath(dir), `${JSON.stringify(record)}\n`, 'utf8');

// ── viewer: the one call, and every answer it is allowed to give ──────────────────────────────

test('viewer returns the login and NOTHING else the response carried', async () => {
  // The response holds a name, an email, a company and an avatar. A handle is an id, which §7
  // permits in a public log; the rest is not, and the narrowing happens here rather than at the
  // three places that would otherwise each have to remember to do it.
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ login: 'Dan-BV', email: 'someone@example.com', name: 'A Person' }),
  });
  const r = await viewer({ token: TOKEN, fetchImpl });
  assert.deepEqual(r, { ok: true, login: 'Dan-BV' });
});

test('viewer sends the token and asks /user, not a repository path', async () => {
  const { fetchImpl, calls } = fakeUser('Dan-BV');
  await viewer({ token: TOKEN, fetchImpl, apiBase: 'https://api.example.test' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/user');
  assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
});

test('viewer never throws — a 403, a 200 with no login and a dead transport are all results',
  async () => {
    // A fine-grained PAT without the profile scope, an App installation token and CI's own
    // GITHUB_TOKEN all answer 403 here. Nothing is wrong in that case; there is simply nobody to
    // name, and a thrown error would have taken an `ask` down for it.
    const denied = await viewer({ token: TOKEN, fetchImpl: fakeUser(null, { status: 403 }).fetchImpl });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, 'denied');

    const empty = await viewer({
      token: TOKEN,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 7 }) }),
    });
    assert.equal(empty.ok, false, 'a 200 with no login is not an identity');

    const dead = await viewer({ token: TOKEN, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    assert.equal(dead.ok, false);
    assert.equal(dead.reason, 'unreachable');

    const none = await viewer({ token: null });
    assert.equal(none.ok, false, 'no token is not a lookup');
  });

// ── no token ⇒ no identity, and no call ───────────────────────────────────────────────────────

test('a session with no write token resolves to nothing and asks GitHub nothing', async () => {
  // Reads are tokenless BY DESIGN (PLAN §6.4) and a reader writes nothing worth attributing. So
  // this is the correct answer, not a degradation — and it must not cost a request to reach it.
  await withDirs(async ({ dir, env }) => {
    const { fetchImpl, calls } = fakeUser('Dan-BV');
    const r = await resolveWho({ dir, env: { ...env, GITHUB_TOKEN: '' }, fetchImpl });
    assert.deepEqual(r, { who: null, from: 'no-token' });
    assert.equal(calls.length, 0, 'no token, no call');
    assert.equal(readWhoCache(dir), null, 'and nothing cached, so a later token is looked up');
    assert.equal(cachedWho({ dir, env: { ...env, GITHUB_TOKEN: '' } }), null);
  });
});

// ── resolved once, then off the filesystem ────────────────────────────────────────────────────

test('the lookup happens ONCE and the cache is in the queue directory', async () => {
  await withDirs(async ({ dir, env }) => {
    const { fetchImpl, calls } = fakeUser('Dan-BV');
    const first = await resolveWho({ dir, env, fetchImpl });
    assert.deepEqual(first, { who: 'Dan-BV', from: 'api' });
    assert.equal(calls.length, 1);

    // A second resolve — a second CLI process, a sweep, the MCP server starting — pays nothing.
    const second = await resolveWho({ dir, env, fetchImpl });
    assert.deepEqual(second, { who: 'Dan-BV', from: 'cache' });
    assert.equal(calls.length, 1, 'still one call: the cache is shared across sessions, not per-process');

    // In the queue directory, which is swept with everything else and is never the working tree.
    assert.equal(whoPath(dir), join(dir, '.identity.json'));
    assert.ok(!whoPath(dir).endsWith('.jsonl'), 'so `queueFiles` steps over it');
    assert.equal(cachedWho({ dir, env }), 'Dan-BV', 'and the sync reader sees it without a call');
  });
});

test('the cache records a FINGERPRINT of the token and never the token', async () => {
  await withDirs(async ({ dir, env }) => {
    await resolveWho({ dir, env, fetchImpl: fakeUser('Dan-BV').fetchImpl });
    const text = readFileSync(whoPath(dir), 'utf8');
    assert.ok(!text.includes(TOKEN), 'the credential itself is never written down');
    assert.equal(readWhoCache(dir).fp, fingerprint(TOKEN));
    assert.equal(fingerprint(TOKEN).length, 16);
    assert.notEqual(fingerprint(TOKEN), fingerprint(`${TOKEN}x`));
  });
});

test('a cache written under ANOTHER token is ignored, not believed', async () => {
  // The shared-machine case, and the reason the fingerprint exists at all: without it, whoever
  // resolved first on this box gets their handle stamped on everybody else's lines.
  await withDirs(async ({ dir, env }) => {
    seed(dir, { fp: fingerprint('somebody-elses-token'), who: 'Not-Me', at: new Date().toISOString() });
    assert.equal(cachedWho({ dir, env }), null, 'no identity beats the wrong one');

    const { fetchImpl, calls } = fakeUser('Dan-BV');
    assert.deepEqual(await resolveWho({ dir, env, fetchImpl }), { who: 'Dan-BV', from: 'api' });
    assert.equal(calls.length, 1, 'and it goes and finds out rather than reusing the stranger’s');
  });
});

test('an unreadable or foreign cache file costs a lookup, never a failure', async () => {
  await withDirs(async ({ dir, env }) => {
    writeFileSync(whoPath(dir), 'not json at all\n', 'utf8');
    assert.equal(readWhoCache(dir), null);
    assert.equal(cachedWho({ dir, env }), null);
    assert.deepEqual(await resolveWho({ dir, env, fetchImpl: fakeUser('Dan-BV').fetchImpl }),
      { who: 'Dan-BV', from: 'api' });
  });
});

// ── the two clocks ────────────────────────────────────────────────────────────────────────────

test('a handle is re-checked after the TTL — the only thing that would notice a rename', async () => {
  await withDirs(async ({ dir, env }) => {
    const t0 = Date.parse('2026-09-21T10:00:00Z');
    const { fetchImpl, calls } = fakeUser('Renamed-BV');
    seed(dir, { fp: fingerprint(TOKEN), who: 'Dan-BV', at: new Date(t0).toISOString() });

    assert.equal((await resolveWho({ dir, env, fetchImpl, nowMs: t0 + WHO_TTL_MS - 1 })).from, 'cache');
    assert.equal(calls.length, 0, 'inside the window, nothing is asked');

    const after = await resolveWho({ dir, env, fetchImpl, nowMs: t0 + WHO_TTL_MS + 1 });
    assert.deepEqual(after, { who: 'Renamed-BV', from: 'api' });
    assert.equal(calls.length, 1);
  });
});

test('a token that has NEVER resolved is retried on the shorter clock, not the TTL', async () => {
  // The CLI is one process per command, so an in-process memo does nothing for it: without a
  // persisted negative, an offline machine pays the full deadline on every single invocation.
  await withDirs(async ({ dir, env }) => {
    const t0 = Date.parse('2026-09-21T10:00:00Z');
    const { fetchImpl, calls } = fakeUser('Dan-BV');
    seed(dir, { fp: fingerprint(TOKEN), who: null, at: new Date(t0).toISOString() });

    const held = await resolveWho({ dir, env, fetchImpl, nowMs: t0 + WHO_RETRY_MS - 1 });
    assert.deepEqual(held, { who: null, from: 'cache' });
    assert.equal(calls.length, 0);

    const retried = await resolveWho({ dir, env, fetchImpl, nowMs: t0 + WHO_RETRY_MS + 1 });
    assert.deepEqual(retried, { who: 'Dan-BV', from: 'api' });
    assert.ok(WHO_RETRY_MS < WHO_TTL_MS, 'never-known is retried sooner than known-and-ageing');
  });
});

// ── failure never costs the handle, and never costs the verb ──────────────────────────────────

test('a FAILED re-check keeps the handle it already had and only moves the attempt stamp',
  async () => {
    // Replacing a known-good handle with null because GitHub was briefly down throws away the very
    // thing the field exists to record, in exchange for nothing. The fingerprint is what makes
    // keeping it safe: a handle is only ever kept for the token it was learned under.
    await withDirs(async ({ dir, env }) => {
      const t0 = Date.parse('2026-09-21T10:00:00Z');
      seed(dir, { fp: fingerprint(TOKEN), who: 'Dan-BV', at: new Date(t0).toISOString() });
      const at = t0 + WHO_TTL_MS + 1;

      const r = await resolveWho({
        dir, env, nowMs: at, fetchImpl: async () => { throw new Error('ENOTFOUND api.github.com'); },
      });
      assert.deepEqual(r.who, 'Dan-BV');
      assert.equal(r.from, 'kept');
      assert.match(r.why, /ENOTFOUND/);

      const record = readWhoCache(dir);
      assert.equal(record.who, 'Dan-BV');
      assert.equal(Date.parse(record.at), at, 'the stamp moved, so the next call is not another timeout');
      assert.equal(cachedWho({ dir, env, nowMs: at + 1 }), 'Dan-BV');
    });
  });

test('a token that was never resolved and cannot be resolved records no identity', async () => {
  await withDirs(async ({ dir, env }) => {
    const r = await resolveWho({ dir, env, fetchImpl: fakeUser(null, { status: 403 }).fetchImpl });
    assert.equal(r.who, null);
    assert.equal(r.from, 'unresolved');
    assert.equal(cachedWho({ dir, env }), null, 'and the line carries none — never a null, never a guess');
  });
});

test('a transport that NEVER ANSWERS degrades within the deadline instead of hanging', async () => {
  // The acceptance clause this file exists for. `AbortSignal` is not enough on its own: a
  // transport is free to ignore it, and a door that awaits an unbounded promise is a door that
  // never opens. So the bound is enforced here, in `withDeadline`, against a fake that ignores
  // every signal it is given.
  await withDirs(async ({ dir, env }) => {
    const started = Date.now();
    const r = await resolveWho({ dir, env, timeoutMs: 40, fetchImpl: () => new Promise(() => {}) });
    const took = Date.now() - started;
    assert.equal(r.who, null);
    assert.equal(r.from, 'unresolved');
    assert.ok(took < 3_000, `degraded in ${took} ms rather than hanging`);
    // And it remembers the failure, so the NEXT process does not pay the same wait again.
    assert.equal(readWhoCache(dir).who, null);
  });
});

test('no directory is a result, not a crash', async () => {
  // `queueDir()` always answers, so this is unreachable through the doors — which is exactly why
  // it is pinned: an unreachable branch that throws is a crash waiting for a refactor.
  const r = await resolveWho({ dir: null });
  assert.equal(r.who, null);
  assert.equal(cachedWho({ dir: null }), null);
});
