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

// A throwaway queue for the whole file. WITHOUT THIS every invocation that does not opt into
// `withQueue()` writes to the DEFAULT queue directory -- the developer's real one -- so `npm test`
// seeds it with synthetic lines, and the sweep (core/push.mjs) then ships them to the PUBLIC base
// as a log file. Measured: a `clitest0.jsonl` of 73 smoke-test lines was queued for exactly that.
// An `--import` trap proves this file cannot reach the network; nothing proved it could not reach
// the operator's own state, which is the same class of escape through a different door.
const SCRATCH = mkdtempSync(join(tmpdir(), 'kb-cli-default-'));
process.on('exit', () => { try { rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Spawn the CLI for real and return {code, stdout, stderr}. Never throws on a non-zero exit. */
async function kb(args, { env = {} } = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, ['--import', `file://${TRAP.replace(/\\/g, '/')}`, CLI, ...args], {
      env: { ...process.env, KB_BASE: '', KB_QUEUE_DIR: SCRATCH, CLAUDE_CODE_HOST_SESSION_ID: 'clitest0', ...env },
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

// ─── the declared default base is an https URL, and it is now actually READ ───────────────────

test('with no --base and no KB_BASE, the declared default is read, and offline that is exit 3', () => withQueue(async (env) => {
  // THIS TEST CHANGED IN SESSION 2, and the change is the session's point. It used to assert exit 2
  // and "no reader is registered for https://" -- true only because the seam was empty, so the
  // declared default could not be read by anything. Now it can: the HTTPS reader is registered at
  // `openBase`, so under the trap the same command reaches for the network, fails to get there, and
  // says EXACTLY that. Keeping the old assertion would have meant keeping a test that passed
  // because a feature was missing.
  //
  // What did NOT change, and is the reason the test is still here: `stat` names the base AND how it
  // was chosen, always. Knowing which base answered is half the question and the other half is why
  // that one (PLAN §12 rule 3).
  const r = await kb(['stat'], { env });
  assert.equal(r.code, 3);
  assert.match(r.stdout, /raw\.githubusercontent\.com/, 'stat names the base');
  assert.match(r.stdout, /chosen by the declared default base/, 'and how it was chosen');
  assert.match(r.stdout, /reader {4}http/, 'and which implementation is behind it');
  assert.match(r.stdout, /unreachable/, 'offline, the honest answer is "could not ask"');
  assert.equal(r.stderr, '', 'and it is not a crash');
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

// ─── exit 3, and the reason it is a different number from exit 1 ──────────────────────────────

test('a base that cannot be reached exits 3, and the trap is what makes it unreachable', async () => {
  // THE POINT OF THE WHOLE DESIGN, exercised end to end with no network. Under the trap `fetch`
  // throws; the HTTPS reader must turn that into `unreachable` rather than letting it escape as a
  // crash or -- far worse -- collapsing it into "the base holds nothing". Exit 1 here would tell an
  // agent the base was read and is empty, and it would go write a duplicate of an entry that
  // already exists.
  const r = await kb(['ask', 'anything at all'], { env: { KB_BASE: 'https://example.invalid/v2' } });
  assert.equal(r.code, 3, `expected exit 3, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /the base was NOT read/);
  assert.match(r.stdout, /This is not "nothing is known"/);
  // The trap message arrives as the DETAIL of a classified failure, not as a stack trace: that is
  // the difference between a handled unreachable and an unhandled exception.
  assert.match(r.stdout, /KB-NETWORK-TRAP/);
  assert.equal(r.stderr, '', 'an unreachable base is not a crash');
});

test('exit 1 and exit 3 are produced by the same verb on the same question', async () => {
  // Side by side, because the only thing that distinguishes them is which of the two happened --
  // and a reader of this file should be able to see that they are not two spellings of one state.
  // A question with no token in common with any subject or question in the fixture. It has to be
  // chosen deliberately: v1's ranker has no score floor (PLAN §11 defers that until the log
  // justifies it), so one shared ordinary word is enough to produce a hit.
  const QUESTION = 'zzz kangaroo photosynthesis brigade';
  const miss = await kb(['ask', QUESTION, '--base', FIXTURE]);
  noTrap(miss);
  assert.equal(miss.code, 1, `expected a miss, got:
${miss.stdout}`);
  assert.match(miss.stdout, /the base was read and holds nothing on this/);

  const down = await kb(['ask', QUESTION], { env: { KB_BASE: 'https://example.invalid/v2' } });
  assert.equal(down.code, 3);
  assert.match(down.stdout, /the base was NOT read/);
});

// ─── reindex, the verb the drift messages name ────────────────────────────────────────────────

test('reindex is a verb the CLI accepts — the drift messages no longer point at nothing', async () => {
  // Three user-facing messages tell a reader to "run `kb reindex`". Until this session they named
  // a verb the CLI rejected as unknown, which is worse than no remedy: it spends the reader's
  // attention and then tells them they typed something wrong.
  const r = await kb(['reindex', '--base', FIXTURE, '--dry-run']);
  noTrap(r);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /would rebuild index\.json \(6\)/);
  assert.ok(!/unknown verb/.test(r.stdout));
});

test('reindex on the read-only network base refuses and names the remedy', async () => {
  const r = await kb(['reindex'], { env: { KB_BASE: 'https://raw.githubusercontent.com/x/y/main/v2' } });
  assert.equal(r.code, 2, 'pointing the repair verb at a CDN is a config problem, not a knowledge one');
  assert.match(r.stdout, /kb reindex --base/);
  // It must refuse BEFORE it reaches for the network, or an operator with no connection gets a
  // timeout where they should have got an explanation.
  noTrap(r);
});

test('the usage text names reindex', async () => {
  const r = await kb([]);
  assert.match(r.stdout, /kb -- reindex/);
});

// ─── the optional deployment reaches the line through this door too ───────────────────────────
//
// Same wiring argument as the MCP door's twin, plus one this door owns alone: `parseArgs` gives a
// flag written without a value the boolean `true`, so the third invocation here is the one that
// would publish `deployment: "true"` if `stand()` took anything but a string.

test('--deployment on ask reaches the line; omitted or valueless, it leaves no field', () => withQueue(async (env) => {
  await kb(['ask', 'what does the Active column on /company/members reflect', '--deployment', 'vcst_qa', '--base', FIXTURE], { env });
  await kb(['ask', 'what does the Active column on /company/members reflect', '--base', FIXTURE], { env });
  await kb(['ask', 'what does the Active column on /company/members reflect', '--deployment', '--base', FIXTURE], { env });
  const { readQueue } = await import('../kb/core/queue.mjs');
  const { lines } = await readQueue({ env: { ...env, CLAUDE_CODE_HOST_SESSION_ID: 'clitest0' } });
  assert.equal(lines[0].deployment, 'vcst_qa');
  assert.ok(!('deployment' in lines[1]));
  assert.ok(!('deployment' in lines[2]), 'a valueless flag is not a stand called "true"');
}));
