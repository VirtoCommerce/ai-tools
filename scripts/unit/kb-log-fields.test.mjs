// WHAT A LOG LINE RECORDS — the `synthetic` mark (PLAN §14.2) and the fields added with the floor.
//
// A log field is cheap to add and effectively impossible to remove: the log is public, append-only,
// and old lines can never be backfilled. So each of these was admitted against a question somebody
// has NOW, and `verbs.mjs` carries the list of what was refused and why. This file pins the ones
// that got in, on real lines rather than on the code's intentions.
//
// EVERY TEST HERE ISOLATES `KB_QUEUE_DIR`. Anything writing through `core/queue.mjs` in a test
// must: the suite once left 73 smoke-test lines sitting in a developer's real queue, staged for a
// public repository by the next sweep (PLAN §7.1a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readQueue } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { RANKER } from '../kb/core/rank.mjs';
import { ask, capture } from '../kb/core/verbs.mjs';
import { captureLines } from '../kb/core/render.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = () => ({ reader: localReader(FIXTURE), locator: FIXTURE, how: 'test', why: null });

async function withQueue(fn, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-fields-'));
  try {
    return await fn({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'testsess', ...extraEnv });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const linesOf = (env) => readQueue({ env }).then((q) => q.lines);

// A question the 6-entry fixture holds an answer to, and two it does not.
const ANSWERED = 'what does the Active column on /company/members reflect';
// A question the fixture scores SOMETHING on (one shared word, coverage 0.14) and admits nothing
// for -- the interesting miss, the one that carries a near-miss.
const MISSED_NEAR = 'which kubernetes ingress annotation terminates tls for the storefront gateway';
// And one it scores nothing on at all.
const MISSED_COLD = 'what colour is the warehouse forklift';

// ── The floor's own fields ────────────────────────────────────────────────────────────────────

test('an answered ask records each hit’s score, positionally against matched', async () => {
  await withQueue(async (env) => {
    const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
    const [line] = await linesOf(env);
    assert.deepEqual(line.matched, r.hits.map((h) => h.id));
    assert.equal(line.scores.length, line.matched.length, 'scores are positional against matched');
    assert.deepEqual(line.scores, r.hits.map((h) => h.score));
    // The winning score is scores[0]. There is deliberately no second `score` field: a field for a
    // fact another field already carries is a copy that can disagree with the original.
    assert.ok(!('score' in line));
    assert.equal(line.scores[0], Math.max(...line.scores), 'sorted best first');
  });
});

test('a MISS records the best candidate that did not clear the floor', async () => {
  // The field that cannot be checked by reading the code: it needs a question the base scores
  // something on and admits nothing for.
  await withQueue(async (env) => {
    const r = await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'miss');
    const [line] = await linesOf(env);
    assert.equal(line.state, 'miss');
    assert.deepEqual(line.matched, []);
    assert.ok(line.nearMiss, 'something scored and was rejected — that is the interesting miss');
    assert.match(line.nearMiss.id, /^KB-/);
    assert.ok(line.nearMiss.score > 0);
    assert.ok(line.nearMiss.coverage > 0 && line.nearMiss.coverage < 1);
    // Two decimal places, because a human reads it and 0.45454545 is not a number anybody weighs.
    assert.equal(String(line.nearMiss.coverage), String(Math.round(line.nearMiss.coverage * 100) / 100));
  });
});

test('a miss on a question the base scores NOTHING on carries no nearMiss', async () => {
  // "Nothing came close" and "something came close and was cut" are different facts, and a field
  // that was always present would collapse them.
  await withQueue(async (env) => {
    const r = await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'miss');
    const [line] = await linesOf(env);
    assert.ok(!('nearMiss' in line));
  });
});

// ── Which ranker, and which door ──────────────────────────────────────────────────────────────

test('every ask names the ranker that produced it — and only asks do', async () => {
  // Every line already in the base came from the no-floor ranker. Without this marker a future
  // before/after comparison silently mixes two systems.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    const lines = await linesOf(env);
    for (const l of lines) assert.equal(l.rank, RANKER, 'answered and missed alike');
    assert.equal(RANKER, 'floor-1');

    const cap = await capture({
      subject: 'a fact about something else entirely',
      question: 'what happens to a saved filter on sign-out',
      claim: 'It is dropped.',
      deployment: 'vcst_qa',
      anchors: ['/account/filters'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(cap.state, 'queued');
    const capLine = (await linesOf(env)).at(-1);
    assert.ok(!('rank' in capLine), 'a capture does not rank, so a ranker version there means nothing');
  });
});

test('the door is recorded when the caller names it, and omitted when it does not', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'mcp' });
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(ANSWERED, opened(), { env });
    await ask(ANSWERED, opened(), { env, via: 'telepathy' });
    const lines = await linesOf(env);
    assert.equal(lines[0].via, 'mcp');
    assert.equal(lines[1].via, 'cli');
    // A field that defaults is a field that lies: an unnamed door is absent, not guessed.
    assert.ok(!('via' in lines[2]));
    assert.ok(!('via' in lines[3]), 'and an unknown door is not recorded either');
  });
});

