// The open loop. Three runs consulted the base in their first minutes and wrote to it from their
// closing report; this is the machinery that makes a question outlive the moment it was asked.
//
// The load-bearing decision under test is that EVERY question is recorded, not only the misses.
// Across all three runs the base was asked 23 questions and missed none of them, so a MISS-only
// loop would have stayed empty through every run this experiment has done.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  recordAsk, recordUses, recordSettled, closeQuestions, dropQuestion,
  openQuestions, unconfirmedUses, loopBanner, questionKey, DEMAND_FILE,
} from '../src/demand.mjs';

const makeBase = () => mkdtempSync(join(tmpdir(), 'kb-demand-'));
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

test('a question asked and never written back to stays open', () => {
  const dir = makeBase();
  recordAsk(dir, 'how does the storefront gate organization roles?', { miss: false });
  const open = openQuestions(dir);
  assert.equal(open.length, 1);
  assert.equal(open[0].asked, 1);
  assert.equal(open[0].missed, 0, 'it was answered; that is not the same as settled');
  drop(dir);
});

test('asking the same question again counts rather than duplicating', () => {
  const dir = makeBase();
  recordAsk(dir, 'What roles can a member have?');
  recordAsk(dir, 'what roles can a member have');
  recordAsk(dir, '  WHAT   roles can a member have?  ');
  const open = openQuestions(dir);
  assert.equal(open.length, 1, 'case and whitespace are not different questions');
  assert.equal(open[0].asked, 3, 'and how often it came back is the coverage signal');
  drop(dir);
});

test('a capture with the same question closes it, and one with another question does not', () => {
  const dir = makeBase();
  recordAsk(dir, 'where does a cart-level reward land?');
  recordAsk(dir, 'how is the discount rounded?');

  const closed = closeQuestions(dir, { question: 'where does a cart-level reward land?', id: 'KB-00000001' });
  assert.equal(closed.length, 1);
  const open = openQuestions(dir);
  assert.equal(open.length, 1);
  assert.equal(open[0].question, 'how is the discount rounded?');
  drop(dir);
});

// The alternative was to close on anchor overlap, which is why this is pinned: a capture anchored
// on Query.cart would have closed every open question that ever mentioned the cart, deleting the
// demand signal while the gap was still there.
test('a capture does not close a question merely because it is on the same subject', () => {
  const dir = makeBase();
  recordAsk(dir, 'does the cart keep the discount percentage anywhere?');
  closeQuestions(dir, { question: 'what fields does CartType have?', id: 'KB-00000002' });
  assert.equal(openQuestions(dir).length, 1);
  drop(dir);
});

test('a question can be dropped, and the drop is recorded rather than erased', () => {
  const dir = makeBase();
  recordAsk(dir, 'when are promotions re-evaluated?');
  const key = questionKey('when are promotions re-evaluated?');

  const dropped = dropQuestion(dir, key.slice(0, 8), { reason: 'the derived entry answered it outright' });
  assert.equal(dropped.key, key, 'a key prefix is enough to name it');
  assert.equal(openQuestions(dir).length, 0);

  const log = readFileSync(join(dir, DEMAND_FILE), 'utf8');
  assert.match(log, /"kind":"dropped"/);
  assert.match(log, /answered it outright/, 'why it was dropped is part of the record');
  drop(dir);
});

test('only experiential entries become something to confirm', () => {
  const dir = makeBase();
  recordUses(dir, [
    { id: 'KB-AAAAAAA1', plane: 'derived-first' },
    { id: 'KB-BBBBBBB2', plane: 'experiential' },
  ]);
  const uses = unconfirmedUses(dir);
  assert.deepEqual(uses.map((u) => u.id), ['KB-BBBBBBB2'],
    'a derived entry is byte-gated against the deployment; a human confirmation would add nothing');
  drop(dir);
});

test('confirming or disputing settles the use', () => {
  const dir = makeBase();
  recordUses(dir, [{ id: 'KB-BBBBBBB2', plane: 'experiential' }]);
  recordSettled(dir, 'KB-BBBBBBB2');
  assert.equal(unconfirmedUses(dir).length, 0);
  drop(dir);
});

test('the banner is silent when nothing is open, and names both halves when they are', () => {
  const dir = makeBase();
  assert.equal(loopBanner(dir), null);

  recordAsk(dir, 'a question nobody answered');
  recordUses(dir, [{ id: 'KB-BBBBBBB2', plane: 'experiential' }]);
  const banner = loopBanner(dir);
  assert.match(banner, /1 question\(s\)/);
  assert.match(banner, /KB-BBBBBBB2/);
  drop(dir);
});

test('a corrupt line does not take the loop down with it', () => {
  const dir = makeBase();
  recordAsk(dir, 'a real question');
  writeFileSync(join(dir, DEMAND_FILE), `${readFileSync(join(dir, DEMAND_FILE), 'utf8')}{not json\n`);
  recordAsk(dir, 'another real question');
  assert.equal(openQuestions(dir).length, 2,
    'this is bookkeeping; it must never be able to fail the answer it is bookkeeping about');
  drop(dir);
});

test('a base with no demand log yet is simply empty', () => {
  const dir = makeBase();
  assert.deepEqual(openQuestions(dir), []);
  assert.deepEqual(unconfirmedUses(dir), []);
  assert.equal(loopBanner(dir), null);
  drop(dir);
});
