// Two-stage `ask` (STEP 6, VCST-6087 Phase 2): the base proposes candidates, the agent decides, and
// both halves of the decision reach the log -- a pick as a `show` pointing at its ask, an abstention
// as a `none` pointing at its ask.
//
// DERIVATION ONLY: which ask a verdict points at, which candidates were opened, what a headline-only
// candidate was shown. How good the candidates are is `bench-two-stage.mjs`'s job, not a unit test's.
//
// EVERY TEST HERE ISOLATES `KB_QUEUE_DIR` (see kb-log-fields.test.mjs for why).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readQueue } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { ask, none, pickedFrom, show } from '../kb/core/verbs.mjs';
import { askLines } from '../kb/core/render.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = () => ({ reader: localReader(FIXTURE), locator: FIXTURE, how: 'test', why: null });
const ANSWERED = 'what does the Active column on /company/members reflect';
// Proposes several of the fixture's entries -- the case where opened and headline-only differ.
const BROAD = 'storefront cart order members contact';
const OTHER = 'which kubernetes ingress annotation terminates tls for the storefront gateway';

async function withQueue(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-two-stage-'));
  try {
    return await fn({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'twostage' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const linesOf = (env) => readQueue({ env }).then((q) => q.lines);

// ── which ask a pick came from ────────────────────────────────────────────────────────────────

test('a pick points at the LATEST ask whose candidates held the id, case-folded, or at nothing', () => {
  const asks = [
    { at: '2026-09-29T08:00:00.000Z', matched: ['KB-AAAA0001', 'KB-BBBB0002'] },
    { at: '2026-09-29T08:05:00.000Z', matched: ['KB-BBBB0002'] },
    { at: '2026-09-29T08:10:00.000Z', matched: ['KB-CCCC0003'] },
  ];
  assert.equal(pickedFrom(asks, 'kb-bbbb0002'), '2026-09-29T08:05:00.000Z');
  assert.equal(pickedFrom(asks, 'KB-AAAA0001'), '2026-09-29T08:00:00.000Z');
  assert.equal(pickedFrom(asks, 'KB-DDDD0004'), null, 'an id no ask proposed is a citation, not a pick');
});

// ── what an ask returns and records ───────────────────────────────────────────────────────────

test('only the first `top` candidates are opened; the rest are headlines, shown no trust label', () => withQueue(async (env) => {
  const r = await ask(BROAD, opened(), { env, top: 1 });
  assert.equal(r.state, 'candidates');
  assert.ok(r.candidates.length > 1, 'the fixture must propose more than one candidate for this to test anything');
  assert.equal(r.hits.length, 1);
  assert.deepEqual(r.candidates.map((c) => c.opened), r.candidates.map((_, i) => i === 0));
  const [line] = await linesOf(env);
  assert.deepEqual(line.opened, [r.candidates[0].id]);
  assert.equal(line.trustShown.length, line.matched.length, 'positional against matched');
  assert.equal(typeof line.trustShown[0], 'string');
  assert.ok(line.trustShown.slice(1).every((t) => t === null), 'a headline carried no label, so none is recorded');
  assert.equal(r.ask, line.at, 'the handle is the line’s own `at`');
}));

test('the agent is shown every candidate and the handle kb_none needs', () => withQueue(async (env) => {
  const r = await ask(BROAD, opened(), { env, top: 1 });
  const text = askLines(r).join('\n');
  for (const c of r.candidates) assert.ok(text.includes(c.id), `${c.id} is listed`);
  assert.ok(text.includes(r.ask));
}));

// ── the two verdicts ──────────────────────────────────────────────────────────────────────────

test('a show of a candidate records the ask it picked from; a show of anything else records none', () => withQueue(async (env) => {
  const r = await ask(ANSWERED, opened(), { env });
  const picked = r.candidates[0].id;
  const s = await show(picked, opened(), { env });
  assert.equal(s.after, r.ask);
  const lines = await linesOf(env);
  assert.equal(lines.at(-1).kind, 'show');
  assert.equal(lines.at(-1).after, r.ask);
}));

test('a show with no ask before it is a citation, and carries no pointer', () => withQueue(async (env) => {
  await show('KB-27B4CD10', opened(), { env });
  const [line] = await linesOf(env);
  assert.equal(line.kind, 'show');
  assert.ok(!('after' in line));
}));

test('none points at the ask it names, else at the latest one', () => withQueue(async (env) => {
  const first = await ask(ANSWERED, opened(), { env });
  const second = await ask(OTHER, opened(), { env });
  const latest = await none({ env });
  assert.equal(latest.state, 'recorded');
  assert.equal(latest.after, second.ask);
  const named = await none({ env, ask: first.ask });
  assert.equal(named.after, first.ask);
  assert.equal(named.q, ANSWERED, 'the agent is told which ask it closed');
  const lines = (await linesOf(env)).filter((l) => l.kind === 'none');
  assert.deepEqual(lines.map((l) => l.after), [second.ask, first.ask]);
}));

test('a none naming an ask this session never made is recorded without a pointer, and says so', () => withQueue(async (env) => {
  await ask(ANSWERED, opened(), { env });
  const r = await none({ env, ask: '1999-01-01T00:00:00.000Z' });
  assert.equal(r.state, 'recorded');
  assert.equal(r.after, undefined);
  assert.match(r.why, /no ask of this session/);
  const line = (await linesOf(env)).at(-1);
  assert.equal(line.kind, 'none');
  assert.ok(!('after' in line), 'a pointer to nothing would read as a verdict on something');
}));
