// The gate that runs before anything leaves the machine (scripts/kb/core/secret-gate.mjs).
//
// WHAT IS ACTUALLY UNDER TEST is not "does it find secrets". It is the two properties that make a
// public log survivable: a line that trips the gate is DROPPED AND NOT PUSHED — payload included,
// because the payload is what becomes an entry body in the public base — and the push CONTINUES.
// Blocking would cost the session's whole log to save one line, and a safety tool that costs that
// much is one people turn off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  MIN_SECRET_LENGTH, SECRET_NAME, gateQueue, loadSecrets, looksLikePath, scanText, secretFiles,
  secretValuesFrom,
} from '../kb/core/secret-gate.mjs';

// ─── the loader, lifted from the vendor scanner ───────────────────────────────────────────────

test('a value is a secret when its KEY names one', () => {
  const vals = secretValuesFrom([
    'ORG_USER_PASSWORD=hunter2-not-really',
    'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz012345',
    'FRONT_URL=https://vcst-qa.govirto.com',
    'STORE_ID=B2B-store',
  ].join('\n'));
  assert.ok(vals.has('hunter2-not-really'));
  assert.ok(vals.has('ghp_abcdefghijklmnopqrstuvwxyz012345'));
  assert.ok(!vals.has('https://vcst-qa.govirto.com'), 'a URL under a non-secret key is not a secret');
  assert.ok(!vals.has('B2B-store'));
});

test('a PATH under a secret-shaped key is not a secret value', () => {
  // Without this, `SECRETS_FILE=C:\x\y\.env.local` would make the scanner search every line for a
  // path that appears in half of them, and the gate would drop the whole queue.
  assert.ok(looksLikePath('C:\\_VIRTO\\x\\.env.local'));
  assert.ok(looksLikePath('/home/x/.env'));
  assert.equal(secretValuesFrom('API_KEY_PATH=C:\\secrets\\key.txt').size, 0);
});

test('quotes are stripped and comments and short values are skipped', () => {
  const vals = secretValuesFrom(['# TOKEN=commented', 'API_TOKEN="quoted-value-here"', 'PWD=abc'].join('\n'));
  assert.ok(vals.has('quoted-value-here'));
  assert.equal(vals.size, 1, `"abc" is shorter than ${MIN_SECRET_LENGTH} and would match everything`);
});

test('the key regex is the vendor scanner\'s, so the two agree about what a secret is', () => {
  for (const k of ['PASSWORD', 'passwd', 'PWD', 'GITHUB_TOKEN', 'CLIENT_SECRET', 'API_KEY', 'access-key']) {
    assert.ok(SECRET_NAME.test(k), k);
  }
  assert.ok(!SECRET_NAME.test('FRONT_URL'));
});

test('the default secret files are anchored at the REPO, not at process.cwd()', () => {
  // A `kb` invoked from anywhere else would otherwise load nothing and report a clean scan it
  // never performed — the worst possible failure for a gate.
  const files = secretFiles({});
  assert.equal(files.length, 2);
  for (const f of files) {
    assert.ok(/[\\/]\.env\.(local|playwright\.local)$/.test(f), f);
    assert.ok(isAbsolute(f), `${f} must be absolute — a relative path would follow the caller's cwd`);
  }
  // Both under one root, and that root is the repo the module lives in, not wherever `kb` was run.
  assert.equal(dirname(files[0]), dirname(files[1]));
  assert.equal(dirname(files[0]), resolve(import.meta.dirname, '..', '..'));
});

test('VC_MEASURE_SECRETS overrides the file list, so the gate and the hook cannot disagree', () => {
  assert.deepEqual(secretFiles({ VC_MEASURE_SECRETS: 'a;b' }), ['a', 'b']);
});

test('an absent env file is not an error — it is a machine with no secrets', () => {
  const loaded = loadSecrets({ VC_MEASURE_SECRETS: 'no-such-file-anywhere.env' });
  assert.equal(loaded.count, 0);
  assert.deepEqual(loaded.files, []);
});

