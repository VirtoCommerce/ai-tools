// The write token's two sources (scripts/kb/core/token.mjs): the environment, where vc-secrets puts
// it, then `.env.local`. Getting the order wrong reads as "no write access" — or pushes with a stale
// copy — and silently stops the base from accumulating anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseEnvFile, repoRoot, writeToken } from '../kb/core/token.mjs';

function withRoot(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-token-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf8');
    return fn({ VC_ENV_ROOT: dir, TEST_ENV: 'vcst' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a token only in .env.local is found', () => {
  withRoot({ '.env.local': 'GITHUB_TOKEN=tok-from-local\n' }, (env) => {
    assert.deepEqual(writeToken(env), { token: 'tok-from-local', from: '.env.local:GITHUB_TOKEN' });
  });
});

test('the environment (where vc-secrets puts it) beats .env.local', () => {
  withRoot({ '.env.local': 'KB_GITHUB_TOKEN=stale-copy\n' }, (env) => {
    assert.deepEqual(writeToken({ ...env, KB_GITHUB_TOKEN: 'from-vc-secrets' }), { token: 'from-vc-secrets', from: 'env:KB_GITHUB_TOKEN' });
  });
});

test('no other env layer is a token source', () => {
  withRoot({ '.env.defaults': 'GITHUB_TOKEN=a\n', '.env.vcst': 'GITHUB_TOKEN=b\n', '.env': 'GITHUB_TOKEN=c\n' },
    (env) => assert.deepEqual(writeToken(env), { token: null, from: null }));
});

test('KB_GITHUB_TOKEN wins, so the base can use a least-privilege token of its own', () => {
  withRoot({ '.env.local': 'GITHUB_TOKEN=shared\nKB_GITHUB_TOKEN=scoped\n' }, (env) => {
    assert.deepEqual(writeToken(env), { token: 'scoped', from: '.env.local:KB_GITHUB_TOKEN' });
  });
});

test('an empty value counts as absent, not as a token that will 401 forever', () => {
  withRoot({ '.env.local': 'GITHUB_TOKEN=\n' }, (env) => assert.equal(writeToken({ ...env, KB_GITHUB_TOKEN: '   ' }).token, null));
});

test('the repo root comes from this module\'s location, not from process.cwd()', () => {
  // `kb` is invoked from wherever the agent happens to be; a cwd-relative loader would resolve the
  // env layers against an unrelated directory and report every variable as unset.
  assert.equal(repoRoot({}), resolve(import.meta.dirname, '..', '..'));
  assert.equal(repoRoot({ VC_ENV_ROOT: 'C:/elsewhere' }), 'C:/elsewhere');
});

test('quotes, comments and blank lines parse the way dotenv reads them', () => {
  const m = parseEnvFile(['# a comment', '', 'A="quoted"', "B='single'", 'C=bare', 'D=has=equals'].join('\n'));
  assert.deepEqual([...m], [['A', 'quoted'], ['B', 'single'], ['C', 'bare'], ['D', 'has=equals']]);
});
