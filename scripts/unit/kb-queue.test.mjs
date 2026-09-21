// The queue and the log (PLAN §7), and the write verbs that feed them.
//
// EVERY OPERATION WRITES EXACTLY ONE LINE, AND THE LINE RECORDS THE OUTCOME -- INCLUDING THE
// FAILURES. Logging only successes would systematically under-report exactly the events the
// report exists to surface: the miss is the highest-value line in the file, and a capture refused
// as a duplicate is a ranking miss that did NOT become a duplicate.
//
// Nothing here reaches a network, and nothing here sends anything anywhere: in this session
// capture/confirm/dispute only QUEUE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOGGED, MUTATIONS, pendingMutations, queuePath, readQueue, sessionId } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { ask, capture, confirm, dispute, show, stat, toLogLine } from '../kb/core/verbs.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = () => ({ reader: localReader(FIXTURE), locator: FIXTURE, how: 'test', why: null });
const envIn = (dir) => ({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'testsess' });

async function withQueue(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-queue-'));
  try {
    return await fn(dir, envIn(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CAPTURE = {
  subject: 'checkout shipping step loses the selected method on back navigation',
  question: 'why does the shipping method reset when going back a step',
  claim: 'Navigating back re-initialises the shipping step and drops the stored selection.',
  deployment: 'vcst_qa',
  anchors: ['/checkout/shipping'],
  scope: ['surface=storefront-ui'],
};

// ─── session identity is free ─────────────────────────────────────────────────────────────────

test('the session id comes from the inherited env, not from a caller remembering to pass it', () => {
  // CLAUDE_CODE_HOST_SESSION_ID is inherited by children, so the prior art's measured pain -- one
  // missed prefix drops a question row silently -- does not arise.
  assert.equal(sessionId({ CLAUDE_CODE_HOST_SESSION_ID: 'f3d05dd3abcdef' }), 'f3d05dd3');
  assert.match(sessionId({}), /^p\d+$/, 'with no session, the honest answer is "this process"');
});

test('the queue path is one file per session — two sessions can never collide', () => {
  const a = queuePath({ KB_QUEUE_DIR: 'X', CLAUDE_CODE_HOST_SESSION_ID: 'aaaaaaaa' });
  const b = queuePath({ KB_QUEUE_DIR: 'X', CLAUDE_CODE_HOST_SESSION_ID: 'bbbbbbbb' });
  assert.notEqual(a, b);
});

// ─── one line per operation, outcome included ─────────────────────────────────────────────────

test('an ANSWER, a MISS and an UNREACHABLE each write exactly one line, and say which', () => withQueue(async (dir, env) => {
  await ask('what does the Active column on /company/members reflect', opened(), { env });
  await ask('how do I configure a Kubernetes ingress controller', opened(), { env });
  await ask('anything at all', { reader: null, why: 'no reader' }, { env });

  const { lines } = await readQueue({ env });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.state), ['answer', 'miss', 'no-base']);
  assert.deepEqual(lines.map((l) => l.kind), ['ask', 'ask', 'ask']);
  // The miss line must carry the question VERBATIM -- a hashed or redacted question makes the miss
  // panel worthless, and the miss panel is the point of the whole exercise.
  assert.equal(lines[1].q, 'how do I configure a Kubernetes ingress controller');
  assert.deepEqual(lines[1].matched, []);
  // The answer line records which matched AND which were opened -- two different facts.
  assert.deepEqual(lines[0].matched, ['KB-27B4CD10']);
  assert.deepEqual(lines[0].opened, ['KB-27B4CD10']);
}));

test('a REFUSED capture is logged — it is a ranking miss that did not become a duplicate', () => withQueue(async (dir, env) => {
  const r = await capture({
    ...CAPTURE, anchors: ['POST /api/carts', 'Mutations.addCouponToCart'], scope: ['surface=platform-api'],
  }, opened(), { env });
  assert.equal(r.state, 'refused');
  assert.equal(r.dupeOf.id, 'KB-55C8E448');

  const { lines } = await readQueue({ env });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'capture-refused');
  assert.equal(lines[0].dupeOf, 'KB-55C8E448');
  assert.equal(lines[0].why, 'anchors+scope');
  assert.equal(lines[0].when, 'call', 'the push-time re-check logs the same line with when: "push"');
}));

test('the refusal tells the caller to confirm or dispute, naming the existing id', () => withQueue(async (dir, env) => {
  const r = await capture({
    ...CAPTURE, anchors: ['POST /api/carts', 'Mutations.addCouponToCart'], scope: ['surface=platform-api'],
  }, opened(), { env });
  assert.match(r.message, /KB-55C8E448 is already this fact/);
  assert.match(r.message, /confirm KB-55C8E448/);
  assert.match(r.message, /dispute KB-55C8E448/);
}));

test('a capture that gets through is queued with the payload the pusher needs', () => withQueue(async (dir, env) => {
  const r = await capture(CAPTURE, opened(), { env });
  assert.equal(r.state, 'queued');
  assert.equal(r.id, r.entry.id);

  const { lines } = await readQueue({ env });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'capture');
  assert.equal(lines[0].payload.entry.status, 'active');
  assert.equal(lines[0].payload.entry.evidence[0].by, 'session:testsess');
  assert.deepEqual(lines[0].payload.entry.appliesTo, [{ axis: 'surface', value: 'storefront-ui' }]);
  assert.equal(lines[0].payload.body, CAPTURE.claim);
}));

