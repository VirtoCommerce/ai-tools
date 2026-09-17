// The normative plane: what MUST hold, as opposed to what somebody saw.
//
// It exists because 216 `BL-*` invariants, 55 `VC-*` patterns and an edge-case library are leaving
// `plugins/vc-fix/knowledge/` and have to land somewhere that can hold them honestly. Everything
// these tests hold in place is a consequence of one difference between a rule and a fact:
//
//   a fact is an OBSERVATION. It is identified by where it was seen and who it holds for, its
//   evidence is a sighting, and it answers a question.
//   a rule is a CONSTRAINT. It is identified by the id its author gave it, its first evidence row
//   is a transcription and not a sighting, and it answers no question — it governs a domain.
//
// Three failures are specific enough to be worth naming, because each would be invisible:
//
//   * IDENTITY BY COORDINATE WOULD COLLAPSE THE PLANE. BL-PRICE-002 and BL-PRICE-003 are both
//     about money on an order. Under the fact rule — normalized anchors plus scope — the second is
//     a duplicate of the first and is refused. Over 216 rules that is a bulk import silently
//     dropping pairs, and nobody would go looking.
//   * A TRANSCRIBED RULE MUST NOT VOTE. `partiesOf` counts a `from` artefact as a party, correctly,
//     because an arm's report IS an observation badly recorded. A page of rules is not: nobody
//     watched anything by writing it. Left counting, every imported rule would arrive one
//     confirmation away from the licence to act on it without re-verifying.
//   * THE AUTHOR'S ID MUST STILL RESOLVE. 23 places in the consuming plugin's prompts and a column
//     in every regression suite cite `BL-CART-003` by that exact string. The base mints its own
//     `KB-<hex>` id from the subject, so the author's id lives in the subject and `kb show` finds
//     it there — an exact match on the leading id, never a prefix search, or `BL-CART-01` opens
//     `BL-CART-010`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { validate } from '../src/validate.mjs';
import { parseEntry, stringifyFrontmatter } from '../src/frontmatter.mjs';
import {
  capture, confirm, dispute, CaptureRefused, loadEntry, readRules,
  fingerprint, confirmationsOf, attestedOf, isDisputed, rebuildCapturedArtifacts,
} from '../src/capture.mjs';
import { writtenNeighbours, experientialNeighbours } from '../src/coordinates.mjs';
import { ruleIdOf, ruleDomainOf, severityOf, byDomain } from '../src/rules.mjs';
import { DERIVED_ENTRIES, RULES_DIR, RULES_INDEX, RULES_CATALOG } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-rules-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({
    deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95', platformVersion: '3.1007.26',
  }));
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

// A page that exists, so `--from` resolves. The door refuses a path nothing resolves to, which is
// the whole property that makes a transcription auditable.
function withPage(dir, name = 'business-logic.md') {
  const p = join(dir, name);
  writeFileSync(p, '# rules\n');
  return p;
}

const RULE = (over = {}) => ({
  rule: true,
  subject: 'BL-CART-003 coupon + sale interaction',
  claim: '[P0-revenue] A percentage coupon applies to the already-discounted sale price, never to the list price.',
  refutableBy: 'observation',
  anchors: ['CartType.discounts'],
  ...over,
});

test('a rule must lead with the id its author gave it', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    assert.throws(
      () => capture(dir, RULE({ subject: 'coupon + sale interaction', from })),
      (e) => e instanceof CaptureRefused && /must lead with its ID/.test(e.message),
    );
    // And the refusal names the way out that is not "invent an id": an unnumbered claim is an
    // observation, and the ordinary door takes it.
    assert.match(
      (() => { try { capture(dir, RULE({ subject: 'no id here', from })); return ''; } catch (e) { return e.message; } })(),
      /capture it without --rule/,
    );
  } finally { drop(dir); }
});

