// `method: source` — a claim read out of code, and why it is not an observation.
//
// Every one of the 124 evidence rows in the live corpus said `method: observation`, because that
// was the only method the door could write. A corpus whose whole contract is that every claim is
// dated, placed and refutable could not say where a claim read from a C# file came from — so it
// either went in disguised as an observation or did not go in at all, and for two rounds it did not
// go in at all while all three arms of every round read source.
//
// The rule these tests hold: a source reading and an observation do not confirm each other. Source
// says what the code does; an observation says what this deployment did. They can agree while the
// deployment runs a different build, which is not hypothetical — two of round two's three arms read
// `dev` rather than the installed tag.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

import { buildIndex } from '../src/index-build.mjs';
import { stringifyFrontmatter, parseEntry } from '../src/frontmatter.mjs';
import { capture, confirm, evidenceKinds, CaptureRefused, loadEntry } from '../src/capture.mjs';
import { ask } from '../src/resolve.mjs';
import { validate } from '../src/validate.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

// A base whose derived plane records one module as installed, which is where the version comes from.
function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-source-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({
    deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95', platformVersion: '3.1007.26',
  }));
  const id = 'KB-D0000010';
  const subject = 'rest-api-order-customerorders';
  const question = 'Which endpoints does this deployment serve under /api/order/customerOrders?';
  const body = 'Order routes: search, get, update, delete customer orders.';
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

const CLAIM = {
  subject: 'no shipment handler exists in the Orders module',
  question: 'what code cancels an order shipment when the order is cancelled',
  claim: 'Nothing does. CancelPaymentOrderChangedEventHandler collects changedEntry.NewEntry.InPayments only.',
  refutableBy: 'observation',
  anchors: ['DELETE /api/order/customerOrders'],
  appliesTo: ['surface=rest'],
  at: '2026-09-16T00:00:00Z',
};
const SOURCE = 'VirtoCommerce.Orders:src/VirtoCommerce.OrdersModule.Data/Handlers/CancelPaymentOrderChangedEventHandler.cs';

// --- the row ---------------------------------------------------------------------------------------

test('a source-backed capture records the module, the INSTALLED version and the path', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE });
  const { data } = loadEntry(dir, r.id);
  const row = data.evidence[0];
  assert.equal(row.method, 'source');
  assert.equal(row.module, 'VirtoCommerce.Orders');
  assert.equal(row.version, '3.1000.4', 'resolved from the derived plane, never typed by the writer');
  assert.match(row.path, /CancelPaymentOrderChangedEventHandler\.cs$/);
  assert.match(row.url, /vc-module-order\/3\.1000\.4\//, 'the url is the installed tag, not a branch');
  assert.equal(row.deployment, undefined, 'a file at a tag was not read off a deployment');
  drop(dir);
});

test('`--source` replaces `--deployment`, and one of the two is still required', () => {
  const dir = makeBase();
  // Neither: refused, and the refusal names what is missing.
  assert.throws(() => capture(dir, CLAIM), (e) => e instanceof CaptureRefused && /deployment/.test(e.message));
  // Source alone: accepted.
  assert.ok(capture(dir, { ...CLAIM, source: SOURCE }).id);
  drop(dir);
});

test('a module this base does not record as installed is refused, not stamped with a guess', () => {
  const dir = makeBase();
  assert.throws(
    () => capture(dir, { ...CLAIM, source: 'Acme.Invented:src/Thing.cs' }),
    (e) => e instanceof CaptureRefused && /does not record/.test(e.message) && /installed/.test(e.message),
  );
  drop(dir);
});

test('a `--source` without a path is refused with the shape it wanted', () => {
  const dir = makeBase();
  for (const bad of ['VirtoCommerce.Orders', 'VirtoCommerce.Orders:', ':src/Thing.cs']) {
    assert.throws(() => capture(dir, { ...CLAIM, source: bad }), (e) => e instanceof CaptureRefused && /<Module\.Id>:<path/.test(e.message));
  }
  drop(dir);
});

// --- the rule --------------------------------------------------------------------------------------

test('evidenceKinds counts the two kinds apart and never sums them', () => {
  assert.deepEqual(
    evidenceKinds({ evidence: [{ method: 'source' }, { method: 'observation' }, { method: 'observation' }, { method: 'observation', contradicts: true }] }),
    { observation: 2, source: 1, disputes: 1 },
  );
  assert.deepEqual(evidenceKinds({}), { observation: 0, source: 0, disputes: 0 });
});

