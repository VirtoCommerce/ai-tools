// The CLI end to end: the real process, the real exit codes, and NO NETWORK.
//
// Every invocation below is spawned with `--import fixtures/kb-no-network.mjs`, which replaces
// fetch, http, https, net, tls and dns with functions that throw. So this file does not merely
// avoid the network -- it proves the code path cannot reach it. If a later change introduces an
// accidental fetch on the fixture path, these tests fail with KB-NETWORK-TRAP rather than going
// quietly slow and flaky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = join(import.meta.dirname, '..', '..');
const CLI = join(REPO, 'scripts', 'kb', 'kb.mjs');
const TRAP = join(import.meta.dirname, 'fixtures', 'kb-no-network.mjs');
const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');

/** Spawn the CLI for real and return {code, stdout, stderr}. Never throws on a non-zero exit. */
async function kb(args, { env = {} } = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, ['--import', `file://${TRAP.replace(/\\/g, '/')}`, CLI, ...args], {
      env: { ...process.env, KB_BASE: '', CLAUDE_CODE_HOST_SESSION_ID: 'clitest0', ...env },
      cwd: REPO,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

async function withQueue(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-cli-'));
  try {
    return await fn({ KB_QUEUE_DIR: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noTrap = (r) => assert.ok(!`${r.stdout}${r.stderr}`.includes('KB-NETWORK-TRAP'),
  `a network door was opened:\n${r.stderr}`);

// ─── the four exit codes, from the real process ───────────────────────────────────────────────

test('ask on a covered question exits 0 and prints trust, confirmations and provenance', () => withQueue(async (env) => {
  const r = await kb(['ask', 'what does the Active column on /company/members reflect', '--base', FIXTURE], { env });
  noTrap(r);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /KB-27B4CD10/);
  assert.match(r.stdout, /\[well attested\]/, 'the trust label');
  assert.match(r.stdout, /4 confirmation\(s\)/, 'the confirmation count');
  assert.match(r.stdout, /seen by session:95777cf8 on vcptcore_stable at 2026-09-11/, 'the provenance');
  assert.match(r.stdout, /bound to the CONTACT record/, 'the claim itself');
}));

test('ask on an uncovered question exits 1 and says the base WAS read', () => withQueue(async (env) => {
  const r = await kb(['ask', 'how do I configure a Kubernetes ingress controller', '--base', FIXTURE], { env });
  noTrap(r);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /the base was read and holds nothing on this/);
}));

test('a base that is not a base exits 2 and stops', () => withQueue(async (env) => {
  const r = await kb(['ask', 'anything', '--base', join(import.meta.dirname, 'fixtures')], { env });
  noTrap(r);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /no base is configured/);
}));

test('a base whose entries cannot be read exits 3 — and never 1', () => withQueue(async (env) => {
  // The fixture's index names entries/, so pointing the base one level up leaves the index
  // loadable and every body absent: the mid-session failure shape.
  const broken = mkdtempSync(join(tmpdir(), 'kb-broken-'));
  try {
    const { cpSync, rmSync: rm } = await import('node:fs');
    cpSync(FIXTURE, broken, { recursive: true });
    rm(join(broken, 'entries'), { recursive: true, force: true });
    const r = await kb(['ask', 'what does the Active column on /company/members reflect', '--base', broken], { env });
    noTrap(r);
    assert.equal(r.code, 3, 'must not collapse into 1');
    assert.match(r.stdout, /not "nothing is known"/);
    assert.match(r.stdout, /KB-27B4CD10/, 'graceful degradation still names the entry');
  } finally {
    rmSync(broken, { recursive: true, force: true });
  }
}));

// ─── the declared default base is an https URL, and it is refused OFFLINE ─────────────────────

test('with no --base and no KB_BASE, the declared default refuses without touching the network', () => withQueue(async (env) => {
  const r = await kb(['stat'], { env });
  noTrap(r);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /raw\.githubusercontent\.com/, 'stat names the base');
  assert.match(r.stdout, /chosen by the declared default base/, 'and how it was chosen');
  assert.match(r.stdout, /no reader is registered for "https:\/\/"/);
}));

// ─── capture: refused, and every operation leaves exactly one line ────────────────────────────

test('capture against an existing anchors+scope is REFUSED, exit 1, naming the id', () => withQueue(async (env) => {
  const r = await kb(['capture', '--base', FIXTURE,
    '--subject', 'coupon discount does not change line prices',
    '--question', 'does a cart coupon change item prices',
    '--claim', 'It does not.', '--deployment', 'vcst_qa',
    '--anchor', 'POST /api/carts', '--anchor', 'Mutations.addCouponToCart',
    '--scope', 'surface=platform-api'], { env });
  noTrap(r);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /REFUSED — the base already holds this fact/);
  assert.match(r.stdout, /KB-55C8E448 is already this fact/);
  assert.match(r.stdout, /kb confirm KB-55C8E448/);
  assert.match(r.stdout, /kb dispute KB-55C8E448/);
}));

test('EVERY operation appends exactly one queue line, the refusal included', () => withQueue(async (env) => {
  const ops = [
    ['ask', 'what does the Active column on /company/members reflect', '--base', FIXTURE],
    ['ask', 'how do I configure a Kubernetes ingress controller', '--base', FIXTURE],
    ['show', 'KB-27B4CD10', '--base', FIXTURE],
    ['capture', '--base', FIXTURE, '--subject', 'coupon discount does not change line prices',
      '--question', 'q', '--claim', 'c', '--deployment', 'vcst_qa',
      '--anchor', 'POST /api/carts', '--anchor', 'Mutations.addCouponToCart', '--scope', 'surface=platform-api'],
    ['capture', '--base', FIXTURE, '--subject', 'checkout shipping step loses the selected method on back navigation',
      '--question', 'q', '--claim', 'c', '--deployment', 'vcst_qa',
      '--anchor', '/checkout/shipping', '--scope', 'surface=storefront-ui'],
    ['confirm', 'KB-55C8E448', '--base', FIXTURE, '--deployment', 'vcptcore_stable'],
    ['dispute', 'KB-06664A3A', '--base', FIXTURE, '--deployment', 'virtostart', '--saw', 'monotonic here'],
  ];
  for (const op of ops) noTrap(await kb(op, { env }));
  // `stat` is deliberately not logged, so it must not change the count.
  noTrap(await kb(['stat', '--base', FIXTURE], { env }));

  const { readQueue } = await import('../kb/core/queue.mjs');
  const q = await readQueue({ env: { ...env, CLAUDE_CODE_HOST_SESSION_ID: 'clitest0' } });
  assert.equal(q.lines.length, ops.length, 'one line per operation, no more and no fewer');
  assert.deepEqual(q.lines.map((l) => l.kind),
    ['ask', 'ask', 'show', 'capture-refused', 'capture', 'confirm', 'dispute']);
  assert.equal(q.malformed, 0);
}));

test('the queued capture is visible to stat as a pending change', () => withQueue(async (env) => {
  await kb(['capture', '--base', FIXTURE, '--subject', 'checkout shipping step loses the selected method on back navigation',
    '--question', 'q', '--claim', 'c', '--deployment', 'vcst_qa',
    '--anchor', '/checkout/shipping', '--scope', 'surface=storefront-ui'], { env });
  const r = await kb(['stat', '--base', FIXTURE], { env });
  noTrap(r);
  assert.match(r.stdout, /1 pending change\(s\)/);
  assert.match(r.stdout, /6 entr\(ies\), 5 active/);
}));

test('nothing is sent: the CLI says so, and the trap proves it', () => withQueue(async (env) => {
  const r = await kb(['confirm', 'KB-55C8E448', '--base', FIXTURE, '--deployment', 'qa'], { env });
  noTrap(r);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nothing has been sent; it ships with the next push/);
}));

// ─── the trap itself must be able to fail ─────────────────────────────────────────────────────

test('the network trap is live — a control that WOULD reach the network throws', async () => {
  // Without this, every `noTrap` above could be passing because the trap does nothing. The trap
  // throws SYNCHRONOUSLY, before fetch returns a promise, so `.catch()` never attaches and the
  // message arrives on stderr -- which is also exactly how an accidental fetch would surface.
  const probe = await run(process.execPath, [
    '--import', `file://${TRAP.replace(/\\/g, '/')}`,
    '-e', 'fetch("https://example.invalid")',
  ]).then(() => ({ stderr: '', code: 0 }), (e) => ({ stderr: e.stderr ?? '', code: e.code }));
  assert.notEqual(probe.code, 0, 'a real network call must fail under the trap');
  assert.match(probe.stderr, /KB-NETWORK-TRAP: fetch was called/);
});
