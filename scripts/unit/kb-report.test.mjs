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
  analyse, dayOf, entryUsage, evidence, indexLookup, misses, parseLogFile,
  questionKey, questions, refusals, sessionOf, unhelpful,
} from '../kb/core/report-analyse.mjs';
import { collect, collectFromCache, selectLogPaths, windowDays } from '../kb/core/report-fetch.mjs';
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