test('an observation does not confirm a source reading', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE });
  confirm(dir, r.id, { deployment: 'vcptcore_stable', note: 'watched it happen on the stand', at: '2026-09-16T01:00:00Z' });

  const served = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 });
  const trust = served.results[0].trust;
  assert.equal(trust.kinds.source, 1);
  assert.equal(trust.kinds.observation, 1);
  assert.equal(trust.level, 'single-observation',
    'one of each is agreement between two different kinds of evidence, and is not confirmation');
  assert.ok(trust.reasons.some((x) => /NOT counted as confirmation/.test(x)), 'and the served answer says so');
  drop(dir);
});

test('a second reading of the SAME kind does confirm, when it is a second party', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE });
  confirm(dir, r.id, { deployment: 'vcptcore_stable', by: 'agent-one', note: 'observed once', at: '2026-09-16T01:00:00Z' });
  confirm(dir, r.id, { deployment: 'vcptcore_stable', by: 'agent-two', note: 'observed again, separately', at: '2026-09-16T02:00:00Z' });
  const trust = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 }).results[0].trust;
  assert.equal(trust.kinds.observation, 2);
  assert.equal(trust.level, 'confirmed');
  drop(dir);
});

test('provenance names the channel, not a missing deployment stamp', () => {
  const dir = makeBase();
  capture(dir, { ...CLAIM, source: SOURCE });
  const served = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 });
  assert.match(served.results[0].provenance, /read from source @ VirtoCommerce\.Orders:3\.1000\.4/);
  assert.doesNotMatch(served.results[0].provenance, /\?@\?|undefined/, 'a different kind of evidence must not read as a broken stamp');
  drop(dir);
});

// --- the gate --------------------------------------------------------------------------------------

test('the gate refuses a source row that does not say which code', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE });
  const file = join(dir, 'captured', `${r.id}.md`);
  // The line goes entirely, newline included: leaving a blank one is caught earlier, by the
  // frontmatter parser, and would pass this test for the wrong reason.
  const raw = readFileSync(file, 'utf8');
  writeFileSync(file, raw.replace(/^ *path: .*\r?\n/m, ''));
  assert.ok(validate(dir).problems.some((p) => /names no path/.test(p)), validate(dir).problems.join('; '));
  drop(dir);
});