test('two rules about one coordinate both get in — the fact rule would refuse the second', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const a = capture(dir, RULE({ from }));
    const b = capture(dir, RULE({
      subject: 'BL-PRICE-003 price rounding',
      claim: '[P0-revenue] All monetary amounts round half-up to 2 decimal places.',
      anchors: ['CartType.discounts'],
      from,
    }));
    assert.notEqual(a.id, b.id);
    assert.equal(readRules(dir).length, 2);

    // The same two, written as FACTS on the same coordinate with no scope to separate them, are one
    // fact by the identity rule — which is exactly why the normative plane needs its own.
    assert.equal(
      fingerprint({ subject: 'x', anchors: [{ coordinate: 'CartType.discounts' }], appliesTo: [], plane: 'experiential' }),
      fingerprint({ subject: 'y', anchors: [{ coordinate: 'CartType.discounts' }], appliesTo: [], plane: 'experiential' }),
    );
    assert.notEqual(
      fingerprint({ subject: 'BL-CART-003 a', anchors: [], appliesTo: [], plane: 'normative' }),
      fingerprint({ subject: 'BL-PRICE-003 b', anchors: [], appliesTo: [], plane: 'normative' }),
    );
  } finally { drop(dir); }
});

test('one rule id is one entry, whatever the title says', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const first = capture(dir, RULE({ from }));
    assert.throws(
      () => capture(dir, RULE({ subject: 'BL-CART-003 coupon and sale, reworded', anchors: ['Query.cart'], from })),
      (e) => e instanceof CaptureRefused
        && e.collidesWith === first.id
        && /carries the rule BL-CART-003/.test(e.message),
    );
  } finally { drop(dir); }
});

test('a transcribed rule is read by nobody: the row is kept in full and does not vote', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const r = capture(dir, RULE({ from }));
    const { data } = loadEntry(dir, r.id);

    // Nought parties, so nothing on this plane arrives licensed to be acted on unverified.
    assert.equal(confirmationsOf(data), 0);
    assert.equal(attestedOf(data), false);

    // And nothing was thrown away to get there: the row still says which page, and which session.
    const [row] = data.evidence;
    assert.match(row.from, /business-logic\.md$/);
    assert.equal(row.attested, false);
    assert.match(row.whyNot, /nobody has yet watched this rule hold/);
  } finally { drop(dir); }
});

test('a rule somebody watched hold is evidence of the ordinary kind', () => {
  const dir = makeBase();
  try {
    // No `--from`: this writer saw it happen, so the row votes like any other observation.
    const r = capture(dir, RULE({ deployment: 'vcptcore_stable' }));
    const { data } = loadEntry(dir, r.id);
    assert.equal(confirmationsOf(data), 1);
    assert.equal(data.evidence[0].attested, undefined);
  } finally { drop(dir); }
});

test('an observation contradicting a rule is a dispute, and both sides stay', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const r = capture(dir, RULE({ from }));
    dispute(dir, r.id, {
      deployment: 'vcptcore_stable',
      note: 'A coupon-backed reward replaces the auto-applied one whatever its size on this stand.',
    });
    const { data, body } = loadEntry(dir, r.id);
    assert.equal(isDisputed(data), true);
    assert.equal(data.status, 'active', 'a disputed rule is still served, with both sides visible');
    assert.match(body, /Disputed/);
    assert.match(body, /coupon applies to the already-discounted sale price/, 'the rule itself is untouched');

    // A later sighting that the rule DOES hold raises the count without erasing the contradiction.
    confirm(dir, r.id, { deployment: 'vcptcore_stable', note: 'Held on a second store: 10% of 80, not of 100.' });
    const after = loadEntry(dir, r.id).data;
    assert.equal(isDisputed(after), true);
    assert.equal(confirmationsOf(after), 1);
  } finally { drop(dir); }
});

test('the author id resolves exactly, and a shorter id does not open a longer one', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    capture(dir, RULE({ subject: 'BL-CART-010 max quantity enforcement', claim: '[P0-revenue] x', from }));
    const rules = readRules(dir);
    const byId = (want) => rules.find((e) => ruleIdOf(e.data.subject) === want);
    assert.ok(byId('BL-CART-010'));
    assert.equal(byId('BL-CART-01'), undefined, 'a prefix must not resolve to a longer id');
  } finally { drop(dir); }
});

test('a rule answers no question, and the gate agrees with the door', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    capture(dir, RULE({ from }));
    const r = validate(dir);
    assert.equal(r.ok, true, r.problems.join('\n'));
    assert.equal(r.rules, 1);
    // The exemption is narrow: a FACT without a question is still refused.
    assert.throws(
      () => capture(dir, {
        subject: 'a fact with no question', claim: 'x', refutableBy: 'observation',
        anchors: ['Query.cart'], appliesTo: ['surface=rest'], deployment: 'vcptcore_stable',
      }),
      (e) => e instanceof CaptureRefused && /question/.test(e.message),
    );
  } finally { drop(dir); }
});

