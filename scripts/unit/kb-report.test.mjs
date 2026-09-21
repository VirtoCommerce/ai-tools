// The report (scripts/kb/core/report-*.mjs, scripts/kb/report.mjs) — PLAN §8.
//
// NOT ONE NETWORK CALL IN THIS FILE, and not one write outside a per-test temp directory. The
// analysis is pure by construction, so it is tested against hand-written log lines; the fetch layer
// takes an injected transport for the same reason `http-reader` does — the paths worth guarding are
// the failure paths, and testing those against the real GitHub means testing two of them and hoping
// about the rest.
//
// WHAT IS ACTUALLY UNDER TEST, in order of how expensive it would be to get wrong:
//
//   1. PANEL 6's DEFINITION, against the real instance sitting in the published log. Two asks about
//      price sorting returned five entries, one of which was about orphaned member accounts; the
//      agent then captured a fact anchored on `Query.products`; anchor overlap zero. If this
//      arithmetic drifts, the number that decides PLAN §11's ranking row is wrong and nothing says so.
//   2. THAT AN UNREADABLE BASE NEVER RENDERS AS "no activity". §3.5's confusion relocated into the
//      report is the one output this tool must not produce, and "empty page, exit 0" is exactly
//      what a naive implementation does.
//   3. THAT A MISS AND AN UNREACHABLE ASK ARE NEVER THE SAME ROW. Same reason, one panel down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FAIL, MIN_SAMPLE, NEAR_MISS_REVIEW, NO_DATA, PASS, THRESHOLDS,
  analyse, captureLoop, dayOf, entryUsage, evidence, indexLookup, misses, nearMisses, parseLogFile,
  questionKey, questions, refusals, sessionOf, unhelpful, verdict,
} from '../kb/core/report-analyse.mjs';
import {
  collect, collectFromCache, normalizeSessions, selectLogPaths, windowDays,
} from '../kb/core/report-fetch.mjs';
import { renderHtml, renderText } from '../kb/core/report-render.mjs';
import { main, outputPath } from '../kb/report.mjs';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

/** The index rows the panels resolve ids against — the same shape `index.json` carries. */
const ROWS = [
  { id: 'KB-1834ABE5', subject: 'no Admin surface shows the price a shopper is charged', anchors: ['GET /api/products/{productId}/{catalogId}/pricesWidget'], trust: 1 },
  { id: 'KB-3113CBC1', subject: 'where configurability is stored', anchors: ['POST /api/catalog/products/configurations/search'], trust: 1 },
  { id: 'KB-C440D4E3', subject: 'no product search route under /api/catalog/products', anchors: ['POST /api/catalog/listentries'], trust: 2 },
  { id: 'KB-FA724D31', subject: 'storefront Delete member detaches the contact and orphans the account', anchors: ['Mutations.removeMemberFromOrganization'], trust: 1 },
  { id: 'KB-D9B90536', subject: 'xAPI accepts a malformed products sort argument without an error', anchors: ['Query.products'], trust: 1 },
  { id: 'KB-316B2DDB', subject: 'one invalid storeId answers Unauthorized on Query.product', anchors: ['Query.products', 'Query.product'], trust: 1 },
  { id: 'KB-0C163966', subject: 'never served in the window', anchors: ['Query.cart'], trust: 3 },
];

const line = (o) => ({ at: '2026-09-18T10:00:00.000Z', ...o });

/** The published price-sorting instance, reduced to the two log lines that make it. */
const PRICE_SORT = [
  line({ at: '2026-09-18T16:56:29.399Z', kind: 'ask', q: 'Does product price sorting use the indexed price field?', matched: ['KB-1834ABE5', 'KB-3113CBC1', 'KB-C440D4E3'], opened: ['KB-1834ABE5', 'KB-3113CBC1', 'KB-C440D4E3'], state: 'answer', ms: 2076, _session: 'local_26', _path: 'log/2026-09-18/a-local_26.jsonl' }),
  line({ at: '2026-09-18T16:56:46.113Z', kind: 'ask', q: 'When sorting by price ascending, indexed price or displayed price?', matched: ['KB-1834ABE5', 'KB-FA724D31'], opened: ['KB-1834ABE5', 'KB-FA724D31'], state: 'answer', ms: 2147, _session: 'local_26', _path: 'log/2026-09-18/a-local_26.jsonl' }),
  line({ at: '2026-09-18T17:00:37.019Z', kind: 'capture', id: 'KB-D9B90536', subject: 'xAPI accepts a malformed products sort argument', _session: 'local_26', _path: 'log/2026-09-18/a-local_26.jsonl' }),
];

/**
 * A per-test temp directory, removed after.
 *
 * `await fn(dir)` and not `return fn(dir)`: the second form hands back the promise and runs the
 * `finally` immediately, so the directory is gone before the async body has touched it. It cost a
 * failing assertion here before it cost anything worse.
 */
async function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-report-'));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── parsing ───────────────────────────────────────────────────────────────────────────────────

test('a torn log line costs one line, not the whole report', () => {
  const { lines, malformed } = parseLogFile(
    '{"kind":"ask","q":"a"}\n{"kind":"ask","q":"b"\n{"kind":"show","id":"KB-1"}\n\n',
    { path: 'log/2026-09-18/20260918T101010Z-s1.jsonl' },
  );
  assert.equal(lines.length, 2);
  assert.equal(malformed, 1);
  assert.equal(lines[0]._session, 's1');
});

test('a line without a `kind` is malformed, not a line of an unknown kind', () => {
  const { lines, malformed } = parseLogFile('{"at":"x","q":"no kind"}\n');
  assert.equal(lines.length, 0);
  assert.equal(malformed, 1);
});

test('session and day come off the path, which is where §7 put them', () => {
  assert.equal(sessionOf('log/2026-09-18/20260918T171217Z-local_26.jsonl'), 'local_26');
  assert.equal(dayOf('log/2026-09-18/20260918T171217Z-local_26.jsonl'), '2026-09-18');
  assert.equal(sessionOf('nonsense'), '');
  assert.equal(dayOf('nonsense'), '');
});

test('BOTH session-key shapes parse — nothing published was renamed, so the reader reads both', () => {
  // The key gained its entropy on 2026-09-21 (`local_f3` → `f3d05dd3`, PLAN §21.7 item 3 / STEP 3a).
  // NOTHING WAS MIGRATED: published files keep their names, so for the 30 days of the retention
  // window the report sees both shapes side by side and a parser that understood only one of them
  // would drop a third of the base without saying so. The tolerance is part of the same change as
  // the new key, which is what makes the rollback a plain `git revert`.
  const old = 'log/2026-09-19/20260919T135705Z-local_16.jsonl';   // a real published path
  const now = 'log/2026-09-21/20260921T090000Z-165fd553.jsonl';   // the same session, new key
  assert.equal(sessionOf(old), 'local_16');
  assert.equal(sessionOf(now), '165fd553');
  assert.deepEqual([dayOf(old), dayOf(now)], ['2026-09-19', '2026-09-21']);
  // A host id carrying no marker keeps its dashes, and the stamped shape is anchored on the stamp
  // rather than on the first dash, so a key with dashes of its own comes back whole.
  assert.equal(sessionOf('log/2026-09-21/20260921T090000Z-abcd-ef1.jsonl'), 'abcd-ef1');
});

