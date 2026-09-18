// Resolving the write token across the env layers (scripts/kb/core/token.mjs).
//
// WHY THIS IS TESTED AT ALL: a role's identity and its secret routinely live in DIFFERENT layers,
// so grepping `.env.${TEST_ENV}` can find nothing and still look conclusive — the file named after
// the environment is exactly the one a reader trusts. `.claude/rules/test-data.md` records the
// measured incident: a working fixture account reported as having empty credentials on that basis.
// The same mistake against a token reads as "no write access" and silently stops the base from ever
// accumulating anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseEnvFile, repoRoot, resolveVar, writeToken } from '../kb/core/token.mjs';

function withRoot(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-token-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf8');
    return fn({ VC_ENV_ROOT: dir, TEST_ENV: 'vcst' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a value only in .env.local is found — the layer a single-file grep misses', () => {
  withRoot({ '.env.defaults': 'X=1\n', '.env.vcst': 'FRONT_URL=https://x\n', '.env.local': 'GITHUB_TOKEN=tok-from-local\n' },
    (env) => {
      assert.equal(resolveVar('GITHUB_TOKEN', env), 'tok-from-local');
      assert.deepEqual(writeToken(env), { token: 'tok-from-local', from: 'GITHUB_TOKEN' });
    });
});

test('.env.local overrides .env.${TEST_ENV} overrides .env.defaults — config.js\'s own precedence', () => {
  withRoot({ '.env.defaults': 'V=from-defaults\n', '.env.vcst': 'V=from-env\n', '.env.local': 'V=from-local\n' },
    (env) => { assert.equal(resolveVar('V', env), 'from-local'); });
  withRoot({ '.env.defaults': 'V=from-defaults\n', '.env.vcst': 'V=from-env\n' },
    (env) => { assert.equal(resolveVar('V', env), 'from-env'); });
});

test('TEST_ENV selects which per-env file is read', () => {
  withRoot({ '.env.vcst': 'V=vcst\n', '.env.vcptcore': 'V=vcptcore\n' }, (env) => {
    assert.equal(resolveVar('V', { ...env, TEST_ENV: 'vcptcore' }), 'vcptcore');
    assert.equal(resolveVar('V', env), 'vcst');
  });
});

test('KB_GITHUB_TOKEN wins, so the base can use a least-privilege token of its own', () => {
  // One public repository, one scope — without touching the shared GITHUB_TOKEN every other tool
  // in this repo depends on.
  withRoot({ '.env.local': 'GITHUB_TOKEN=shared\nKB_GITHUB_TOKEN=scoped\n' }, (env) => {
    assert.deepEqual(writeToken(env), { token: 'scoped', from: 'KB_GITHUB_TOKEN' });
  });
});

test('no token is not an error — it is a reader without write access, which is a full-value reader', () => {
  withRoot({ '.env.local': 'FRONT_URL=https://x\n' }, (env) => {
    assert.deepEqual(writeToken(env), { token: null, from: null });
  });
});

test('an empty value counts as absent, not as a token that will 401 forever', () => {
  withRoot({ '.env.local': 'GITHUB_TOKEN=\n' }, (env) => assert.equal(writeToken(env).token, null));
  withRoot({}, (env) => assert.equal(resolveVar('GITHUB_TOKEN', { ...env, GITHUB_TOKEN: '   ' }), null));
});

test('the environment supplies it when no file does — which is how CI passes one', () => {
  withRoot({}, (env) => { assert.equal(resolveVar('GITHUB_TOKEN', { ...env, GITHUB_TOKEN: 'from-ci' }), 'from-ci'); });
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