test('the gate flags a source row citing a version this base does not run', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE });
  const file = join(dir, 'captured', `${r.id}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace('version: 3.1000.4', 'version: 3.1009.0'));
  const { data } = parseEntry(readFileSync(file, 'utf8'), 'captured');
  assert.equal(data.evidence[0].version, '3.1009.0');
  assert.ok(
    validate(dir).problems.some((p) => /records 3\.1000\.4 as installed/.test(p)),
    'a hand-edited tag, or one that survived a re-extract, is exactly the drift `dev` caused in round two',
  );
  drop(dir);
});

// --- backing an EXISTING claim with source ----------------------------------------------------------
//
// The common case is not a new entry. Somebody goes and reads the code that decides a claim the
// corpus already holds from observation -- which is exactly what happened to the cancel-cascade
// entry and to the two-endpoints-disagree entry on 2026-09-16. Writing a second entry for it would
// be the duplicate the fingerprint exists to prevent, so the row lands on the entry, and does not
// raise the confirmation count.

test('`confirm --source` records a source row on an existing entry without confirming it', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, deployment: 'vcptcore_stable' });
  const before = loadEntry(dir, r.id).data.evidence.length;

  const out = confirm(dir, r.id, { source: SOURCE, at: '2026-09-16T03:00:00Z' });
  assert.equal(out.kinds.observation, 1);
  assert.equal(out.kinds.source, 1);
  assert.ok(out.source.url, 'the caller is handed the url so it can print what it just recorded');

  const rows = loadEntry(dir, r.id).data.evidence;
  assert.equal(rows.length, before + 1);
  assert.equal(rows.at(-1).method, 'source');
  assert.equal(rows.at(-1).deployment, undefined);

  const trust = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 }).results[0].trust;
  assert.equal(trust.level, 'single-observation', 'reading the code that decides a claim is not a second sighting of it');
  drop(dir);
});

test('`confirm` with neither a deployment nor a source is refused, and says what each one means', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, deployment: 'vcptcore_stable' });
  assert.throws(
    () => confirm(dir, r.id, {}),
    (e) => e instanceof CaptureRefused && /--source/.test(e.message) && /not a confirmation/.test(e.message),
  );
  drop(dir);
});

test('a source row is not a place, and never appears in the list of where something was observed', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, deployment: 'vcptcore_stable' });
  const out = confirm(dir, r.id, { source: SOURCE, at: '2026-09-16T03:00:00Z' });
  assert.deepEqual(out.observedOn.map((o) => o.deployment), ['vcptcore_stable'],
    'before this, the source row grouped under a null deployment and printed as "null — 1 confirming"');
  drop(dir);
});

test('two readings by the same author are one reading twice, and do not confirm', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, source: SOURCE, by: 'one-agent' });
  confirm(dir, r.id, { source: 'VirtoCommerce.Orders:src/VirtoCommerce.OrdersModule.Data/Model/CustomerOrderEntity.cs', by: 'one-agent', at: '2026-09-16T04:00:00Z' });
  const t1 = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 }).results[0].trust;
  assert.equal(t1.kinds.source, 2, 'both rows are recorded');
  assert.equal(t1.level, 'single-observation', 'and neither confirms the other, because one author read both');

  confirm(dir, r.id, { source: 'VirtoCommerce.Orders:src/VirtoCommerce.OrdersModule.Data/Services/CustomerOrderService.cs', by: 'a-different-agent', at: '2026-09-16T05:00:00Z' });
  const t2 = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 }).results[0].trust;
  assert.equal(t2.level, 'confirmed', 'a second author reading the same claim is what confirmation means');
  drop(dir);
});

// AUTHORLESS ROWS KEEP COUNTING AS SEPARATE, so nothing already published is re-graded.
//
// Making them collapse was tried on 2026-09-18 and reverted: the measurement that said it was free
// covered `captured` and `rules` and missed the FLOW plane, where 2 of 3 flows crossed the
// `confirmed` threshold and broke the byte-compared `flows-catalog.md`. The hole that change was
// aimed at — one unidentified actor confirming its own entry — is closed at the WRITING end
// instead, by `writerParty`, which costs no existing grade. See `provenance.test.mjs`.
test('rows written before authorship was recorded keep counting as separate, so nothing is re-graded', () => {
  const dir = makeBase();
  const r = capture(dir, { ...CLAIM, deployment: 'vcptcore_stable' });
  confirm(dir, r.id, { deployment: 'vcptcore_stable', note: 'watched it happen on the stand', at: '2026-09-16T01:00:00Z' });
  // Strip the author the tool now stamps, leaving the shape the legacy corpus actually holds.
  const { abs } = loadEntry(dir, r.id);
  writeFileSync(abs, readFileSync(abs, 'utf8').split(NL).filter((l) => !/^\s+by: /.test(l)).join(NL));
  const t = ask(dir, 'what code cancels an order shipment when the order is cancelled', { limit: 3 }).results[0].trust;
  assert.equal(t.level, 'confirmed', 'the rows in the live corpus that carry no author must not move');
  drop(dir);
});

// FOUND BY LOSING WORK TO IT. `capture` used to create whatever directories it needed, so pointed
// at a path that is not a base it wrote the entry, an index and a catalog into a new tree and
// reported success. On 2026-09-16 exporting MSYS_NO_PATHCONV=1 for a whole shell stopped Git Bash
// converting a Unix-style `--base /c/...`; Node resolved the literal string against the drive root;
// three entries landed in C:\c\_VIRTO\vc-knowledge and were noticed only because a later read of the
// real corpus came up short. A read that goes wrong is visible in its answer. A write that goes
// wrong is silent until somebody goes looking.
test('capture refuses a directory that is not a base rather than creating one', () => {
  const notABase = mkdtempSync(join(tmpdir(), 'kb-not-a-base-'));
  assert.throws(
    () => capture(notABase, { ...CLAIM, deployment: 'vcptcore_stable' }),
    (e) => e instanceof CaptureRefused && /kb\.json/.test(e.message) && /not a knowledge base/.test(e.message),
  );
  assert.equal(existsSync(join(notABase, 'captured')), false, 'and it creates nothing on the way out');
  drop(notABase);
});