test('the gate catches a rule whose id was edited out of its subject by hand', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const r = capture(dir, RULE({ from }));
    const path = join(dir, RULES_DIR, `${r.id}.md`);
    const { data, body } = parseEntry(readFileSync(path, 'utf8'), path);
    data.subject = 'coupon + sale interaction';
    writeFileSync(path, `${stringifyFrontmatter(data)}\n${body}`);

    const problems = validate(dir).problems.join('\n');
    assert.match(problems, /subject must lead with its ID/);
  } finally { drop(dir); }
});

test('the catalog is a reference: domains alphabetical, rules by id, severity carried', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    capture(dir, RULE({ subject: 'ECL-13.1 cancellation after partial ship', claim: '[P1-data] x', from }));
    capture(dir, RULE({ subject: 'BL-PRICE-010 tier boundary', claim: '[P0-revenue] x', from }));
    capture(dir, RULE({ subject: 'BL-PRICE-002 tax position', claim: '[P0-revenue] x', from }));
    rebuildCapturedArtifacts(dir, 'normative');

    const catalog = readFileSync(join(dir, RULES_CATALOG), 'utf8');
    assert.match(catalog, /## BL-PRICE — 2/);
    assert.match(catalog, /## ECL-13 — 1/);
    assert.ok(catalog.indexOf('## BL-PRICE') < catalog.indexOf('## ECL-13'), 'domains read alphabetically');
    assert.ok(
      catalog.indexOf('BL-PRICE-002') < catalog.indexOf('BL-PRICE-010'),
      'ids sort numerically inside a domain, so 002 precedes 010',
    );
    assert.match(catalog, /\| P0-revenue \|/);
    assert.match(catalog, /starts at zero however confident the page was/);

    // And the gate rebuilds it and byte-compares, so a hand edit is caught rather than served.
    writeFileSync(join(dir, RULES_CATALOG), `${catalog}\nan extra line nobody generated\n`);
    assert.match(validate(dir).problems.join('\n'), new RegExp(`${RULES_CATALOG} is not what the rules on disk build`));
  } finally { drop(dir); }
});

test('a rule is a neighbour of the coordinate it governs, and flows are not', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    capture(dir, RULE({ from }));
    capture(dir, {
      flow: true,
      subject: 'apply a coupon on the storefront',
      question: 'how do I apply a coupon?',
      claim: 'STEP 1 - open /cart.',
      refutableBy: 'observation',
      anchors: ['CartType.discounts'],
      appliesTo: ['surface=storefront-ui'],
      deployment: 'vcptcore_stable',
    });

    const written = writtenNeighbours(dir, ['CartType.discounts']);
    assert.equal(written.length, 1, 'the rule is shown, the flow is not');
    assert.equal(written[0].plane, 'normative');

    // The narrow default is unchanged, so every existing caller keeps its meaning.
    assert.deepEqual(experientialNeighbours(dir, ['CartType.discounts']), []);
  } finally { drop(dir); }
});

test('the id grammar: what is a rule id, what domain it belongs to, what severity it carries', () => {
  assert.equal(ruleIdOf('BL-CART-003 coupon + sale interaction'), 'BL-CART-003');
  assert.equal(ruleIdOf('ECL-13.3 something'), 'ECL-13.3');
  assert.equal(ruleIdOf('VC-PROMO-001 a pattern'), 'VC-PROMO-001');
  assert.equal(ruleIdOf('BL-A11Y-002 accessible names'), 'BL-A11Y-002');
  assert.equal(ruleIdOf('coupon + sale interaction'), null);
  // A hyphenated ordinary word is not an id: the shape needs capitals on the left of the hyphen.
  assert.equal(ruleIdOf('order-discount rounding'), null);

  assert.equal(ruleDomainOf('BL-CART-003'), 'BL-CART');
  assert.equal(ruleDomainOf('ECL-13.3'), 'ECL-13');
  assert.equal(ruleDomainOf(null), null);

  assert.equal(severityOf('[P0-revenue] A rule.'), 'P0-revenue');
  assert.equal(severityOf('A rule with no tag.'), null);

  const grouped = byDomain([
    { data: { subject: 'ECL-13.1 a' } },
    { data: { subject: 'BL-PRICE-010 b' } },
    { data: { subject: 'BL-PRICE-002 c' } },
  ]);
  assert.deepEqual(grouped.map(([d]) => d), ['BL-PRICE', 'ECL-13']);
  assert.deepEqual(grouped[0][1].map((e) => ruleIdOf(e.data.subject)), ['BL-PRICE-002', 'BL-PRICE-010']);
});

