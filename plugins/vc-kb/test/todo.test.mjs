// `kb todo` — the open loop sorted by what closing each row would take.
//
// The thing worth testing here is not the sorting. It is that the planner does not inherit the
// defect it is planning around. Its first version called the pile "ANSWERED" and told the reader
// there was nothing to do, for 24 of 25 rows, while a hand check found about a third of those
// answers adjacent rather than right. A work queue that lies in the reassuring direction is worse
// than no queue, so the pile is now CHECK and every row carries what the served entry claims to
// answer, beside what was asked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { stringifyFrontmatter } from '../src/frontmatter.mjs';
import { capture } from '../src/capture.mjs';
import { recordAsk } from '../src/demand.mjs';
import { plan, renderPlan, captureCommand } from '../src/todo.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-todo-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({ deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95', platformVersion: '3.1007.26' }));
  const id = 'KB-D0000020';
  const subject = 'rest-api-order-customerorders';
  const question = 'Which endpoints does this deployment serve under /api/order/customerOrders?';
  const body = 'Order routes: search, get, update, delete customer orders, invoice and payments.';
  const path = `${DERIVED_ENTRIES}/${id}.md`;
  writeFileSync(join(dir, path), `${stringifyFrontmatter({
    id,
    subject,
    plane: 'derived-first',
    question,
    status: 'active',
    refutableBy: 'derivation',
    appliesTo: [{ module: 'VirtoCommerce.Orders', version: '3.1000.4' }],
    anchors: [{ coordinate: 'DELETE /api/order/customerOrders' }],
    evidence: [{ method: 'extraction', deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95' }],
  })}\n\n${body}\n`);
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([{ id, subject, question, text: body, path }]), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FLOW = {
  flow: true,
  subject: 'create a percentage-off promotion and see it apply on the storefront',
  question: 'create a percentage-off promotion in the Admin Marketing module',
  claim: 'Open More, then Marketing, then Promotions, then Add. Create stays disabled until the promotion has a name, an eligibility criterion and a reward.',
  refutableBy: 'observation',
  anchors: ['POST /api/marketing/promotions'],
  appliesTo: ['surface=admin-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-14T00:00:00Z',
};

test('a question the base answers goes to CHECK, carrying what the entry claims to answer', () => {
  const dir = makeBase();
  recordAsk(dir, 'which endpoints does this deployment serve under /api/order/customerOrders', { miss: false });
  const p = plan(dir);
  assert.equal(p.check.length, 1);
  assert.equal(p.check[0].by[0].id, 'KB-D0000020');
  assert.match(p.check[0].by[0].answers, /Which endpoints does this deployment serve/,
    'without this line the reader cannot tell a real answer from one that shares the words');
  assert.match(renderPlan(p), /CHECK/);
  assert.doesNotMatch(renderPlan(p), /no work/, 'the pile must never be presented as free');
  drop(dir);
});

test('a procedural question goes to PROCEDURE, not to the pile that looks done', () => {
  const dir = makeBase();
  capture(dir, FLOW);
  recordAsk(dir, 'create a percentage-off promotion in the Admin Marketing module', { miss: false });
  const p = plan(dir);
  assert.equal(p.procedure.length, 1);
  assert.equal(p.check.length, 0);
  assert.match(renderPlan(p), /kb how/);
  drop(dir);
});

test('a MISS the contract can place goes to SOURCE, with the module at the installed version', () => {
  const dir = makeBase();
  recordAsk(dir, 'which C# service recalculates customer orders after a discount', { miss: true });
  const p = plan(dir);
  assert.equal(p.source.length, 1);
  assert.equal(p.source[0].modules[0].module, 'VirtoCommerce.Orders');
  assert.equal(p.source[0].modules[0].version, '3.1000.4');
  drop(dir);
});

test('a MISS with nothing behind it goes to STAND, and is not dressed up as work', () => {
  const dir = makeBase();
  recordAsk(dir, 'how do I bake sourdough bread', { miss: true });
  const p = plan(dir);
  assert.equal(p.stand.length, 1);
  assert.equal(p.source.length, 0);
  drop(dir);
});

// A demand row closes on the question's WORDING. A capture written with a rephrased question
// leaves the row open forever, and the loop slowly fills with work that was already done.
test('every capture command carries the question verbatim', () => {
  const q = 'why is the shipping cost zero on this store';
  const cmd = captureCommand(q, 'VirtoCommerce.Shipping');
  assert.ok(cmd.includes(JSON.stringify(q)));
  assert.ok(cmd.includes('--source VirtoCommerce.Shipping:'));
});

test('planning writes nothing — it reads the loop it is planning', () => {
  const dir = makeBase();
  recordAsk(dir, 'which endpoints does this deployment serve under /api/order/customerOrders', { miss: false });
  const before = readFileSync(join(dir, 'demand.jsonl'), 'utf8');
  plan(dir);
  plan(dir);
  assert.equal(readFileSync(join(dir, 'demand.jsonl'), 'utf8'), before,
    'a planner that logged a question every time it planned would grow the list it is planning');
  drop(dir);
});

// FOUND BY TRIPPING OVER IT. Pointed at a directory that is not a base, the first version printed
// "the demand loop is empty. Nothing was asked and left unanswered." and exited 0 — the most
// reassuring sentence the tool can produce, for the worst state it can be in. It happened for real:
// exporting MSYS_NO_PATHCONV=1 for a whole shell stops Git Bash converting a Unix-style
// `--base /c/...`, and the loop came back clean while `kb demand` two lines later listed four open
// rows. `ask` has never had this failure because ADR §9.5 makes it separate an absent BASE from an
// absent ANSWER; a planner is where that distinction matters most, because it is read as "there is
// nothing to do".
test('an absent base is reported as degraded, never as an empty loop', () => {
  const p = plan(join(tmpdir(), 'kb-todo-definitely-not-a-base'));
  assert.ok(p.degraded, 'a directory that is not a base must not answer questions about a loop it cannot read');
  assert.equal(p.rows.length, 0);
  const text = renderPlan(p);
  assert.match(text, /degraded/i);
  assert.doesNotMatch(text, /Nothing was asked/, 'the reassuring sentence is the one thing it must not say');
});

test('a real base with nothing open still says the loop is empty', () => {
  const dir = makeBase();
  const p = plan(dir);
  assert.equal(p.degraded, undefined);
  assert.match(renderPlan(p), /Nothing was asked and left unanswered/);
  drop(dir);
});