test('the PUBLIC log line is the queue line minus the payload', () => withQueue(async (dir, env) => {
  // PLAN §7: a log line carries ids and subjects only and never an entry body. The queue has to
  // carry the body or there is nothing to push, so they are two artifacts and this is the join.
  await capture(CAPTURE, opened(), { env });
  const { lines } = await readQueue({ env });
  const publicLine = toLogLine(lines[0]);
  assert.equal(publicLine.payload, undefined);
  // `related` names the IDS the capture surfaced (PLAN §17.4(6)) — the hint's own record that it
  // ran, and what it showed. It is in this whitelist rather than tolerated by a loose assertion,
  // because this list is the thing that makes a new public log field a deliberate act.
  // `read` joins it on the same terms: the ids this session had already opened when it wrote, which
  // is the hint that actually finds contradictions (the word hint carried 1 of 4 targets across the
  // corpus's three labelled pairs; this one carries 4 of 4). Ids of public entries, no prose, and
  // the same chain `related` exists for — a later dispute of an id that appears here is the record
  // that the writer acted on what it was shown.
  assert.deepEqual(Object.keys(publicLine).sort(), ['at', 'id', 'kind', 'question', 'read', 'related', 'subject']);
  assert.equal(publicLine.question, CAPTURE.question, 'the retrieval key, not only the claim');
  for (const field of ['related', 'read']) {
    assert.ok(Array.isArray(publicLine[field]), `${field}: ids, so a later dispute is traceable`);
    assert.ok(publicLine[field].every((v) => /^KB-[0-9A-F]{8}$/.test(v)), `${field}: ids only — never subjects`);
  }
  assert.ok(!JSON.stringify(publicLine).includes(CAPTURE.claim), 'no claim prose in the public log');
}));

test('confirm and dispute queue evidence; a dispute is marked as contradicting', () => withQueue(async (dir, env) => {
  await confirm('KB-55C8E448', { deployment: 'vcptcore_stable', note: 'same on stable' }, opened(), { env });
  await dispute('KB-06664A3A', { deployment: 'virtostart', saw: 'sort was monotonic here' }, opened(), { env });

  const { lines } = await readQueue({ env });
  assert.deepEqual(lines.map((l) => l.kind), ['confirm', 'dispute']);
  assert.equal(lines[0].payload.item.contradicts, undefined);
  assert.equal(lines[1].payload.item.contradicts, true);
  assert.equal(lines[1].payload.item.note, 'sort was monotonic here');
  // The entry is NOT retired by a dispute. One dissent against four confirmations is a flag.
  assert.equal(lines[1].payload.item.status, undefined);
}));

