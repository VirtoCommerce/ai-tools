// `npm run kb:install` — the three promises from PLAN §13.7, on the merge itself.
//
// This is the one piece of the system whose failure mode is SOMEBODY ELSE'S CONFIG. Every other
// `kb` file writes to a queue, a log or the base; this one edits a file whose other entries a
// person depends on to work at all, and it is the file the whole design deliberately cannot track
// in git. So the tests are about what it LEAVES ALONE at least as much as what it adds.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KB_SERVER, atomicWrite, install, merge, uninstall, unmerge } from '../kb/install-mcp.mjs';

const json = (o) => JSON.stringify(o, null, 2);

test('adds kb to a config that already has other servers, and touches nothing else', () => {
  const before = {
    mcpServers: {
      github: { command: 'docker', args: ['run', 'ghcr.io/github/github-mcp-server'], env: { TOKEN: '${GH}' } },
      postman: { type: 'http', url: 'https://mcp.postman.com/mcp' },
    },
    // A key this script knows nothing about. It must survive, because a config is a person's, not
    // ours, and "I only understand mcpServers" is not a licence to drop the rest.
    someFutureTopLevelKey: { keep: true },
  };
  const r = merge(json(before));
  assert.equal(r.state, 'added');

  const after = JSON.parse(r.text);
  assert.deepEqual(after.mcpServers.kb, KB_SERVER);
  assert.deepEqual(after.mcpServers.github, before.mcpServers.github, 'byte-for-byte, env included');
  assert.deepEqual(after.mcpServers.postman, before.mcpServers.postman);
  assert.deepEqual(after.someFutureTopLevelKey, before.someFutureTopLevelKey);
  assert.equal(Object.keys(after.mcpServers).length, 3);
});

test('a second run is a no-op that says so', () => {
  const first = merge(json({ mcpServers: { github: { command: 'x' } } }));
  assert.equal(first.state, 'added');
  const second = merge(first.text);
  assert.equal(second.state, 'already', 'idempotent — re-running after /project-init must be safe');
  assert.equal(second.text, first.text, 'and it rewrites nothing');
});

test('creates the file when there is none', () => {
  const r = merge('');
  assert.equal(r.state, 'added');
  assert.deepEqual(JSON.parse(r.text).mcpServers, { kb: KB_SERVER });
});

test('REFUSES a malformed config rather than replacing it', () => {
  // The failure that matters. A `.mcp.json` that does not parse is somebody's working config with
  // a typo in it; "fixing" it by writing a fresh one takes out every server they have.
  for (const bad of ['{ not json', '[]', 'null', '"a string"']) {
    const r = merge(bad);
    assert.equal(r.state, 'invalid', `refused: ${bad}`);
    assert.ok(!('text' in r) || r.text === undefined, 'nothing to write, so nothing is written');
    assert.match(r.why, /\.mcp\.json/);
  }
});

test('install() writes only when something changed', () => {
  const writes = [];
  const fake = (text) => ({
    env: { CLAUDE_PROJECT_DIR: process.cwd() },
    exists: () => true,
    read: () => text,
    write: (p, t) => writes.push([p, t]),
  });

  const added = install(fake(json({ mcpServers: { github: { command: 'x' } } })));
  assert.equal(added.state, 'added');
  assert.equal(writes.length, 1, 'a change is written');

  const again = install(fake(added.text));
  assert.equal(again.state, 'already');
  assert.equal(writes.length, 1, 'a no-op does not touch the file at all — mtime included');

  const refused = install(fake('{ broken'));
  assert.equal(refused.state, 'invalid');
  assert.equal(writes.length, 1, 'and a refusal certainly does not');
});

// ─── the off switch and the pinned command (PR #313 review) ───────────────────────────────────

test('KB_SERVER is pinned: the command settings.json pre-approves by NAME cannot change as an ordinary hunk', () => {
  // `enabledMcpjsonServers: ["kb"]` approves whatever this constant says. A change to it must fail
  // here and be re-approved on purpose, not ride in unnoticed.
  assert.deepEqual(KB_SERVER, { command: 'node', args: ['scripts/kb/mcp.mjs'] });
});

test('unmerge drops exactly the kb key and leaves every other server and top-level key alone', () => {
  const before = { mcpServers: { kb: KB_SERVER, github: { command: 'docker' } }, other: 1 };
  const r = unmerge(json(before));
  assert.equal(r.state, 'removed');
  assert.deepEqual(JSON.parse(r.text), { mcpServers: { github: { command: 'docker' } }, other: 1 });
  assert.equal(unmerge(r.text).state, 'absent', 'a second run is a no-op');
  assert.equal(unmerge('').state, 'absent');
  assert.equal(unmerge('{nope').state, 'invalid', 'a broken config is refused, never rewritten');
});

test('uninstall writes only when there was something to remove', () => {
  const writes = [];
  const fake = (text) => ({ env: { VC_ENV_ROOT: '/r' }, exists: () => true, read: () => text, write: (p, t) => writes.push(t) });
  uninstall(fake(json({ mcpServers: { github: {} } })));
  assert.equal(writes.length, 0);
  uninstall(fake(json({ mcpServers: { kb: KB_SERVER, github: {} } })));
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0]).mcpServers, { github: {} });
});

// ─── compared by meaning, the operator's keys kept, written atomically (PR #313 review 2) ─────

test('an entry equal on command+args is `already` — key order and operator keys do not trigger a rewrite', () => {
  // Byte-for-byte odd formatting, a reversed key order and operator-added keys: none of it is ours.
  const text = '{"mcpServers":{"other":{"url":"x"},"kb":{"env":{"KB_RUN":"VCST-1"},"type":"stdio","args":["scripts/kb/mcp.mjs"],"command":"node"}}}';
  const r = merge(text);
  assert.equal(r.state, 'already');
  assert.equal(r.text, text, 'nothing to write, so the file stays byte-identical');
});

test('a changed command is re-pinned, and the operator\'s own keys under kb SURVIVE', () => {
  const r = merge(json({ mcpServers: { kb: { command: 'old', args: [], type: 'stdio', env: { KB_RUN: 'VCST-1' } } } }));
  assert.equal(r.state, 'replaced');
  assert.deepEqual(JSON.parse(r.text).mcpServers.kb, { command: 'node', args: ['scripts/kb/mcp.mjs'], type: 'stdio', env: { KB_RUN: 'VCST-1' } });
});

test('atomicWrite goes through a temp file and a rename, and cleans the temp up when the rename fails', () => {
  const ops = [];
  atomicWrite('/r/.mcp.json', 'x', { write: (p) => ops.push(['write', p]), move: (a, b) => ops.push(['move', a, b]), remove: () => ops.push(['rm']) });
  assert.equal(ops[0][0], 'write');
  assert.notEqual(ops[0][1], '/r/.mcp.json', 'never written in place');
  assert.deepEqual(ops[1], ['move', ops[0][1], '/r/.mcp.json']);
  const failing = [];
  assert.throws(() => atomicWrite('/r/.mcp.json', 'x', {
    write: () => {}, move: () => { throw new Error('EPERM'); }, remove: () => failing.push('rm'),
  }), /EPERM/);
  assert.deepEqual(failing, ['rm']);
});
