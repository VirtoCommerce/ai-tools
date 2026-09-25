// The Git Data API client (scripts/kb/core/github-api.mjs).
//
// NOT ONE NETWORK CALL. Every response below comes from an injected transport, which is how the
// two things that actually matter here get tested at all: that `force` is FALSE on the ref update —
// the single boolean separating "another session's commit is preserved" from "another session's
// commit is gone and nobody will ever know" — and that a 422 is reported as a CONFLICT rather than
// as a generic failure, because only the first of those is retried.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FILE_MODE, coordinatesOf, fromBase64, githubApi, toBase64 } from '../kb/core/github-api.mjs';

const res = (status, body = null, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (body == null ? '' : JSON.stringify(body)),
  headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
});

function transport(script) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : null });
      const next = typeof script === 'function' ? script(url, calls.length) : script;
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const api = (script, over = {}) => {
  const t = transport(script);
  return { t, api: githubApi({ owner: 'VirtoCommerce', repo: 'vc-knowledge', branch: 'main', token: 'T', fetchImpl: t.fetchImpl, ...over }) };
};

// ─── the write target comes from the read locator ─────────────────────────────────────────────

test('coordinates are derived from the base URL, never configured twice', () => {
  assert.deepEqual(coordinatesOf('https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main/v2'),
    { owner: 'VirtoCommerce', repo: 'vc-knowledge', branch: 'main', prefix: 'v2' });
  assert.deepEqual(coordinatesOf('https://raw.githubusercontent.com/o/r/main/'),
    { owner: 'o', repo: 'r', branch: 'main', prefix: '' });
});

test('anything that is not a raw base has no write target — which is a fact, not a failure', () => {
  // Reading one base and writing another is impossible by construction rather than by discipline.
  for (const l of ['C:/checkout/v2', 'file:///tmp/base', 'https://example.com/x', '', null]) {
    assert.equal(coordinatesOf(l), null, String(l));
  }
});

test('base64 both ways, including non-ASCII prose', () => {
  const s = 'The «Active» column — it reflects the contact, not the account.\n';
  assert.equal(fromBase64(toBase64(s)), s);
});

// ─── the statuses that decide what the push does next ─────────────────────────────────────────

test('422 on the ref update is a CONFLICT — the compare-and-swap losing, not an error', async () => {
  const { api: a } = api(res(422, { message: 'Update is not a fast forward' }));
  const r = await a.updateRef({ sha: 'deadbeef' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'conflict');
  assert.match(r.detail, /422/);
  assert.match(r.detail, /not a fast forward/);
});

test('409 is a conflict too', async () => {
  assert.equal((await api(res(409, { message: 'x' })).api.updateRef({ sha: 's' })).reason, 'conflict');
});

test('401 and 403 are `denied` — the TOKEN is the problem, not the network and not the queue', async () => {
  // Naming this separately is what lets the caller keep the queue and say why, instead of
  // retrying a credential that will never work.
  for (const s of [401, 403]) {
    assert.equal((await api(res(s, { message: 'Bad credentials' })).api.getRef()).reason, 'denied', String(s));
  }
});

test('404 is `missing` and 5xx is `unreachable`', async () => {
  assert.equal((await api(res(404, { message: 'Not Found' })).api.getRef()).reason, 'missing');
  assert.equal((await api(res(502)).api.getRef()).reason, 'unreachable');
});

test('a transport that throws never escapes — a push that throws loses the queue to the nearest catch', async () => {
  const { api: a } = api(new Error('KB-NETWORK-TRAP: fetch was called'));
  const r = await a.getRef();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreachable');
  assert.match(r.detail, /KB-NETWORK-TRAP/);
});

// ─── the four calls ───────────────────────────────────────────────────────────────────────────

test('`force` is FALSE and is sent explicitly', async () => {
  const { t, api: a } = api(res(200, { object: { sha: 'newsha' } }));
  await a.updateRef({ sha: 'newsha' });
  assert.equal(t.calls[0].method, 'PATCH');
  assert.match(t.calls[0].url, /\/repos\/VirtoCommerce\/vc-knowledge\/git\/refs\/heads\/main$/);
  assert.deepEqual(t.calls[0].body, { sha: 'newsha', force: false });
});

test('a blob goes up base64-encoded, and a tree entry is a plain file', async () => {
  const { t, api: a } = api(res(201, { sha: 'b1' }));
  await a.createBlob('hello');
  assert.deepEqual(t.calls[0].body, { content: toBase64('hello'), encoding: 'base64' });

  const { t: t2, api: a2 } = api(res(201, { sha: 't1' }));
  await a2.createTree({ baseTree: 'tbase', entries: [{ path: 'v2/index.json', sha: 'b1' }, { path: 'v2/log/old.jsonl', sha: null }] });
  assert.deepEqual(t2.calls[0].body, {
    base_tree: 'tbase',
    tree: [
      { path: 'v2/index.json', mode: FILE_MODE, type: 'blob', sha: 'b1' },
      // sha: null is how the Git Data API deletes — the retention sweep rides in the same commit.
      { path: 'v2/log/old.jsonl', mode: FILE_MODE, type: 'blob', sha: null },
    ],
  });
});

test('the tree is read recursively and `truncated` is surfaced, never swallowed', async () => {
  const { t, api: a } = api(res(200, { truncated: true, tree: [{ path: 'v2/index.json', type: 'blob', sha: 'b1' }] }));
  const r = await a.getTree('t0');
  assert.match(t.calls[0].url, /\/git\/trees\/t0\?recursive=1$/);
  assert.equal(r.truncated, true);
  assert.equal(r.entries.length, 1);
});

test('a blob that does not come back base64 is a failure, not a silently empty body', async () => {
  const { api: a } = api(res(200, { encoding: 'none', content: '' }));
  const r = await a.getBlob('b1');
  assert.equal(r.ok, false);
  assert.match(r.detail, /came back as none/);
});

test('the commit carries the parent it was told, and the ref read is a ref read', async () => {
  const { t, api: a } = api(res(201, { sha: 'c9' }));
  await a.createCommit({ message: 'kb: 1 entry, 1 log (session f3d05dd3)', tree: 't1', parents: ['c0'] });
  assert.deepEqual(t.calls[0].body, { message: 'kb: 1 entry, 1 log (session f3d05dd3)', tree: 't1', parents: ['c0'] });

  const { t: t2, api: a2 } = api(res(200, { object: { sha: 'c0' } }));
  assert.equal((await a2.getRef()).sha, 'c0');
  assert.match(t2.calls[0].url, /\/git\/ref\/heads\/main$/);
});

test('the token is sent as a bearer and nothing else carries it', async () => {
  const { t, api: a } = api(res(200, { object: { sha: 'c0' } }));
  await a.getRef();
  assert.equal(t.calls[0].headers.authorization, 'Bearer T');
  assert.ok(!t.calls[0].url.includes('T'), 'never in the URL, where it would reach logs and history');
});

test('with no token the header is simply absent — reading is tokenless by design', async () => {
  const t = transport(res(200, { object: { sha: 'c0' } }));
  await githubApi({ owner: 'o', repo: 'r', fetchImpl: t.fetchImpl }).getRef();
  assert.equal('authorization' in t.calls[0].headers, false);
});
