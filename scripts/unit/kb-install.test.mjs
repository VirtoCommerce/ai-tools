// `npm run kb:install` — the three promises from PLAN §13.7, on the merge itself.
//
// This is the one piece of the system whose failure mode is SOMEBODY ELSE'S CONFIG. Every other
// `kb` file writes to a queue, a log or the base; this one edits a file whose other entries a
// person depends on to work at all, and it is the file the whole design deliberately cannot track
// in git. So the tests are about what it LEAVES ALONE at least as much as what it adds.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KB_SERVER, install, merge } from '../kb/install-mcp.mjs';

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
