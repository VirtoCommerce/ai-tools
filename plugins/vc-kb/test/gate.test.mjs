// Every check here is written the way the review asked for: make the gate fail on something it
// should reject, before believing a green run means anything. Each test builds a corpus carrying
// exactly one defect and asserts the gate names it — and asserts the clean corpus still passes, so
// a check that fires on everything is not mistaken for a check that works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { validate } from '../src/validate.mjs';
import { capture, readCaptured, renderCaptured, rebuildCapturedArtifacts, CaptureRefused, CAPTURED_DIR } from '../src/capture.mjs';
import { DERIVED_ENTRIES, OWNED_ROOTS } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-gate-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const TOKEN = {
  subject: 'connect-token-as-platform-admin',
  question: 'How do I obtain a platform bearer token for the admin API?',
  claim: 'POST /connect/token, form-encoded, grant_type=password with the admin identity.',
  refutableBy: 'observation',
  anchors: ['POST /connect/token'],
  appliesTo: ['surface=platform-rest', 'principal=platform-admin'],
  deployment: 'localhost',
  at: '2026-09-01T00:00:00Z',
};

const problems = (base) => validate(base).problems;
const complains = (base, re) => problems(base).filter((p) => re.test(p));

test('a corpus with nothing wrong passes, so a failure below means the defect and not the check', () => {
  const base = makeBase();
  capture(base, TOKEN);
  const r = validate(base);
  assert.equal(r.ok, true, r.problems.join('\n'));
  drop(base);
});

test('one fact recorded twice under the same coordinates and scope is refused by the gate', () => {
  const base = makeBase();
  const first = capture(base, TOKEN);

  // Written straight to disk, the way a second writer's file arrives in a merge or by hand — the
  // door itself would have refused this, which is exactly why the gate has to as well.
  const twin = readCaptured(base)[0];
  const data = {
    ...twin.data,
    id: 'KB-DEADBEEF',
    subject: 'the-mutation-root-is-singular',
    question: 'Is the GraphQL mutation root singular?',
  };
  writeFileSync(join(base, CAPTURED_DIR, 'KB-DEADBEEF.md'), renderCaptured(data, 'The root is Mutation, singular.'));
  rebuildCapturedArtifacts(base);

  const hits = complains(base, /same fingerprint/);
  assert.equal(hits.length, 1, problems(base).join('\n'));
  assert.match(hits[0], /KB-DEADBEEF/);
  assert.match(hits[0], new RegExp(first.id));
  drop(base);
});

test('two spellings of one scope value are named, both the typo and the longer form', () => {
  const base = makeBase();
  capture(base, TOKEN);
  capture(base, { ...TOKEN, subject: 'swagger-per-module', question: 'Where is a module swagger?', claim: 'One document per module.', anchors: ['GET /docs/{ModuleId}/swagger.json'], appliesTo: ['surface=rest'] });
  capture(base, { ...TOKEN, subject: 'graphql-root-names', question: 'What are the graphql roots?', claim: 'Query and Mutations.', anchors: ['Query.cart'], appliesTo: ['surface=graphql'] });
  capture(base, { ...TOKEN, subject: 'graphql-cart-query', question: 'What does the cart query take?', claim: 'storeId and currencyCode are required.', anchors: ['Query.cart'], appliesTo: ['surface=grahpql'] });

  const segment = complains(base, /whole segments/);
  assert.equal(segment.length, 1, 'rest inside platform-rest is nine edits apart and one value');
  assert.match(segment[0], /"platform-rest" and "rest"/);

  const typo = complains(base, /one typo apart/);
  assert.ok(typo.length >= 1, 'grahpql for graphql is a transposition, which plain edit distance scores as 2');
  assert.match(typo[0], /"grahpql" and "graphql"|"graphql" and "grahpql"/);
  drop(base);
});

test('two genuinely different values on one axis are left alone', () => {
  const base = makeBase();
  capture(base, TOKEN);
  capture(base, { ...TOKEN, subject: 'storefront-cart-mutation', question: 'How is a cart line changed?', claim: 'Mutations.changeCartItemQuantity.', anchors: ['Mutations.changeCartItemQuantity'], appliesTo: ['surface=graphql', 'principal=storefront-customer'] });
  assert.equal(complains(base, /scope axis/).length, 0, problems(base).join('\n'));
  drop(base);
});

// The DOOR refuses it now, so the gate below never sees one from a live write. Everything else the
// door dislikes about an anchor is a judgement the writer is better placed to make; this one is not
// a judgement. A path into the Git installation is not what anybody meant -- it is what the shell
// did to what they meant -- and the entry is unreachable from the moment it exists.
//
// Run 07 wrote one and left the corpus failing its own gate. The correction was then mangled
// identically, by someone who had just read the failure and knew the cause. Knowing about the trap
// does not help you avoid it, which is the whole argument for refusing rather than documenting.
test('the door refuses an anchor the shell rewrote into a local path', () => {
  const base = makeBase();
  // What Git Bash produced from --anchor "/docs/{ModuleId}/swagger.json", verbatim.
  assert.throws(
    () => capture(base, { ...TOKEN, subject: 'swagger-through-msys', question: 'Where is a module swagger?', claim: 'One document per module.', anchors: ['C:/Program Files/Git/docs/{}/swagger.json'] }),
    (e) => e instanceof CaptureRefused && /MSYS_NO_PATHCONV/.test(e.message),
    'and the refusal names the way out, because the writer is about to retype the command',
  );
  assert.equal(readCaptured(base).length, 0, 'nothing was written');
  drop(base);
});