test('BOTH FILE-NAME shapes parse — the timestamp left the name, the published files did not', () => {
  // The stamp came out of the file name on 2026-09-21 because it published one queue TWICE
  // (PLAN §21.7 item 3 / STEP 3b): two processes, two clocks, two files, the first 13 lines
  // byte-identical. The sequence number they both compute is the same, so they write one path.
  // NOTHING WAS RENAMED, so the 30-day window holds both shapes and the reader owes both an answer.
  assert.equal(sessionOf('log/2026-09-21/f3d05dd3-0003.jsonl'), 'f3d05dd3');
  assert.equal(sessionOf('log/2026-09-21/20260921T081451Z-local_e8.jsonl'), 'local_e8');
  assert.equal(dayOf('log/2026-09-21/f3d05dd3-0003.jsonl'), '2026-09-21');

  // THE ORDER OF THE TWO TESTS IS LOAD-BEARING, and this is the case that proves it: a session key
  // may be all digits, so a STAMPED file whose key is `12345678` also satisfies the sequenced shape
  // and would read back as the stamp — a session id nobody has, silently, for that file only.
  assert.equal(sessionOf('log/2026-09-21/20260921T090000Z-12345678.jsonl'), '12345678');
  // And a sequenced file whose key is all digits still reads as the key.
  assert.equal(sessionOf('log/2026-09-21/12345678-0002.jsonl'), '12345678');
  // A key carrying dashes, sequenced.
  assert.equal(sessionOf('log/2026-09-21/abcd-ef12-0007.jsonl'), 'abcd-ef12');
  // Neither shape: the whole name is the best answer available, which is what it always was.
  assert.equal(sessionOf('log/2026-09-21/handwritten.jsonl'), 'handwritten');
});

test('THE THIRD PATH SHAPE parses, and it is not a third shape in the parser', () => {
  // STEP 3c put a session FOLDER in the path (PLAN §21.11). The file name did not change, and this
  // is the test of that: the parser was not taught the directory and must not need to be. If the
  // path had become `log/<day>/<session>/<seq>.jsonl` — the cleaner-looking shape that was
  // deliberately NOT built — these two assertions would read `0003` and `f3d05dd3` respectively.
  assert.equal(sessionOf('log/2026-09-21/f3d05dd3/f3d05dd3-0003.jsonl'), 'f3d05dd3');
  assert.equal(dayOf('log/2026-09-21/f3d05dd3/f3d05dd3-0003.jsonl'), '2026-09-21');

  // The all-digit key, at depth. Which pattern wins is still decided by the ORDER, not the depth.
  assert.equal(sessionOf('log/2026-09-21/12345678/12345678-0002.jsonl'), '12345678');
  assert.equal(sessionOf('log/2026-09-21/12345678/20260921T090000Z-12345678.jsonl'), '12345678');
  // A key carrying dashes of its own, at depth.
  assert.equal(sessionOf('log/2026-09-21/abcd-ef12/abcd-ef12-0007.jsonl'), 'abcd-ef12');
});

test('ONE SESSION UNDER THREE PATH SHAPES IS ONE SESSION — the acceptance test of STEP 3c', () => {
  // The real risk of adding a path shape is not that a file fails to parse — that is loud. It is
  // that the SAME session splits in two because one of its files was read under a different name,
  // which renders as a clean, confident, wrong page: session counts inflated, per-session panels
  // halved, a repeated question scattered into singletons. Nothing errors.
  //
  // The 30-day retention window after 2026-09-21 genuinely holds all three shapes at once, because
  // nothing was ever migrated: timestamped-flat (before STEP 3b), sequenced-flat (3b), and
  // sequenced-nested (3c). So the fixture is built deliberately rather than left to the live smoke.
  const paths = [
    'log/2026-09-19/20260919T135705Z-f3d05dd3.jsonl',       // timestamped, flat
    'log/2026-09-21/f3d05dd3-0001.jsonl',                   // sequenced, flat
    'log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl',          // sequenced, nested
    'log/2026-09-21/local_e8/local_e8-0001.jsonl',          // a second session, nested
  ];
  const mixed = paths.map((path, i) => line({
    at: `2026-09-2${i}T09:00:00.000Z`,
    kind: 'ask',
    q: 'does price sort use the indexed price field',
    matched: ['KB-1834ABE5'],
    state: 'answer',
    _path: path,
    _session: sessionOf(path),
  }));
  const a = analyse({ lines: mixed, rows: ROWS, meta: { days: 30 } });

  assert.equal(a.sessions, 2, 'three files of one session are ONE session, plus the other one');
  assert.equal(a.panels.questions.asked[0].sessions, 2, 'the repeat count groups across all three shapes');
  assert.deepEqual(
    a.panels.questions.bySession.map((r) => r.session).sort(),
    ['f3d05dd3', 'local_e8'],
    'no shape produces a session under a name nobody has',
  );
});

test('a window holding both key shapes counts two sessions, not one and a dropped file', () => {
  // The fixture is the mixed window itself: the report groups by session, and the 30 days after the
  // change are the only window that ever holds both.
  const mixed = [
    line({ at: '2026-09-19T13:57:05.000Z', kind: 'ask', q: 'does price sort use the indexed field', matched: ['KB-1834ABE5'], state: 'answer', _session: sessionOf('log/2026-09-19/20260919T135705Z-local_16.jsonl'), _path: 'log/2026-09-19/20260919T135705Z-local_16.jsonl' }),
    line({ at: '2026-09-21T09:00:00.000Z', kind: 'ask', q: 'does price sort use the indexed field', matched: ['KB-1834ABE5'], state: 'answer', _session: sessionOf('log/2026-09-21/20260921T090000Z-165fd553.jsonl'), _path: 'log/2026-09-21/20260921T090000Z-165fd553.jsonl' }),
  ];
  const a = analyse({ lines: mixed, rows: ROWS, meta: { days: 30 } });
  assert.equal(a.sessions, 2, 'the old-shape file is a session, not a parse failure');
  // And the repeated question groups across both shapes rather than splitting into two rows.
  assert.equal(a.panels.questions.asked[0].sessions, 2);
  assert.deepEqual(
    a.panels.questions.bySession.map((r) => r.session).sort(),
    ['165fd553', 'local_16'],
    'both shapes reach the per-session panel under their own name',
  );
});

test('the question key drops punctuation and case but KEEPS word order', () => {
  assert.equal(questionKey('Does the Active column reflect the account?'), questionKey('does the active column reflect the account'));
  // Two questions with the same words in a different order are different questions.
  assert.notEqual(questionKey('does admin blocking change storefront'), questionKey('does storefront blocking change admin'));
});

// ── panel 1 — misses ──────────────────────────────────────────────────────────────────────────

