// An anchor nobody can arrive at.
//
// The corpus had three and nothing said so. `Mutations.deleteOrganizationContact` was written after
// watching a Delete button on the storefront, where the schema has `Mutations.deleteContact`;
// `Promotion.isActive` names a field the REST model does not carry beside four it does; and
// `GET /api/platform/security/users/id` drops the `/{id}` that makes it a route. All three read
// exactly like real coordinates. Two menu paths sit beside them, honest about where the observation
// was made and equally unreachable.
//
// None of it fails the gate, and the tests below assert that as hard as they assert the notices.
// A menu path carries the only record of where somebody stood; answering it with a refusal would
// buy a tidy corpus by deleting the true half of the entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex, renderCatalog } from '../src/index-build.mjs';
import { mintId } from '../src/canonical.mjs';
import { stringifyFrontmatter } from '../src/frontmatter.mjs';
import { validate } from '../src/validate.mjs';
import { capture } from '../src/capture.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

// A derived plane that projects two namespaces -- `Mutations.` and `/api/platform` -- and no others.
function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });

  // Ids are minted from the subject and the gate checks it, so they cannot be typed by hand here.
  const docs = [
    ['gql-mutations-deletecontact', ['Mutations.deleteContact', 'Mutations.lockOrganizationContact']],
    ['rest-api-platform-security', ['GET /api/platform/security/users/id/{id}', 'DELETE /api/platform/security/users']],
  ].map(([subject, anchors]) => {
    const id = mintId(subject);
    const path = `${DERIVED_ENTRIES}/${id}.md`;
    const question = `What is the contract of ${subject}?`;
    const data = {
      id,
      subject,
      plane: 'derived-first',
      question,
      status: 'active',
      refutableBy: 'derivation',
      anchors: anchors.map((coordinate) => ({ coordinate })),
      evidence: [{ method: 'extraction', deployment: 'vcptcore_stable', pin: '0000000000000000' }],
    };
    writeFileSync(join(dir, path), `${stringifyFrontmatter(data)}\n\n${subject}\n`);
    return { id, subject, question, text: subject, path };
  });

  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex(docs), null, 2)}\n`);
  writeFileSync(join(dir, 'derived-catalog.md'), renderCatalog(docs, { pin: '0000000000000000', deployment: 'vcptcore_stable' }));
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FACT = {
  subject: 'what-delete-member-does',
  question: 'What does deleting a member from the storefront roster actually delete?',
  claim: 'It removes the organization membership and nothing else.',
  refutableBy: 'observation',
  appliesTo: ['surface=storefront-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-11T18:02:54Z',
};

const noticesOf = (base, re) => validate(base).notices.filter((n) => re.test(n));

test('an anchor the derived plane names raises nothing at all', () => {
  const base = makeBase();
  capture(base, { ...FACT, anchors: ['Mutations.deleteContact'] });
  const r = validate(base);
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.deepEqual(r.notices, [], 'a reachable anchor is the ordinary case and must be silent');
  drop(base);
});

// The sharp one. A namespace the base projects in full is a namespace where an unresolved
// coordinate is a claim about the contract that the contract does not support -- which is a
// different fact from a whole surface being absent, and the reason the check groups by namespace.
test('an invented coordinate is named, in a namespace where every sibling resolves', () => {
  const base = makeBase();
  capture(base, { ...FACT, anchors: ['Mutations.deleteOrganizationContact'] });
  const r = validate(base);
  assert.equal(r.ok, true, 'an unreachable anchor is not a corpus defect the gate may refuse');
  assert.equal(noticesOf(base, /names nothing, in a namespace this base projects in full/).length, 1);
  assert.match(r.notices.join('\n'), /Mutations\.deleteOrganizationContact/);
  drop(base);
});

test('a route missing its parameter is caught the same way', () => {
  const base = makeBase();
  capture(base, { ...FACT, anchors: ['GET /api/platform/security/users/id'] });
  assert.equal(noticesOf(base, /names nothing, in a namespace this base projects in full/).length, 1);
  drop(base);
});

// The opposite case, and the one that made the first cut of this check unreadable: 24 notices, of
// which twenty said the same thing about surfaces this base has never extracted. Said once, per
// namespace, with the entries named.
test('a surface the base does not project is one notice, however many entries anchor on it', () => {
  const base = makeBase();
  const a = capture(base, { ...FACT, subject: 'rounding-split', anchors: ['Discount.discountAmount'] });
  const b = capture(base, { ...FACT, subject: 'rate-not-persisted', anchors: ['Discount.discountAmountWithTax'] });

  const coverage = noticesOf(base, /^coverage: /);
  assert.equal(coverage.length, 1, coverage.join('\n'));
  assert.match(coverage[0], /2 experiential entries anchor on "discount"/);
  assert.match(coverage[0], new RegExp(a.id));
  assert.match(coverage[0], new RegExp(b.id));
  drop(base);
});

test('a menu path is named as one, and is not a failure', () => {
  const base = makeBase();
  capture(base, {
    ...FACT,
    anchors: ['Admin SPA: Security > Users > <account> > Roles', 'Mutations.deleteContact'],
  });
  const r = validate(base);
  assert.equal(r.ok, true);
  assert.equal(noticesOf(base, /is a menu path/).length, 1);
  assert.equal(noticesOf(base, /carries no anchor the derived plane names at all/).length, 0,
    'the entry is reachable through its other anchor; only the breadcrumb is not');
  drop(base);
});

test('an entry with no reachable anchor at all is told so separately', () => {
  const base = makeBase();
  capture(base, { ...FACT, anchors: ['Admin SPA: Contacts > Companies and contacts'] });
  assert.equal(noticesOf(base, /carries no anchor the derived plane names at all/).length, 1);
  drop(base);
});

// The same judgement, at the door. The gate reports it over the whole corpus, which is the right
// place to count it and the wrong place to act on it: the writer is the only party who can tell a
// misspelling from a surface this base has never extracted, and only while they are still looking
// at the screen they read it off.
test('the door tells the writer which anchors nothing will raise, and how they differ', () => {
  const base = makeBase();
  const r = capture(base, {
    ...FACT,
    anchors: [
      'Mutations.deleteContact',                      // resolves
      'Mutations.deleteOrganizationContact',          // invented, in a projected namespace
      'Admin SPA: Security > Users > <account>',      // a menu path
      'Discount.discountAmount',                      // a surface this base does not project
    ],
  });

  assert.deepEqual(
    r.unreachable.map((u) => [u.coordinate, u.kind]),
    [
      ['Mutations.deleteOrganizationContact', 'invented'],
      ['Admin SPA: Security > Users > <account>', 'menu-path'],
      ['Discount.discountAmount', 'uncovered'],
    ],
    'the anchor that resolves is absent, and the other three are told apart rather than counted together',
  );
  drop(base);
});

// A NOTICE THAT SURVIVES ITS OWN REMEDY IS SCENERY. `amend` appends an erratum rather than
// rewriting the step it corrects — deliberately, so the evidence rows above keep attesting to text
// their observers actually walked — so a corrected entry carries BOTH the old sentence and its
// correction, for good. KB-AFB2D3C5 in the live corpus is the case: a run walked it, found that an
// order CAN be deleted, wrote `DELETE /api/order/customerOrders` into the amendments, and the
// contradiction check went on reporting the step above as though nobody had looked.
test('a contradiction the entry has already answered elsewhere is not raised again', () => {
  const base = makeBase();
  capture(base, {
    ...FACT,
    subject: 'what-happens-to-an-account-on-delete',
    question: 'can an account be deleted?',
    claim: 'An account cannot be deleted once provisioned.\n\n**Amendment.** It can: DELETE /api/platform/security/users removes it by name.',
    anchors: ['Mutations.deleteContact'],
  });
  assert.deepEqual(noticesOf(base, /while the contract publishes/), []);
  drop(base);
});

// …and the sentence itself does not count as having answered it: "X cannot be deleted, even though
// DELETE /api/x exists" is precisely the claim worth a second look.
test('an unexamined contradiction is still raised', () => {
  const base = makeBase();
  capture(base, {
    ...FACT,
    subject: 'what-happens-to-an-account-on-delete-unexamined',
    question: 'can an account be deleted?',
    claim: 'A user cannot be deleted once provisioned.',
    anchors: ['Mutations.deleteContact'],
  });
  const raised = noticesOf(base, /while the contract publishes/);
  assert.equal(raised.length, 1, raised.join('\n'));
  assert.match(raised[0], /DELETE \/api\/platform\/security\/users/);
  drop(base);
});