// The gate keeps the check regardless: entries written before the door had it are on disk, and the
// door is not the only way a file gets there.
test('the gate still names one that is already on disk', () => {
  const base = makeBase();
  const r = capture(base, { ...TOKEN, subject: 'swagger-through-msys', question: 'Where is a module swagger?', claim: 'One document per module.', anchors: ['GET /docs/{ModuleId}/swagger.json'] });
  const file = join(base, CAPTURED_DIR, `${r.id}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace('GET /docs/{ModuleId}/swagger.json', 'C:/Program Files/Git/docs/{}/swagger.json'));

  const hits = complains(base, /path on one machine/);
  assert.equal(hits.length, 1, problems(base).join('\n'));
  assert.match(hits[0], /MSYS_NO_PATHCONV/);
  drop(base);
});

test('a route anchor and a label anchor both survive, because the rule names a defect not a shape', () => {
  const base = makeBase();
  capture(base, TOKEN);
  capture(base, { ...TOKEN, subject: 'configurable-pdp-add-to-cart', question: 'What is the control called?', claim: 'The button reads Add to cart once every section has a selection.', anchors: ['Add to cart', 'label.vc-radio-button__container'], appliesTo: ['surface=storefront-ui'] });
  assert.equal(complains(base, /path on one machine/).length, 0);
  drop(base);
});

test('an index built from a body that has since changed is caught, though it names every right id', () => {
  const base = makeBase();
  const { id } = capture(base, TOKEN);

  // Edit the body on disk and do not rebuild. Every id the index carries is still correct; what it
  // serves is text the corpus no longer holds.
  const path = join(base, CAPTURED_DIR, `${id}.md`);
  writeFileSync(path, readFileSync(path, 'utf8').replace('grant_type=password', 'grant_type=client_credentials'));

  const stale = complains(base, /is not what the entries on disk build/);
  assert.equal(stale.length, 1, problems(base).join('\n'));
  assert.match(stale[0], /captured-index\.json/);

  rebuildCapturedArtifacts(base);
  assert.equal(complains(base, /is not what the entries on disk build/).length, 0, 'and a rebuild settles it');
  drop(base);
});

test('a stale captured catalog is caught on its own, not only through the index', () => {
  const base = makeBase();
  capture(base, TOKEN);
  const catalog = join(base, 'captured-catalog.md');
  writeFileSync(catalog, readFileSync(catalog, 'utf8').replace('| 1 |', '| 9 |'));
  assert.equal(complains(base, /captured-catalog\.md is not what/).length, 1);
  drop(base);
});

test('an empty corpus is still a legitimate state, with every new check in place', () => {
  const base = makeBase();
  const r = validate(base);
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.equal(r.captured, 0);
  drop(base);
});

test('a scope value that joins two values is named, because an axis may simply repeat', () => {
  // Run 02 wrote `surface=rest+admin-ui` for a fact visible on both. The schema already allowed
  // what it wanted — appliesTo is a list — but nothing said so, and the joined value computes a
  // fingerprint matching neither of the two records it stands for.
  const base = makeBase();
  capture(base, { ...TOKEN, subject: 'seen-on-two-surfaces', anchors: ['GET /api/order/customerOrders'], appliesTo: ['surface=rest+admin-ui'] });
  const hits = complains(base, /reads as two values joined/);
  assert.equal(hits.length, 1, problems(base).join('\n'));
  assert.match(hits[0], /An axis may repeat/);
  drop(base);
});

test('and the same fact written as two rows passes, which is what the message asks for', () => {
  const base = makeBase();
  capture(base, { ...TOKEN, subject: 'seen-on-two-surfaces', anchors: ['GET /api/order/customerOrders'], appliesTo: ['surface=rest', 'surface=admin-ui'] });
  assert.equal(validate(base).ok, true, problems(base).join('\n'));
  drop(base);
});

// THE UNTRACKED INDEXES, 2026-09-17. The written stores' retrieval indexes left git, because
// `kb reindex` rebuilds them from the entries on disk and the door rewrote them on every capture.
// The gate had to move with them: a fresh clone's normal state is entries with no index, and a
// check that failed there would be red on every checkout. What must NOT move is the derived index,
// which only `kb extract` writes and only from a running deployment.
test('an absent captured index is a notice, because `kb reindex` rebuilds it from the entries', () => {
  const base = makeBase();
  capture(base, TOKEN);
  rmSync(join(base, 'captured-index.json'));
  const r = validate(base);
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.equal(r.notices.filter((n) => /captured-index\.json is absent/.test(n)).length, 1, r.notices.join('\n'));
  drop(base);
});

test('but a captured index that no longer matches the entries still fails, because it is served', () => {
  const base = makeBase();
  capture(base, TOKEN);
  writeFileSync(join(base, 'captured-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  assert.equal(complains(base, /captured-index\.json .*stale/).length, 1, problems(base).join('\n'));
  drop(base);
});

test('and an absent DERIVED index still fails, because nothing rebuilds it without a deployment', () => {
  const base = makeBase();
  capture(base, TOKEN);
  writeFileSync(join(base, `${DERIVED_ENTRIES}/KB-00000001.md`), [
    '---', 'id: KB-00000001', 'subject: a-projected-surface', 'plane: derived-first',
    'question: what does this surface do?', 'status: active', 'refutableBy: derivation', '---', '', 'body', '',
  ].join('\n'));
  rmSync(join(base, 'derived-index.json'));
  assert.equal(complains(base, /derived-index\.json is missing while entries exist/).length, 1, problems(base).join('\n'));
  drop(base);
});