// ── capture: the ask it followed ──────────────────────────────────────────────────────────────

test('a capture points back at the ask it followed — as a pointer, not a copy', async () => {
  await withQueue(async (env) => {
    await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    const askLine = (await linesOf(env)).at(-1);

    const r = await capture({
      subject: 'the storefront gateway terminates tls at the ingress, not in the app',
      question: 'where is tls terminated for the storefront',
      claim: 'Observed on the deployment: the app receives plain http behind the ingress.',
      deployment: 'vcst_qa',
      anchors: ['/company/gateway'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');

    const capLine = (await linesOf(env)).at(-1);
    assert.equal(capLine.kind, 'capture');
    assert.equal(capLine.after, askLine.at, 'the timestamp of the preceding ask, which is already in this file');
    // NOT a copy of the question. A second copy of a question is a second thing that can disagree
    // with the first, and PLAN §7 keeps the log to ids and pointers.
    assert.ok(!('q' in capLine));
  });
});

test('a capture with no ask before it says nothing rather than guessing', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a fact recorded without asking first',
      question: 'does the saved cart survive a sign-out',
      claim: 'It does.',
      deployment: 'vcst_qa',
      anchors: ['/cart/saved'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    const [capLine] = await linesOf(env);
    assert.ok(!('after' in capLine), '`after` means FOLLOWED; with nothing before it, there is nothing to say');
  });
});

// ── capture: the related hint it surfaced ─────────────────────────────────────────────────────

test('a capture records how many related entries it put in front of the writer', async () => {
  await withQueue(async (env) => {
    // The fixture holds two entries about where a cart-level promotion lands (KB-55C8E448,
    // KB-378EEA52), which is what this fact speaks to.
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    assert.ok(r.related.hits.length > 0, 'the fixture holds two entries about cart-level discounts');

    const line = (await linesOf(env)).at(-1);
    // ONE field, counting what was SURFACED. PLAN §7: a count, not the subjects, and not a second
    // field for the ones that scored and were not shown.
    assert.equal(line.related, r.related.hits.length);
    assert.ok(!('relatedIds' in line) && !('relatedTotal' in line));
  });
});

test('a capture the base holds nothing near records related 0 rather than omitting it', async () => {
  // `0` is the reading that makes the rest of the column mean anything: it says the hint ran and
  // found nothing, which is a different fact from a line written before the hint existed.
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'the warehouse forklift is repainted every spring',
      question: 'how often is the forklift repainted',
      claim: 'Observed: annually.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    assert.equal(r.related.hits.length, 0);
    assert.equal((await linesOf(env)).at(-1).related, 0);
  });
});

test('the hint never blocks the capture — it is computed after the queue write is decided', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    // Related entries exist AND the capture is queued, with the payload the pusher needs intact.
    assert.ok(r.related.hits.length > 0);
    assert.equal(r.state, 'queued');
    const line = (await linesOf(env)).at(-1);
    assert.equal(line.kind, 'capture', 'not `capture-refused`');
    assert.ok(line.payload?.entry, 'and it still carries what the push will send');
  });
});

test('both doors say the same thing, because the sentence lives in the renderer', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    const cli = captureLines(r, { prefix: 'kb capture' });
    const mcp = captureLines(r, { prefix: 'kb_capture' });
    const related = (lines) => lines.filter((l) => l.startsWith('  related') || /^ {4}KB-/.test(l));
    assert.deepEqual(related(cli), related(mcp), 'the two doors differ only in the prefix');
    assert.ok(related(cli).length > 1);
    // It must not read as a gate: the capture is already queued by the time these lines exist.
    assert.match(related(cli)[0], /nothing is blocked/);
  });
});

test('a capture with nothing related prints no related block at all', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'the warehouse forklift is repainted every spring',
      question: 'how often is the forklift repainted',
      claim: 'Observed: annually.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.ok(!captureLines(r).some((l) => l.includes('related')));
  });
});