test('the rules index carries the active rules and the gate notices it going stale', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const r = capture(dir, RULE({ from }));
    const idx = JSON.parse(readFileSync(join(dir, RULES_INDEX), 'utf8'));
    assert.ok(Object.values(idx.storedFields ?? {}).some((s) => s.id === r.id));

    writeFileSync(join(dir, RULES_INDEX), JSON.stringify(buildIndex([]), null, 2) + '\n');
    assert.match(validate(dir).problems.join('\n'), new RegExp(`${RULES_INDEX} is not what the rules on disk build`));
  } finally { drop(dir); }
});

// --- a rule may name no coordinate -------------------------------------------------------------
//
// Measured on the document this plane exists for, not assumed: of the 216 BL-* invariants in
// `business-logic.md`, 143 name no coordinate in their Rule, Verify or Violation signal, and only
// 41 name one this base projects. "Money rounds half-up to two decimals" is about the platform, not
// about a place in it. An importer forced to fill this field would have invented 143 coordinates.

test('a rule may name no coordinate, and the gate agrees with the door', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const r = capture(dir, RULE({
      subject: 'BL-PRICE-003 price rounding',
      claim: '[P0-revenue] All monetary amounts round half-up to 2 decimal places in the display currency.',
      anchors: undefined,
      from,
    }));
    assert.deepEqual(loadEntry(dir, r.id).data.anchors, []);

    // The gate must not report it. A notice here would fire on two thirds of the imported plane and
    // bury the 39 the corpus actually carries.
    const problems = validate(dir).problems.join('\n');
    assert.doesNotMatch(problems, /carries no anchors/);

    // And the exemption is NARROW: a fact with no anchor is still unreachable and still reported.
    assert.throws(
      () => capture(dir, {
        subject: 'cart totals', question: 'what?', claim: 'x', refutableBy: 'observation',
        appliesTo: ['surface=xapi'], deployment: 'vcst-qa', anchors: [],
      }),
      (e) => e instanceof CaptureRefused && /anchors/.test(e.message),
    );
  } finally { drop(dir); }
});

test('a rule that does name a coordinate still records it, and still arrives beside an observation', () => {
  const dir = makeBase();
  const from = withPage(dir);
  try {
    const rule = capture(dir, RULE({ from, anchors: ['CartType.discounts'] }));
    const fact = capture(dir, {
      subject: 'coupon discount on a sale line',
      question: 'what does the coupon apply to?',
      claim: 'Observed: the coupon came off the list price.',
      refutableBy: 'observation',
      anchors: ['CartType.discounts'],
      appliesTo: ['surface=xapi'],
      deployment: 'vcst-qa',
    });
    const seen = writtenNeighbours(dir, [{ coordinate: 'CartType.discounts' }], { exclude: fact.id });
    assert.deepEqual(seen.map((n) => n.id), [rule.id]);
  } finally { drop(dir); }
});

// --- where a transcription points --------------------------------------------------------------
//
// A row that names the page it was read out of is auditable only if the reader can open that page.
// The rows already in this corpus name absolute paths on one machine, which nobody cloning the base
// can follow. An import of 216 rules makes that the common case rather than the exception, so a
// relative `--from` resolves against the BASE -- the thing the row travels inside -- and not
// against whatever directory the CLI happened to be run from.

test('a relative --from resolves against the base, so the stored path travels with the corpus', () => {
  const dir = makeBase();
  try {
    withPage(dir, 'sources-business-logic.md');
    const r = capture(dir, RULE({ from: 'sources-business-logic.md' }));
    const row = loadEntry(dir, r.id).data.evidence[0];
    assert.equal(row.from, 'sources-business-logic.md');
    assert.equal(row.attested, false);

    // A path that resolves against neither is still refused: the point of naming an artefact is
    // that somebody else can open it.
    assert.throws(
      () => capture(dir, RULE({ subject: 'BL-CART-004 x', from: 'nowhere-at-all.md' })),
      /does not exist/,
    );
  } finally { drop(dir); }
});