test('confirm and dispute refuse an id the base does not hold, and log nothing extra', () => withQueue(async (dir, env) => {
  const r = await confirm('KB-00000000', { deployment: 'qa' }, opened(), { env });
  assert.equal(r.state, 'invalid');
  assert.equal((await readQueue({ env })).lines.length, 0);
}));

test('dispute without --saw is refused: a contradiction with no observation is not evidence', () => withQueue(async (dir, env) => {
  const r = await dispute('KB-06664A3A', { deployment: 'qa' }, opened(), { env });
  assert.equal(r.state, 'invalid');
  assert.match(r.why, /--saw/);
}));

test('capture refuses an unusable anchor before it reaches the base', () => withQueue(async (dir, env) => {
  const r = await capture({ ...CAPTURE, anchors: ['C:/Program Files/Git/checkout/shipping'] }, opened(), { env });
  assert.equal(r.state, 'invalid');
  assert.equal(r.problems[0].kind, 'local-path');
}));

test('capture refuses with no scope — without it a storefront fact gets applied to admin', () => withQueue(async (dir, env) => {
  const r = await capture({ ...CAPTURE, scope: [] }, opened(), { env });
  assert.equal(r.state, 'invalid');
  assert.match(r.why, /scope/);
}));

test('show is logged; stat is NOT', () => withQueue(async (dir, env) => {
  // A `show` with no preceding `ask` means something else pointed at that id -- worth knowing.
  // An operator looking at the tool is not an agent using the base.
  await show('KB-27B4CD10', opened(), { env });
  assert.equal((await readQueue({ env })).lines.length, 1);
  await stat(opened(), { env });
  assert.equal((await readQueue({ env })).lines.length, 1, 'stat must not add a line');
}));

test('every kind written is a declared kind, and the mutations are the three write verbs', () => withQueue(async (dir, env) => {
  await ask('cart totals', opened(), { env });
  await show('KB-27B4CD10', opened(), { env });
  await capture(CAPTURE, opened(), { env });
  await confirm('KB-55C8E448', { deployment: 'qa' }, opened(), { env });
  await dispute('KB-06664A3A', { deployment: 'qa', saw: 'otherwise' }, opened(), { env });

  const { lines } = await readQueue({ env });
  for (const l of lines) assert.ok(LOGGED.includes(l.kind), `${l.kind} is not a declared kind`);
  assert.deepEqual([...MUTATIONS], ['capture', 'confirm', 'dispute']);
  assert.equal(pendingMutations(lines), 3);
}));

test('a truncated last line is counted, not thrown — one bad line must not cost the log', () => withQueue(async (dir, env) => {
  const { appendFileSync } = await import('node:fs');
  await ask('cart totals', opened(), { env });
  appendFileSync(queuePath(env), '{"kind":"capture","id":"KB-', 'utf8');
  const q = await readQueue({ env });
  assert.equal(q.lines.length, 1);
  assert.equal(q.malformed, 1);
}));

test('stat names the base AND how it was chosen, and reports the queue depth', () => withQueue(async (dir, env) => {
  await ask('cart totals', opened(), { env });
  await capture(CAPTURE, opened(), { env });
  const s = await stat(opened(), { env });
  assert.equal(s.base, FIXTURE);
  assert.equal(s.how, 'test');
  assert.equal(s.reader, 'local');
  assert.equal(s.queueDepth, 2);
  assert.equal(s.pending, 1, 'one queued change, one log line');
  assert.equal(s.active, s.entries - 1, 'the fixture holds exactly one retired entry');
}));