test('misses rank by repeat count and NEVER include an unreachable ask', () => {
  const lines = [
    line({ kind: 'ask', q: 'how does X work', state: 'miss', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ kind: 'ask', q: 'How does X work?', state: 'miss', _session: 's2', _path: 'log/2026-09-18/a-s2.jsonl' }),
    line({ kind: 'ask', q: 'what about Y', state: 'miss', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ kind: 'ask', q: 'unreachable one', state: 'unreachable', why: 'ETIMEDOUT', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const m = misses(lines);
  assert.equal(m.ranked.length, 2);
  assert.equal(m.ranked[0].count, 2, 'the repeated question ranks first');
  assert.equal(m.ranked[0].sessions, 2);
  assert.equal(m.unreachable, 1);
  assert.ok(!m.ranked.some((r) => /unreachable one/.test(r.question)),
    'an unreachable ask is not coverage evidence and must never appear as a miss');
});

// ── panel 6 — unhelpful answers ───────────────────────────────────────────────────────────────

test('PANEL 6: the published price-sorting case is flagged unhelpful, both asks', () => {
  const u = unhelpful(PRICE_SORT, indexLookup(ROWS));
  assert.equal(u.decidable, 2);
  assert.equal(u.flagged.length, 2, 'both asks preceded the capture and neither shared an anchor with it');
  assert.equal(u.undecidable, 0);
  assert.equal(u.rate, 1);
  const orphan = u.flagged.find((r) => r.matched.includes('KB-FA724D31'));
  assert.ok(orphan, 'the ask that returned the orphaned-account entry for a price-sorting question');
  assert.deepEqual(orphan.overlap, []);
  assert.deepEqual(orphan.captureAnchors, ['query.products']);
});

test('PANEL 6: an ask that DID cover the capture is helpful, not flagged', () => {
  const lines = [
    line({ at: '2026-09-18T18:25:17.213Z', kind: 'ask', q: 'what does xAPI do with an unknown storeId', matched: ['KB-D9B90536'], state: 'answer', _session: 'kbs4demo', _path: 'log/2026-09-18/a-kbs4demo.jsonl' }),
    line({ at: '2026-09-18T18:25:17.221Z', kind: 'capture', id: 'KB-316B2DDB', subject: 'invalid storeId', _session: 'kbs4demo', _path: 'log/2026-09-18/a-kbs4demo.jsonl' }),
  ];
  const u = unhelpful(lines, indexLookup(ROWS));
  assert.equal(u.flagged.length, 0);
  assert.equal(u.decidable, 1);
  assert.equal(u.rate, 0);
});

test('PANEL 6: a capture BEFORE the ask says nothing about that ask', () => {
  const lines = [
    line({ at: '2026-09-18T12:00:00.000Z', kind: 'capture', id: 'KB-D9B90536', subject: 'x', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T13:00:00.000Z', kind: 'ask', q: 'anything', matched: ['KB-FA724D31'], state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const u = unhelpful(lines, indexLookup(ROWS));
  assert.equal(u.decidable, 0);
  assert.equal(u.rate, null, 'no decidable pair is not a 0% rate — it is no measurement');
});

test('PANEL 6: a capture in ANOTHER session is not evidence about this one', () => {
  const lines = [
    line({ at: '2026-09-18T12:00:00.000Z', kind: 'ask', q: 'anything', matched: ['KB-FA724D31'], state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T13:00:00.000Z', kind: 'capture', id: 'KB-D9B90536', subject: 'x', _session: 's2', _path: 'log/2026-09-18/a-s2.jsonl' }),
  ];
  assert.equal(unhelpful(lines, indexLookup(ROWS)).decidable, 0);
});

test('PANEL 6: an unknown captured entry is UNDECIDABLE, never unhelpful', () => {
  const lines = [
    line({ at: '2026-09-18T12:00:00.000Z', kind: 'ask', q: 'anything', matched: ['KB-FA724D31'], state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T13:00:00.000Z', kind: 'capture', id: 'KB-NOTYET01', subject: 'pushed after the snapshot', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const u = unhelpful(lines, indexLookup(ROWS));
  assert.equal(u.flagged.length, 0);
  assert.equal(u.undecidable, 1);
  assert.equal(u.rate, null, 'counting it either way would make the rate a function of push timing');
});

test('PANEL 6: a MISS followed by a capture is panel 1s business, not this panel s', () => {
  const lines = [
    line({ at: '2026-09-18T12:00:00.000Z', kind: 'ask', q: 'nothing known', matched: [], state: 'miss', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T13:00:00.000Z', kind: 'capture', id: 'KB-D9B90536', subject: 'x', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const u = unhelpful(lines, indexLookup(ROWS));
  assert.equal(u.decidable, 0, 'a miss is honest — it is not an unhelpful answer');
});

test('PANEL 6: anchor comparison is case- and whitespace-insensitive', () => {
  const rows = [
    { id: 'KB-AAAA0001', subject: 'a', anchors: ['  Query.Products '] },
    { id: 'KB-BBBB0002', subject: 'b', anchors: ['query.products'] },
  ];
  const lines = [
    line({ at: '2026-09-18T12:00:00.000Z', kind: 'ask', q: 'q', matched: ['KB-AAAA0001'], state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T13:00:00.000Z', kind: 'capture', id: 'KB-BBBB0002', subject: 'b', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const u = unhelpful(lines, indexLookup(rows));
  assert.equal(u.flagged.length, 0, 'the same anchor spelled differently is the same place');
});

// ── panels 2–5 ────────────────────────────────────────────────────────────────────────────────

test('questions count every ask, answered or not, and carry the outcome breakdown', () => {
  const lines = [
    line({ kind: 'ask', q: 'same thing', matched: ['KB-D9B90536'], state: 'answer', ms: 100, _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ kind: 'ask', q: 'Same thing!', state: 'miss', _session: 's2', _path: 'log/2026-09-18/a-s2.jsonl' }),
  ];
  const q = questions(lines);
  assert.equal(q.totalAsks, 2);
  assert.equal(q.asked.length, 1);
  assert.deepEqual(q.asked[0].states, { answer: 1, miss: 1 });
  assert.equal(q.asked[0].sessions, 2);
  assert.equal(q.bySession.length, 2);
});

test('entry usage separates matched, opened and shown, and lists the never-served', () => {
  const lines = [
    line({ kind: 'ask', q: 'x', matched: ['KB-D9B90536', 'KB-FA724D31'], opened: ['KB-D9B90536'], state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ kind: 'show', id: 'KB-D9B90536', state: 'answer', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const e = entryUsage(lines, indexLookup(ROWS));
  const top = e.used.find((r) => r.id === 'KB-D9B90536');
  assert.deepEqual([top.matched, top.opened, top.shown], [1, 1, 1]);
  assert.equal(e.indexed, ROWS.length);
  assert.ok(e.never.some((r) => r.id === 'KB-0C163966'), 'an entry nobody touched is a candidate, not a verdict');
  assert.ok(!e.never.some((r) => r.id === 'KB-FA724D31'), 'matched counts as served even when it was not opened');
});

test('a contested entry — confirmed AND disputed — sorts to the top', () => {
  const lines = [
    line({ kind: 'confirm', id: 'KB-C440D4E3', deployment: 'vcst_qa', trust: 3, _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ kind: 'confirm', id: 'KB-C440D4E3', deployment: 'vcptcore', trust: 4, _session: 's2', _path: 'log/2026-09-18/a-s2.jsonl' }),
    line({ kind: 'dispute', id: 'KB-C440D4E3', deployment: 'virtostart', saw: 'it returned 200', _session: 's3', _path: 'log/2026-09-18/a-s3.jsonl' }),
    line({ kind: 'confirm', id: 'KB-D9B90536', deployment: 'vcst_qa', trust: 2, _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
  ];
  const e = evidence(lines, indexLookup(ROWS));
  assert.equal(e.rows[0].id, 'KB-C440D4E3');
  assert.equal(e.contested.length, 1);
  assert.equal(e.confirms, 3);
  assert.equal(e.disputes, 1);
  assert.deepEqual(e.rows[0].deployments, ['vcptcore', 'vcst_qa', 'virtostart']);
  assert.deepEqual(e.rows[0].saw, ['it returned 200']);
});

test('refused captures name what was re-discovered, and how often', () => {
  const lines = [
    line({ at: '2026-09-18T10:00:00Z', kind: 'capture-refused', dupeOf: 'KB-D9B90536', subject: 'sort arg ignored', why: 'anchors+scope', when: 'call', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' }),
    line({ at: '2026-09-18T11:00:00Z', kind: 'capture-refused', dupeOf: 'KB-D9B90536', subject: 'sort argument silently accepted', why: 'anchors+scope', when: 'push', _session: 's2', _path: 'log/2026-09-18/a-s2.jsonl' }),
  ];
  const r = refusals(lines, indexLookup(ROWS));
  assert.equal(r.total, 2);
  assert.equal(r.repeatTargets[0].id, 'KB-D9B90536');
  assert.equal(r.repeatTargets[0].count, 2);
  assert.equal(r.rows[0].at, '2026-09-18T11:00:00Z', 'newest first');
});

// ── the window and the bound ──────────────────────────────────────────────────────────────────

test('the window is day folders, inclusive of today', () => {
  const days = windowDays(3, new Date('2026-09-19T04:00:00Z'));
  assert.deepEqual([...days].sort(), ['2026-09-17', '2026-09-18', '2026-09-19']);
});

test('selection takes only log blobs inside the window, prefix-aware', () => {
  const tree = [
    { type: 'blob', path: 'log/2026-09-19/a-s1.jsonl' },
    { type: 'blob', path: 'log/2026-09-01/old-s2.jsonl' },
    { type: 'blob', path: 'log/2026-09-19/README.md' },
    { type: 'tree', path: 'log/2026-09-19' },
    { type: 'blob', path: 'entries/KB-D9B90536.md' },
  ];
  const got = selectLogPaths(tree, { days: 2, at: new Date('2026-09-19T04:00:00Z') });
  assert.deepEqual(got, ['log/2026-09-19/a-s1.jsonl']);
});

test('--sessions selects across both key shapes in one window', () => {
  // The 30 days after 2026-09-21 are a MIXED window: old files keep their `local_XX` names and new
  // ones carry the widened key. A `--sessions` filter that understood one shape would return a
  // clean, confident, half-empty page — the "looks like no activity" failure §8 forbids.
  const tree = [
    { type: 'blob', path: 'log/2026-09-19/20260919T135705Z-local_16.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/20260921T090000Z-165fd553.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/20260921T091500Z-7b2c9e04.jsonl' },
  ];
  assert.deepEqual(
    selectLogPaths(tree, { sessions: 'local_16,165fd553', at: new Date('2026-09-21T12:00:00Z') }),
    ['log/2026-09-19/20260919T135705Z-local_16.jsonl', 'log/2026-09-21/20260921T090000Z-165fd553.jsonl'],
  );
  // And the plain day window takes both shapes too — the key is not part of the day filter at all.
  assert.equal(selectLogPaths(tree, { days: 30, at: new Date('2026-09-21T12:00:00Z') }).length, 3);
});

test('--sessions selects across both FILE-NAME shapes, and a session\'s pushes sort in order', () => {
  // The other mixed window: the stamp left the file name on 2026-09-21 (STEP 3b), so for 30 days
  // a session can own a timestamped file and a sequenced one at the same time. Both are its own.
  const tree = [
    { type: 'blob', path: 'log/2026-09-21/20260921T081451Z-local_e8.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3-0002.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3-0001.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3-0010.jsonl' },
  ];
  assert.deepEqual(
    selectLogPaths(tree, { sessions: 'f3d05dd3', at: new Date('2026-09-21T12:00:00Z') }),
    [
      'log/2026-09-21/f3d05dd3-0001.jsonl',
      'log/2026-09-21/f3d05dd3-0002.jsonl',
      'log/2026-09-21/f3d05dd3-0010.jsonl',
    ],
    'zero-padded, so the tenth push sorts after the second rather than before it',
  );
  assert.deepEqual(
    selectLogPaths(tree, { sessions: 'local_e8', at: new Date('2026-09-21T12:00:00Z') }),
    ['log/2026-09-21/20260921T081451Z-local_e8.jsonl'],
  );
  assert.equal(selectLogPaths(tree, { days: 30, at: new Date('2026-09-21T12:00:00Z') }).length, 4);
});

test('selection is DEPTH-AGNOSTIC — the tree walk was not changed and must not need to be', () => {
  // STEP 3c asked whether `selectLogPaths` had to learn about the session folder. It did not: it
  // filters on the `log/` prefix and the `.jsonl` suffix and never counts segments, so a file one
  // level deeper is taken by the same two predicates. That is a claim about code nobody touched,
  // which is exactly the claim most likely to stop being true later, so it is pinned here.
  const tree = [
    { type: 'blob', path: 'log/2026-09-19/20260919T135705Z-f3d05dd3.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3-0001.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl' },
    { type: 'blob', path: 'log/2026-09-21/local_e8/local_e8-0001.jsonl' },
    { type: 'tree', path: 'log/2026-09-21/f3d05dd3' },       // the folder itself is not a log file
    { type: 'blob', path: 'log/2026-09-21/f3d05dd3/README.md' },
  ];
  const at = new Date('2026-09-21T12:00:00Z');

  // The day window takes all four blobs and neither the tree node nor the non-jsonl file.
  assert.deepEqual(selectLogPaths(tree, { days: 30, at }), [
    'log/2026-09-19/20260919T135705Z-f3d05dd3.jsonl',
    'log/2026-09-21/f3d05dd3-0001.jsonl',
    'log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl',
    'log/2026-09-21/local_e8/local_e8-0001.jsonl',
  ]);

  // And `--sessions` reaches a nested file under the same name as a flat one: three shapes, one
  // session, one selection. The counterpart of the analyse-side acceptance test above — a session
  // that cannot be SELECTED is just as invisible as one that splits.
  assert.deepEqual(selectLogPaths(tree, { sessions: 'f3d05dd3', at }), [
    'log/2026-09-19/20260919T135705Z-f3d05dd3.jsonl',
    'log/2026-09-21/f3d05dd3-0001.jsonl',
    'log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl',
  ]);

  // A prefixed base (`v2/`) nests one level further still, and the relative path is what is parsed.
  const prefixed = [{ type: 'blob', path: 'v2/log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl' }];
  assert.deepEqual(selectLogPaths(prefixed, { days: 30, at, prefix: 'v2', sessions: 'f3d05dd3' }),
    ['v2/log/2026-09-21/f3d05dd3/f3d05dd3-0002.jsonl']);
});

test('above the file bound it REFUSES and names the flag, rather than hanging or truncating', async () => {
  const tree = Array.from({ length: 5 }, (_, i) => ({ type: 'blob', path: `log/2026-09-19/f${i}-s${i}.jsonl` }));
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ tree, truncated: false }) });
  const got = await withTmp((dir) => collect({
    base: 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main',
    days: 1, at: new Date('2026-09-19T04:00:00Z'), fetchImpl, cacheDir: dir, maxFiles: 3,
  }));
  assert.equal(got.ok, false);
  assert.equal(got.refused, true);
  assert.match(got.meta.why, /5 log files.*exceeds the 3-file bound.*--days/s);
});

test('a base that is not enumerable refuses rather than reporting zero activity', async () => {
  const got = await collect({ base: 'C:/some/local/fixture', days: 30 });
  assert.equal(got.refused, true);
  assert.match(got.meta.why, /cannot be enumerated/);
});

// ── the unreachable path — the one thing the report must not get wrong ─────────────────────────

test('an unreachable base renders FROM CACHE, behind a banner, never as an empty report', async () => {
  await withTmp(async (dir) => {
    const base = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main';
    const tree = [{ type: 'blob', path: 'log/2026-09-19/a-local_26.jsonl' }];
    const log = PRICE_SORT.map(({ _session, _path, ...l }) => JSON.stringify(l)).join('\n');
    const index = JSON.stringify({ entries: ROWS });

    // First, a live run that populates the cache.
    const live = async (url) => ({
      ok: true, status: 200,
      text: async () => (url.includes('/git/trees/') ? JSON.stringify({ tree, truncated: false })
        : url.endsWith('index.json') ? index : log),
    });
    const first = await collect({ base, days: 1, at: new Date('2026-09-19T04:00:00Z'), fetchImpl: live, cacheDir: dir });
    assert.equal(first.ok, true);
    assert.equal(first.meta.fromCache, false);
    assert.equal(first.lines.length, 3);

    // Then the base goes away.
    const dead = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
    const second = await collect({ base, days: 1, at: new Date('2026-09-19T04:00:00Z'), fetchImpl: dead, cacheDir: dir });
    assert.equal(second.ok, true, 'it renders anyway');
    assert.equal(second.meta.fromCache, true);
    assert.equal(second.meta.cacheEmpty, false);
    assert.match(second.meta.failure, /ENOTFOUND/);
    assert.equal(second.lines.length, 3, 'the cached log lines are still analysed');

    const html = renderHtml(analyse({ lines: second.lines, rows: second.rows, meta: second.meta }));
    assert.match(html, /rendered from cache/i);
    assert.match(html, /Newest cached record/);
    assert.match(html, /ENOTFOUND/);
    // And the panels are still populated — a banner over an empty page would be the same lie.
    assert.match(html, /KB-D9B90536/);
  });
});

test('unreachable AND an empty cache says so in the words that cannot be misread', async () => {
  await withTmp(async (dir) => {
    const dead = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } }); };
    const got = await collect({
      base: 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main',
      days: 1, fetchImpl: dead, cacheDir: dir,
    });
    assert.equal(got.meta.cacheEmpty, true);
    const html = renderHtml(analyse({ lines: got.lines, rows: got.rows, meta: got.meta }));
    assert.match(html, /could not be read, and the cache is empty/i);
    assert.match(html, /not.*"no activity"/is);
    assert.doesNotMatch(html, /No misses in this window\. Either coverage is good/,
      'the "coverage is good" reading must not be offered when nothing was read');
  });
});

test('collectFromCache with an empty directory is cacheEmpty, not an error', async () => {
  await withTmp(async (dir) => {
    const got = await collectFromCache({ base: 'https://raw.githubusercontent.com/o/r/main', days: 30, cacheDir: dir, detail: '--no-network' });
    assert.equal(got.meta.cacheEmpty, true);
    assert.equal(got.lines.length, 0);
  });
});

// ── rendering ─────────────────────────────────────────────────────────────────────────────────

test('the HTML is self-contained: no script, no external stylesheet, no network at render time', () => {
  const html = renderHtml(analyse({ lines: PRICE_SORT, rows: ROWS, meta: { base: 'b', days: 30, files: 1, at: '2026-09-19T04:00:00Z' } }));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(css|js)/i);
  assert.match(html, /^<!doctype html>/i);
});

test('rendering escapes a question rather than letting it become markup', () => {
  const lines = [line({ kind: 'ask', q: '<img src=x onerror="alert(1)">', state: 'miss', _session: 's1', _path: 'log/2026-09-18/a-s1.jsonl' })];
  const html = renderHtml(analyse({ lines, rows: ROWS, meta: { base: 'b', days: 30, at: '2026-09-19T04:00:00Z' } }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('an empty panel says WHY it is empty — "no rows" and "nothing happened" are different facts', () => {
  const html = renderHtml(analyse({ lines: [], rows: ROWS, meta: { base: 'b', days: 30, files: 0, at: '2026-09-19T04:00:00Z' } }));
  assert.match(html, /No misses in this window/);
  assert.match(html, /that is not a 0% rate — it is no measurement/i);
  assert.match(html, /Not &quot;everything holds&quot; — nobody checked/);
});

test('the text summary reports the unhelpful rate and the undecidable count separately', () => {
  const report = analyse({ lines: PRICE_SORT, rows: ROWS, meta: { base: 'b', days: 30, files: 1, at: '2026-09-19T04:00:00Z' } });
  const text = renderText(report);
  assert.match(text, /unhelpful\s+2\/2 decidable = 100%/);
  assert.match(text, /\(0 undecidable\)/);
});

test('the index failing to load is SAID, not silently an empty index', () => {
  const html = renderHtml(analyse({ lines: PRICE_SORT, rows: [], meta: { base: 'b', days: 30, indexLoaded: false, at: '2026-09-19T04:00:00Z' } }));
  assert.match(html, /index\.json did not load/);
});

// ── the CLI ───────────────────────────────────────────────────────────────────────────────────

test('the HTML lands outside the repository tree by default', () => {
  const p = outputPath({}, { CLAUDE_SCRATCHPAD_DIR: join(tmpdir(), 'scratch') }, new Date('2026-09-19T04:52:10Z'));
  assert.match(p, /kb-report-20260919T045210Z\.html$/);
  assert.ok(!p.includes('vc-mcp-testing-module'), 'never the working tree — git status cleanliness is load-bearing');
});

test('--no-network with an empty cache exits 3, and 3 is not 1', async () => {
  await withTmp(async (dir) => {
    const code = await main(['--no-network', '--json'], { KB_REPORT_CACHE_DIR: dir }, { write: () => {} });
    assert.equal(code, 3, 'nothing read and no cache is not the same as a stale report');
  });
});

test('a base the report cannot enumerate exits 2', async () => {
  await withTmp(async (dir) => {
    const code = await main(['--base', 'C:/fixture/dir', '--json'], { KB_REPORT_CACHE_DIR: dir }, { write: () => {}, writeErr: () => {} });
    assert.equal(code, 2);
  });
});

test('--help exits 0 and names the four exit codes', async () => {
  const written = [];
  // NOT a process.stdout stub: that would also swallow this runner's own TAP output, which is how
  // three tests in this file once passed while the file exited 1.
  assert.equal(await main(['--help'], {}, { write: (s) => written.push(String(s)) }), 0);
  const usage = written.join('');
  assert.match(usage, /0 rendered from the live base/);
  assert.match(usage, /1 rendered FROM CACHE/);
  assert.match(usage, /2 refused/);
  assert.match(usage, /3 nothing read and no cache/);
});

test('--json writes no HTML file anywhere', async () => {
  await withTmp(async (dir) => {
    await main(['--no-network', '--json'], { KB_REPORT_CACHE_DIR: dir }, { write: () => {} });
    // The cache dir is the only place this run may touch, and --json must not have written HTML.
    const { readdirSync } = await import('node:fs');
    assert.ok(!readdirSync(dir).some((n) => n.endsWith('.html')));
  });
});

test('the written HTML is the same string renderHtml produced — no post-processing', async () => {
  await withTmp(async (dir) => {
    const out = join(dir, 'r.html');
    await main(['--no-network', '--out', out], { KB_REPORT_CACHE_DIR: dir }, { write: () => {} });
    const html = readFileSync(out, 'utf8');
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /the cache is empty/i);
  });
});


// ── the near-miss panel — the field session 6 added and nothing read (PLAN §15.2) ──────────────
//
// WHY THESE ARE HERE AT ALL. `nearMiss` went into a public, append-only log for one stated purpose
// — "is the floor too high, visible immediately, without another replay" — and no reader existed,
// so the field could have been written wrong for a month with nothing to notice. The tests below
// are on the DERIVATION (the sort, the band, the repeat roll-up, the rejected-by inference), never
// on the constants: `NEAR_MISS_REVIEW` is one import away and a test restating 0.45 would be a
// transcribed constant with a test runner attached.

const IDX = indexLookup(ROWS);

const missLine = (o) => line({ kind: 'ask', state: 'miss', matched: [], ...o });

test('near misses sort by coverage descending — the top of the list is the floor\'s error bar', () => {
  const p = nearMisses([
    missLine({ at: '2026-09-19T01:00:00Z', q: 'a b c', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.2 }, _session: 's1' }),
    missLine({ at: '2026-09-19T02:00:00Z', q: 'd e f', nearMiss: { id: 'KB-FA724D31', score: 4, coverage: 0.45 }, _session: 's1' }),
    missLine({ at: '2026-09-19T03:00:00Z', q: 'g h i', nearMiss: { id: 'KB-1834ABE5', score: 1, coverage: 0.11 }, _session: 's1' }),
  ], IDX);
  assert.deepEqual(p.rows.map((r) => r.coverage), [0.45, 0.2, 0.11]);
  assert.equal(p.rows[0].subject, 'storefront Delete member detaches the contact and orphans the account');
});

test('a near miss AT the review line is in the band — the boundary is inclusive, because 0.45 IS the measured row', () => {
  const at = nearMisses([missLine({ q: 'x', nearMiss: { id: 'KB-C440D4E3', score: 5, coverage: NEAR_MISS_REVIEW }, _session: 's' })], IDX);
  const under = nearMisses([missLine({ q: 'x', nearMiss: { id: 'KB-C440D4E3', score: 5, coverage: NEAR_MISS_REVIEW - 0.01 }, _session: 's' })], IDX);
  assert.equal(at.inBand.length, 1, '0.45 is the nearest surviving bad hit from §14.4 — it must be read, not excluded');
  assert.equal(under.inBand.length, 0);
});

test('a miss that scored NOTHING is counted apart from one that nearly made it', () => {
  const p = nearMisses([
    missLine({ q: 'nothing scored', _session: 's' }),
    missLine({ q: 'something scored', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.3 }, _session: 's' }),
  ], IDX);
  assert.equal(p.missTotal, 2);
  assert.equal(p.rows.length, 1);
  assert.equal(p.withoutNearMiss, 1, 'the base being nowhere near the subject is not a floor problem');
});

test('a candidate that near-misses on several different questions is rolled up as a repeat', () => {
  const p = nearMisses([
    missLine({ q: 'the active column on company members', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.2 }, _session: 's1' }),
    missLine({ q: 'what does the members list show', nearMiss: { id: 'KB-C440D4E3', score: 3, coverage: 0.33 }, _session: 's2' }),
    missLine({ q: 'unrelated question here', nearMiss: { id: 'KB-FA724D31', score: 1, coverage: 0.1 }, _session: 's2' }),
  ], IDX);
  assert.equal(p.repeats.length, 1, 'only the repeated candidate rolls up');
  assert.equal(p.repeats[0].id, 'KB-C440D4E3');
  assert.equal(p.repeats[0].count, 2);
  assert.equal(p.repeats[0].distinctQuestions, 2, 'two DIFFERENT questions — the entry is phrased unlike the way people ask');
  assert.equal(p.repeats[0].best, 0.33);
});

test('a candidate whose coverage already cleared the floor was stopped by the WORD count, and says so', () => {
  const p = nearMisses([
    missLine({ q: 'cart', nearMiss: { id: 'KB-C440D4E3', score: 1, coverage: 1 }, _session: 's' }),
    missLine({ q: 'a b c d', nearMiss: { id: 'KB-FA724D31', score: 1, coverage: 0.25 }, _session: 's' }),
  ], IDX);
  const byId = Object.fromEntries(p.rows.map((r) => [r.id, r.rejectedBy]));
  assert.equal(byId['KB-C440D4E3'], 'words', 'coverage 1.00 and still rejected can only be MIN_WORDS');
  assert.equal(byId['KB-FA724D31'], 'coverage');
  assert.equal(p.floor, THRESHOLDS.floorCoverage, 'the floor is READ from the ranker, never transcribed');
});

// ── does the loop close? `capture` → the ask it followed ───────────────────────────────────────

test('a capture linked by `after` to a miss is the loop closing; to an answer it is not', () => {
  const l = captureLoop([
    line({ at: '2026-09-19T01:00:00Z', kind: 'ask', state: 'miss', q: 'unanswered', _session: 's' }),
    line({ at: '2026-09-19T01:05:00Z', kind: 'ask', state: 'answer', q: 'answered', matched: ['KB-C440D4E3'], _session: 's' }),
    line({ at: '2026-09-19T01:10:00Z', kind: 'capture', id: 'KB-D9B90536', subject: 'x', after: '2026-09-19T01:00:00Z', _session: 's' }),
    line({ at: '2026-09-19T01:11:00Z', kind: 'capture', id: 'KB-316B2DDB', subject: 'y', after: '2026-09-19T01:05:00Z', _session: 's' }),
  ]);
  assert.equal(l.afterMiss, 1);
  assert.equal(l.afterAnswer, 1);
  assert.equal(l.unlinked, 0);
});

test('`after` does not cross sessions — the pointer is into the session\'s OWN file', () => {
  const l = captureLoop([
    line({ at: '2026-09-19T01:00:00Z', kind: 'ask', state: 'miss', q: 'unanswered', _session: 'other' }),
    line({ at: '2026-09-19T01:10:00Z', kind: 'capture', id: 'KB-D9B90536', after: '2026-09-19T01:00:00Z', _session: 'mine' }),
  ]);
  assert.equal(l.afterMiss, 0);
  assert.equal(l.dangling, 1, 'same timestamp, different session — not a link');
});

test('a capture written before the `after` field existed is UNLINKED, not a failed loop', () => {
  const l = captureLoop([
    line({ at: '2026-09-19T01:00:00Z', kind: 'ask', state: 'miss', q: 'unanswered', _session: 's' }),
    line({ at: '2026-09-19T01:10:00Z', kind: 'capture', id: 'KB-D9B90536', _session: 's' }),
  ]);
  assert.equal(l.afterMiss, 0);
  assert.equal(l.unlinked, 1, 'no evidence the loop closed — and none that it did not');
});

test('a REFUSED capture after a miss is counted apart from a real one', () => {
  const l = captureLoop([
    line({ at: '2026-09-19T01:00:00Z', kind: 'ask', state: 'miss', q: 'unanswered', _session: 's' }),
    line({ at: '2026-09-19T01:10:00Z', kind: 'capture-refused', dupeOf: 'KB-C440D4E3', after: '2026-09-19T01:00:00Z', _session: 's' }),
  ]);
  assert.equal(l.refusedAfterMiss, 1);
  assert.equal(l.afterMiss, 0, 'the agent acted, but nothing was written — a gate must not pass on it');
});

test('a `capture` line logged with a state and no id is a failure to reach the base, not a write', () => {
  const l = captureLoop([
    line({ at: '2026-09-19T01:00:00Z', kind: 'ask', state: 'miss', q: 'q', _session: 's' }),
    line({ at: '2026-09-19T01:10:00Z', kind: 'capture', subject: 'x', state: 'unreachable', after: '2026-09-19T01:00:00Z', _session: 's' }),
  ]);
  assert.equal(l.afterMiss, 0);
  assert.equal(l.captures, 0);
});

// ── the §15 verdict block ──────────────────────────────────────────────────────────────────────
//
// THE ONE PROPERTY WORTH MORE THAN THE REST: `NOT ENOUGH DATA` must never be reachable by the same
// path as `PASS`. §14.1's mistake was a comfortable number with nothing behind it — 0 misses in 39
// asks reading as perfect coverage — and §15 exists because of it.

const emptyUnhelpful = { flagged: [], decidable: 0, undecidable: 0, rate: null };
const emptyNear = { rows: [], repeats: [], inBand: [], missTotal: 0, withoutNearMiss: 0 };
const emptyLoop = { rows: [], afterMiss: 0, afterAnswer: 0, unlinked: 0, dangling: 0, refusedAfterMiss: 0, captures: 0 };
const row = (v, key) => v.rows.find((r) => r.key === key);

test('a 0% unhelpful rate over two asks is NOT ENOUGH DATA, not a pass', () => {
  const v = verdict({
    unhelpful: { flagged: [], decidable: 2, undecidable: 0, rate: 0 },
    nearMisses: emptyNear,
    loop: emptyLoop,
  });
  const r = row(v, 'unhelpful');
  assert.equal(r.state, NO_DATA);
  assert.notEqual(r.state, PASS);
  assert.equal(r.n, 2, 'the n is stated beside the rate, always');
  assert.match(r.detail, /below the declared minimum/);
});

test('the same 0% over MIN_SAMPLE asks is a pass — the only thing that changed is n', () => {
  const v = verdict({
    unhelpful: { flagged: [], decidable: MIN_SAMPLE, undecidable: 0, rate: 0 },
    nearMisses: emptyNear,
    loop: emptyLoop,
  });
  assert.equal(row(v, 'unhelpful').state, PASS);
});

test('a rate over the trigger with enough behind it FAILs', () => {
  const v = verdict({
    unhelpful: { flagged: new Array(8).fill(0), decidable: 20, undecidable: 0, rate: 0.4 },
    nearMisses: emptyNear,
    loop: emptyLoop,
  });
  const r = row(v, 'unhelpful');
  assert.equal(r.state, FAIL);
  assert.match(r.detail, /40\.0%/);
});

test('the same 66.7% on n=3 — the live base\'s own number — is NOT ENOUGH DATA', () => {
  // PLAN §14.1 said this in prose about this exact figure: "panel 6's 66.7% sits on n=3 ... too
  // thin". The verdict block has to agree with the plan's own reading of its own data.
  const v = verdict({
    unhelpful: { flagged: [0, 0], decidable: 3, undecidable: 0, rate: 2 / 3 },
    nearMisses: emptyNear,
    loop: emptyLoop,
  });
  assert.equal(row(v, 'unhelpful').state, NO_DATA);
});

test('an in-band near miss is FLAGGED for a human, never FAILed — the script does not judge answerability', () => {
  const nm = nearMisses([
    missLine({ q: 'a b c d', nearMiss: { id: 'KB-C440D4E3', score: 5, coverage: 0.46 }, _session: 's' }),
  ], IDX);
  const v = verdict({ unhelpful: emptyUnhelpful, nearMisses: nm, loop: emptyLoop });
  const r = row(v, 'near-miss');
  assert.equal(r.state, NO_DATA, 'PASS would be wrong and FAIL would be a judgement it cannot make');
  assert.notEqual(r.state, FAIL);
  assert.equal(r.needsReading, 1);
  assert.match(r.detail, /a human must read them/);
});

test('two in-band rows quote §15.3\'s escalation; one does not', () => {
  const one = verdict({
    unhelpful: emptyUnhelpful,
    nearMisses: nearMisses([missLine({ q: 'a b', nearMiss: { id: 'KB-C440D4E3', score: 5, coverage: 0.46 }, _session: 's' })], IDX),
    loop: emptyLoop,
  });
  const two = verdict({
    unhelpful: emptyUnhelpful,
    nearMisses: nearMisses([
      missLine({ q: 'a b', nearMiss: { id: 'KB-C440D4E3', score: 5, coverage: 0.46 }, _session: 's' }),
      missLine({ q: 'c d', nearMiss: { id: 'KB-FA724D31', score: 5, coverage: 0.48 }, _session: 's' }),
    ], IDX),
    loop: emptyLoop,
  });
  assert.ok(!/one is a signal/.test(row(one, 'near-miss').detail));
  assert.match(row(two, 'near-miss').detail, /one is a signal, two mean the floor is too high/);
});

test('no misses at all is NOT ENOUGH DATA on the near-miss row — an absence over nothing proves nothing', () => {
  const v = verdict({ unhelpful: emptyUnhelpful, nearMisses: emptyNear, loop: emptyLoop });
  assert.equal(row(v, 'near-miss').state, NO_DATA);
});

test('ONE capture after a miss passes, whatever n is — a presence needs no minimum', () => {
  const v = verdict({
    unhelpful: emptyUnhelpful,
    nearMisses: { ...emptyNear, missTotal: 1 },
    loop: { ...emptyLoop, afterMiss: 1 },
  });
  const r = row(v, 'capture-after-miss');
  assert.equal(r.state, PASS);
  assert.match(r.detail, /exit 1 produced knowledge/);
});

test('no capture after many misses FAILs; after few it is NOT ENOUGH DATA', () => {
  const many = verdict({ unhelpful: emptyUnhelpful, nearMisses: { ...emptyNear, missTotal: MIN_SAMPLE }, loop: emptyLoop });
  const few = verdict({ unhelpful: emptyUnhelpful, nearMisses: { ...emptyNear, missTotal: 3 }, loop: emptyLoop });
  assert.equal(row(many, 'capture-after-miss').state, FAIL);
  assert.match(row(many, 'capture-after-miss').detail, /the message is wrong, not the floor/);
  assert.equal(row(few, 'capture-after-miss').state, NO_DATA);
});

test('the three thresholds are declared in the module, not passed in', () => {
  const v = verdict({ unhelpful: emptyUnhelpful, nearMisses: emptyNear, loop: emptyLoop });
  assert.equal(v.rows.length, 3);
  assert.equal(v.thresholds.unhelpfulRate, 0.15, "PLAN §11's trigger, reused rather than re-invented");
  assert.equal(v.thresholds.nearMissReview, NEAR_MISS_REVIEW);
  assert.equal(v.thresholds.capturesAfterMiss, 1);
  // The signature takes panels, never thresholds: a threshold that can be supplied is a threshold
  // that can be moved after seeing the result, which is what PLAN §15.3 forbids.
  assert.ok(!/threshold/i.test(verdict.toString().split('\n')[0]));
});

test('analyse() wires the verdict off the SAME panels it renders — one derivation, no second copy', () => {
  const r = analyse({
    lines: [
      missLine({ at: '2026-09-19T01:00:00Z', q: 'a b c d', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.5 }, _session: 's', _path: 'log/2026-09-19/a-s.jsonl' }),
      line({ at: '2026-09-19T01:10:00Z', kind: 'capture', id: 'KB-D9B90536', subject: 'x', after: '2026-09-19T01:00:00Z', _session: 's', _path: 'log/2026-09-19/a-s.jsonl' }),
    ],
    rows: ROWS,
    meta: { days: 30 },
  });
  assert.equal(r.panels.nearMisses.rows.length, 1);
  assert.equal(r.panels.loop.afterMiss, 1);
  assert.equal(row(r.verdict, 'capture-after-miss').state, PASS);
  assert.equal(row(r.verdict, 'near-miss').n, r.panels.nearMisses.rows.length);
});

test('a synthetic miss never reaches the near-miss panel or the verdict', () => {
  const r = analyse({
    lines: [missLine({ q: 'benchmark question', nearMiss: { id: 'KB-C440D4E3', score: 9, coverage: 0.49 }, synthetic: true, _session: 's', _path: 'log/2026-09-19/a-s.jsonl' })],
    rows: ROWS,
    meta: { days: 30 },
  });
  assert.equal(r.panels.nearMisses.rows.length, 0, 'a stopwatch is not demand, in this panel too');
  assert.equal(row(r.verdict, 'near-miss').n, 0);
});

// ── session scoping — PLAN §15.2's "a wave is not a time window" ───────────────────────────────

const treeBlob = (path) => ({ type: 'blob', path });

test('--sessions selects across the WHOLE tree, ignoring the day window', () => {
  const tree = [
    treeBlob('log/2026-01-01/20260101T000000Z-wave1.jsonl'),
    treeBlob('log/2026-09-19/20260919T000000Z-other.jsonl'),
    treeBlob('log/2026-09-19/20260919T010000Z-wave2.jsonl'),
  ];
  const at = new Date('2026-09-19T12:00:00Z');
  assert.deepEqual(
    selectLogPaths(tree, { days: 1, at, sessions: 'wave1,wave2' }),
    ['log/2026-01-01/20260101T000000Z-wave1.jsonl', 'log/2026-09-19/20260919T010000Z-wave2.jsonl'],
    'a January file is inside the named set and outside every window a reader would pass',
  );
});

test('without --sessions the day window is untouched — the default does not change', () => {
  const tree = [
    treeBlob('log/2026-01-01/20260101T000000Z-wave1.jsonl'),
    treeBlob('log/2026-09-19/20260919T000000Z-other.jsonl'),
  ];
  assert.deepEqual(
    selectLogPaths(tree, { days: 1, at: new Date('2026-09-19T12:00:00Z') }),
    ['log/2026-09-19/20260919T000000Z-other.jsonl'],
  );
});

test('one session that pushed TWICE matches both of its files', () => {
  const tree = [
    treeBlob('log/2026-09-18/20260918T100000Z-s1.jsonl'),
    treeBlob('log/2026-09-19/20260919T100000Z-s1.jsonl'),
  ];
  assert.equal(selectLogPaths(tree, { days: 1, at: new Date('2026-09-19T12:00:00Z'), sessions: ['s1'] }).length, 2);
});

test('normalizeSessions is IDEMPOTENT — a Set through the string branch matched nothing at all', () => {
  // Measured, on two real session ids: `collect` normalised once and handed the Set to
  // `selectLogPaths`, which normalised again; `String(new Set([...]))` is "[object Set]", so the
  // filter matched zero files and the report rendered a clean, confident, entirely empty page.
  // That is the "looks like no activity" failure PLAN §8 forbids, reached through a flag.
  const once = normalizeSessions('a,b');
  assert.deepEqual([...normalizeSessions(once)], ['a', 'b']);
  assert.deepEqual([...normalizeSessions(['a', ' b '])], ['a', 'b']);
  assert.equal(normalizeSessions(''), null, 'an absent flag is not "no sessions"');
  assert.equal(normalizeSessions(null), null);
});

// ── the rendered page ──────────────────────────────────────────────────────────────────────────

const renderOf = (lines) => renderHtml(analyse({ lines, rows: ROWS, meta: { days: 30, base: 'b', at: '2026-09-19T00:00:00Z' } }));

test('the verdict block renders NOT ENOUGH DATA in its own style, never the pass style', () => {
  const html = renderOf([missLine({ q: 'a b c d', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.2 }, _session: 's', _path: 'log/2026-09-19/a-s.jsonl' })]);
  assert.match(html, /id="verdict"/);
  assert.match(html, /class="verdict nodata">NOT ENOUGH DATA/);
  assert.ok(!/class="verdict ok"/.test(html), 'nothing here earned a pass');
  assert.match(html, /NOT ENOUGH DATA is a real verdict, not a soft pass/);
});

test('the near-miss panel renders the candidate, its coverage and its id', () => {
  const html = renderOf([missLine({ q: 'does the storefront pack size rule reject a cart quantity', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.2 }, _session: 's', _path: 'log/2026-09-19/a-s.jsonl' })]);
  assert.match(html, /id="near-misses"/);
  assert.match(html, /KB-C440D4E3/);
  assert.match(html, /0\.20/);
  assert.match(html, /no product search route under \/api\/catalog\/products/);
});

test('an empty near-miss panel says WHY, and never "nothing was read" when something was', () => {
  const html = renderOf([line({ kind: 'ask', state: 'answer', q: 'x', matched: ['KB-C440D4E3'], _session: 's', _path: 'log/2026-09-19/a-s.jsonl' })]);
  assert.match(html, /No miss in this window carried a rejected candidate/);
});

test('the terminal summary prints all three verdict rows with their n', () => {
  const text = renderText(analyse({
    lines: [missLine({ q: 'a b c d', nearMiss: { id: 'KB-C440D4E3', score: 2, coverage: 0.2 }, _session: 's', _path: 'log/2026-09-19/a-s.jsonl' })],
    rows: ROWS,
    meta: { days: 30 },
  }));
  assert.match(text, /§15 acceptance/);
  assert.equal((text.match(/NOT ENOUGH DATA/g) ?? []).length, 3);
  assert.match(text, /\[n=1\]/);
  assert.match(text, /near misses/);
});

test('a session-scoped summary never claims a day window it did not use', () => {
  const text = renderText(analyse({
    lines: [],
    rows: ROWS,
    meta: { days: 30, sessions: ['wave1', 'wave2'], files: 2 },
  }));
  assert.match(text, /2 named session\(s\): wave1, wave2/);
  assert.ok(!/last 30 days/.test(text), 'a figure headed by the wrong scope is a figure nobody can reproduce');
});