// ─── the scan ─────────────────────────────────────────────────────────────────────────────────

test('it is a VALUE scan: the exact string, anywhere in the line', () => {
  const secrets = new Set(['s3cret-value-x']);
  assert.deepEqual(scanText('the password was s3cret-value-x when I looked', secrets), ['env-secret-value']);
  assert.deepEqual(scanText('nothing of the sort', secrets), []);
});

test('it reports KINDS and never the matched text', () => {
  // A scanner that prints what it found has published it to the terminal, the transcript and the
  // report — which is the same disclosure it exists to prevent.
  const hits = scanText('ghp_abcdefghijklmnopqrstuvwxyz012345', new Set());
  assert.deepEqual(hits, ['github-pat']);
  assert.ok(!hits.join(' ').includes('ghp_'));
});

test('a 40-hex string is NOT a hit — the vendor\'s `sha1+ hash` row is deliberately not lifted', () => {
  // The plan's own argument: a pattern scan cries wolf on every 40-hex token, and a safety tool
  // people stop reading is the one failure mode it cannot afford. A commit sha in a question about
  // platform behaviour is legitimate and common.
  assert.deepEqual(scanText('be43f7a7218cfe3dff17108756dd0dd65d23291f0000000000', new Set()), []);
});

test('a JWT and a Bearer header are hits without being in any env file', () => {
  assert.deepEqual(scanText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123', new Set()), ['bearer']);
  assert.deepEqual(scanText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP', new Set()), ['jwt']);
});

// ─── the gate ─────────────────────────────────────────────────────────────────────────────────

const line = (over) => ({ at: '2026-09-18T10:00:00Z', kind: 'ask', q: 'what happens', ...over });

test('a clean queue passes through untouched', () => {
  const lines = [line(), line({ kind: 'show', id: 'KB-27B4CD10' })];
  const { kept, dropped } = gateQueue(lines, new Set(['nowhere-near']));
  assert.deepEqual(kept, lines);
  assert.equal(dropped.length, 0);
});

test('a tripped line is REPLACED by a marker, not removed — a gap with a shape is a finding', () => {
  const bad = line({ q: 'why does login with hunter2-not-really fail' });
  const { kept, dropped } = gateQueue([line(), bad], new Set(['hunter2-not-really']));
  assert.equal(kept.length, 2, 'the queue keeps its length');
  assert.deepEqual(kept[1], {
    at: bad.at, kind: 'redacted', why: 'secret-scan', was: 'ask', hits: ['env-secret-value'],
  });
  assert.equal(dropped.length, 1);
  assert.equal(JSON.stringify(kept).includes('hunter2-not-really'), false, 'the value is gone');
});

test('THE PAYLOAD IS SCANNED TOO — it is what becomes an entry body in the public base', () => {
  const secrets = new Set(['hunter2-not-really']);
  const capture = {
    at: '2026-09-18T10:15:00Z',
    kind: 'capture',
    id: 'KB-AAAAAAAA',
    subject: 'a perfectly innocent subject',
    payload: { entry: { id: 'KB-AAAAAAAA' }, body: 'I signed in as admin / hunter2-not-really and saw…' },
  };
  const { kept, dropped } = gateQueue([capture], secrets);
  assert.equal(dropped.length, 1, 'the line is dropped');
  assert.equal(kept[0].kind, 'redacted');
  assert.equal(kept[0].was, 'capture');
  // A gate that stripped the log line but still committed its payload would launder the secret
  // into the one artifact everybody reads.
  assert.ok(!('payload' in kept[0]), 'the payload does not survive, so the mutation is not applied');
});

test('the gate does not block: everything else in the queue still goes', () => {
  const lines = [line({ q: 'clean one' }), line({ q: 'has hunter2-not-really in it' }), line({ q: 'clean two' })];
  const { kept } = gateQueue(lines, new Set(['hunter2-not-really']));
  assert.deepEqual(kept.filter((l) => l.kind === 'ask').map((l) => l.q), ['clean one', 'clean two']);
});
