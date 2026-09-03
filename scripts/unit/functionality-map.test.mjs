/**
 * Pins the EXISTING FUNCTIONALITY MAP's attribution rules.
 *
 * The generator has top-level side effects by design (it reads the real repo and writes the
 * committed doc), so it is exercised through its `--json` mode rather than imported. That
 * makes these tests assertions about the REAL corpus, which is the point: every one of them
 * is a false positive or false negative that was actually observed while building it, and
 * would otherwise come back silently the next time the vocabulary shifts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const SCRIPT = 'scripts/knowledge/build-functionality-map.mjs';

const model = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8' }));
const byName = new Map(model.domains.map((d) => [d.domain, d]));

test('the domain vocabulary comes from the manifest, not from this file', () => {
  assert.ok(model.domains.length >= 10, 'expected the manifest to declare a real domain set');
  // Named because they are the two the pipeline routes on most often; a rename here should
  // fail loudly rather than silently emptying half the map.
  assert.ok(byName.has('sales-rep'));
  assert.ok(byName.has('catalog-search'));
});

test('a domain NAME token outranks the same token as another domain’s tag', () => {
  // `catalog` is a tag of both catalog-search and purchase-flow. Counting ownership alone
  // made it ambiguous and dropped it, so catalog.md reached no domain at all.
  const knowledge = byName.get('catalog-search').knowledge;
  assert.ok(
    knowledge.some((p) => p.endsWith('/catalog.md')),
    `catalog.md should attribute to catalog-search, got: ${knowledge.join(', ')}`,
  );
});

test('container path segments attribute nothing', () => {
  // Regression: every file under .claude/knowledge/domain/ matched purchase-flow on the
  // token `domain` (it owns the tag `cross-domain`), so all six knowledge docs landed there.
  const totalKnowledge = new Set(model.domains.flatMap((d) => d.knowledge)).size;
  for (const d of model.domains) {
    assert.ok(
      d.knowledge.length < Math.max(2, totalKnowledge),
      `${d.domain} claims ${d.knowledge.length} of ${totalKnowledge} knowledge docs — container tokens are attributing again`,
    );
  }
});

test('a single tag-token hit does not attribute — pairs do', () => {
  // Regression: `member-status-invites` reached purchase-flow on the lone token `status`
  // (from its tag `status-workflow`), which is a coincidence rather than evidence.
  const pf = byName.get('purchase-flow');
  assert.ok(
    !pf.ba.some((p) => /member-status-invites/i.test(p)),
    `purchase-flow should not claim the org membership doc, got: ${pf.ba.join(', ')}`,
  );
});

test('prior BA analysis is found where it exists', () => {
  // The whole reason the map exists: 11 Sales-rep BA deliverables that nothing read.
  const sr = byName.get('sales-rep');
  assert.ok(sr.ba.length >= 5, `expected the Sales-rep BA folder to be found, got ${sr.ba.length}`);
  assert.ok(sr.ba.every((p) => p.startsWith('reports/ba/')));
});

test('a test model is placed by its own declared Domains line', () => {
  const declared = model.domains.flatMap((d) => d.models).filter((m) => m.how === 'declared');
  assert.ok(declared.length >= 1, 'expected at least one model to declare its domains');
  for (const m of declared) assert.match(m.path, /^reports\/ba\/test-models\//);
});

test('an unplaceable document is reported, never dropped', () => {
  assert.ok(Array.isArray(model.unattributed));
  for (const p of model.unattributed) assert.match(p, /\.md$/);
});

/* ---------- the test-object model ---------- */

test('every domain carries a test-object block', () => {
  for (const d of model.domains) {
    assert.ok(d.object, `${d.domain} has no object block`);
    for (const k of ['purpose', 'operations', 'testedAgainst', 'variants', 'constraints']) {
      assert.ok(k in d.object, `${d.domain}.object is missing ${k}`);
    }
  }
});

test('purpose is a verbatim chain or null — never a synthesised string', () => {
  // An invented purpose would be a fabricated claim about the product, sitting in the artifact
  // every later run reads as context. null renders as UNDECLARED, which is a finding.
  for (const d of model.domains) {
    const p = d.object.purpose;
    if (p === null) continue;
    assert.ok(Array.isArray(p) && p.length, `${d.domain}.purpose must be a non-empty array or null`);
    for (const line of p) assert.equal(typeof line, 'string');
  }
});

test('at least one domain has a declared purpose, and it comes from a model', () => {
  const declared = model.domains.filter((d) => d.object.purpose);
  assert.ok(declared.length >= 1, 'no domain resolved a value chain — the Part 0 parser is broken');
  for (const d of declared) assert.ok(model.domains.find((x) => x.domain === d.domain).models.length);
});

test('operations are drawn from the harvested schema vocabulary, with no duplicates', () => {
  const total = model.domains[0].object.operationsTotal;
  assert.ok(total > 20, `expected a real operation vocabulary, got ${total}`);
  for (const d of model.domains) {
    const ops = d.object.operations;
    assert.equal(new Set(ops).size, ops.length, `${d.domain} lists a duplicate operation`);
    assert.ok(ops.length <= total, `${d.domain} exercises more ops than exist`);
  }
});

test('config flags attribute by NAME, not by their gating prose', () => {
  // Regression: matching the "what it gates" column put 17 flags on catalog-search, including
  // checkout_comment_enabled and checkout_coupon_enabled. A wrong variant list is worse than none.
  const cat = model.domains.find((d) => d.domain === 'catalog-search');
  assert.ok(cat, 'catalog-search missing');
  for (const f of cat.object.variants) {
    assert.ok(!f.startsWith('checkout_'), `catalog-search should not claim ${f}`);
  }
});

test('constraint severities are consistent and read, never inferred', () => {
  for (const d of model.domains) {
    const c = d.object.constraints;
    assert.ok(c.p0 <= c.bl, `${d.domain}: more P0 than total BL`);
    assert.ok(c.undeclared <= c.bl, `${d.domain}: more undeclared than total BL`);
  }
});

test('--check is clean immediately after a refresh (the gate is idempotent)', () => {
  execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  // Throws on a non-zero exit, which is the assertion.
  execFileSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' });
});
