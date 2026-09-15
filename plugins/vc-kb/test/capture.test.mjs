import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { validate } from '../src/validate.mjs';
import { ask } from '../src/resolve.mjs';
import { deliver } from '../src/deliver.mjs';
import { consolidate } from '../src/consolidate.mjs';
import {
  capture, confirm, dispute, retire, CaptureRefused,
  normalizeAnchor, fingerprint, readCaptured, confirmationsOf, disputesOf,
  loadEntry, survivorOf, CAPTURE_HELP, stampNotice,
} from '../src/capture.mjs';
import { DERIVED_ENTRIES, OWNED_ROOTS } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-step2-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const ADMIN_TOKEN = {
  subject: 'connect-token-as-platform-admin',
  question: 'How do I obtain a platform bearer token for the admin API on this deployment?',
  claim: 'POST /connect/token, form-encoded, grant_type=password with the admin identity. No client_id and no scope are needed; the response carries access_token as a JWT.',
  refutableBy: 'observation',
  anchors: ['POST /connect/token'],
  appliesTo: ['principal=platform-admin'],
  deployment: 'localhost',
  at: '2026-09-01T00:00:00Z',
};

// The same fact, recorded by a second agent that shares no wording with the first and spells the
// coordinate differently. In the dedup measurement this exact pair (2D-6 | 3F2-29) had question
// similarity 0.00: no wording threshold raises it, and a base that relies on wording holds it twice.
const ADMIN_TOKEN_RESTATED = {
  subject: 'platform-api-authentication',
  question: 'How do I authenticate against the back end to read a placed order?',
  claim: 'Form-post to http://localhost:8090/connect/token using the password grant and the admin credentials; use the returned access_token as a Bearer header.',
  refutableBy: 'observation',
  anchors: ['POST http://localhost:8090/connect/token'],
  appliesTo: ['principal=platform-admin'],
  deployment: 'localhost',
  at: '2026-09-02T00:00:00Z',
};

test('one coordinate written four ways normalizes to one coordinate', () => {
  const forms = [
    'POST /connect/token',
    'POST BACK_URL/connect/token',
    'POST {BACK_URL}/connect/token',
    'POST http://localhost:8090/connect/token',
  ];
  const normalized = new Set(forms.map(normalizeAnchor));
  assert.equal(normalized.size, 1, [...normalized].join(' | '));
  assert.equal([...normalized][0], 'POST /connect/token');

  // Path parameters are one parameter however they are spelled, and a lowercase first segment is
  // a path segment, not a variable to be stripped.
  assert.equal(normalizeAnchor('GET /company/my-customers/<organizationId>'), normalizeAnchor('GET /company/my-customers/{id}'));
  assert.equal(normalizeAnchor('hooks/enforce-real-user.mjs'), 'hooks/enforce-real-user.mjs');
});

test('the fingerprint is coordinates plus scope, and deliberately not the claim', () => {
  const base = { anchors: [{ coordinate: 'POST /connect/token' }], appliesTo: [{ axis: 'principal', value: 'platform-admin' }] };
  const spelledDifferently = { anchors: [{ coordinate: 'POST {BACK_URL}/connect/token' }], appliesTo: [{ axis: 'principal', value: 'platform-admin' }] };
  const otherPrincipal = { anchors: [{ coordinate: 'POST /connect/token' }], appliesTo: [{ axis: 'principal', value: 'storefront-customer' }] };
  assert.equal(fingerprint(base), fingerprint(spelledDifferently));
  assert.notEqual(fingerprint(base), fingerprint(otherPrincipal));
});

test('two agents recording one fact in different words produce ONE entry, and the door says which', () => {
  const dir = makeBase();
  const first = capture(dir, ADMIN_TOKEN);

  let refusal = null;
  try {
    capture(dir, ADMIN_TOKEN_RESTATED);
  } catch (e) {
    refusal = e;
  }
  assert.ok(refusal instanceof CaptureRefused, 'the second capture must be refused');
  assert.equal(refusal.collidesWith, first.id, 'and it must name the entry that already holds the fact');
  assert.match(refusal.message, /kb confirm/, 'the refusal must be actionable, not just a rejection');

  // Verifiable in the corpus, not only in the tool's output.
  assert.equal(readCaptured(dir).length, 1);
  drop(dir);
});

test('three agents in independent sessions collapse to one entry with three confirmations', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  confirm(dir, id, { deployment: 'vcptcore-stable', platformVersion: '3.1007.26', by: 'agent-2', at: '2026-09-03T00:00:00Z' });
  confirm(dir, id, { deployment: 'localhost', platformVersion: '3.1068.0', by: 'agent-3', at: '2026-09-04T00:00:00Z' });

  const corpus = readCaptured(dir);
  assert.equal(corpus.length, 1, 'one entry on disk');
  assert.equal(confirmationsOf(corpus[0].data), 3);

  // The version range is READ from the observations; nothing declared it.
  const seen = corpus[0].data.evidence.map((e) => e.platformVersion ?? null);
  assert.deepEqual(seen, [null, '3.1007.26', '3.1068.0']);
  assert.equal(validate(dir).ok, true, validate(dir).problems.join('; '));
  drop(dir);
});

test('one coordinate under two principals stays two facts, and consolidate says which axis', () => {
  const dir = makeBase();
  capture(dir, ADMIN_TOKEN);
  const customer = capture(dir, {
    subject: 'connect-token-as-storefront-customer',
    question: 'How do I obtain a storefront customer token so the cart mutation runs authenticated?',
    claim: 'POST /connect/token with grant_type=password, scope=offline_access and storeId. Omitting storeId fails.',
    refutableBy: 'observation',
    anchors: ['POST /connect/token'],
    appliesTo: ['principal=storefront-customer'],
    deployment: 'localhost',
    at: '2026-09-05T00:00:00Z',
  });
  assert.ok(customer.id, 'a different principal is a different fact and must be capturable');
  assert.equal(readCaptured(dir).length, 2);

  const r = consolidate(dir);
  assert.equal(r.groups.length, 1, 'the shared coordinate raises them as candidates');
  assert.equal(r.groups[0].coordinate, 'POST /connect/token');
  assert.equal(r.groups[0].scopeAgrees, false);
  assert.deepEqual(r.groups[0].differingAxes, [{ axis: 'principal', values: ['platform-admin', 'storefront-customer'] }]);
  assert.equal(r.proposed.length, 0, 'merging these would produce one entry asserting both');

  // Naming them explicitly must still be refused: the scope check is the screen, not the flag.
  const ids = r.groups[0].members.map((m) => m.id);
  assert.throws(() => consolidate(dir, { merge: ids }), /do not agree on scope/);
  assert.equal(readCaptured(dir).filter((e) => e.data.status === 'active').length, 2);
  drop(dir);
});

test('capture defaults no field: it refuses and names what is missing (M3)', () => {
  const dir = makeBase();
  assert.throws(() => capture(dir, { ...ADMIN_TOKEN, appliesTo: [] }), (e) => e instanceof CaptureRefused && /appliesTo/.test(e.message));
  assert.throws(() => capture(dir, { ...ADMIN_TOKEN, anchors: [] }), (e) => e instanceof CaptureRefused && /anchors/.test(e.message));
  assert.throws(() => capture(dir, { ...ADMIN_TOKEN, claim: '' }), (e) => e instanceof CaptureRefused && /claim/.test(e.message));
  // "derivation" is the derived plane's refutation channel. Regenerating a schema cannot refute
  // something nobody generated, so it would name a check that can never fail.
  assert.throws(() => capture(dir, { ...ADMIN_TOKEN, refutableBy: 'derivation' }), (e) => e instanceof CaptureRefused && /derivation/.test(e.message));
  assert.throws(() => capture(dir, { ...ADMIN_TOKEN, appliesTo: ['platform-admin'] }), (e) => e instanceof CaptureRefused && /axis=value/.test(e.message));
  assert.equal(readCaptured(dir).length, 0, 'a refused capture writes nothing');
  drop(dir);
});

test('two writers cannot mint one id: the same subject for a different fact is refused', () => {
  const dir = makeBase();
  capture(dir, ADMIN_TOKEN);
  let err = null;
  try {
    // Same subject, different coordinates: the fingerprint gate lets it through, so the id check
    // is the one that has to catch it. Without it the second write would overwrite the first.
    capture(dir, { ...ADMIN_TOKEN, anchors: ['GET /api/platform/security/me'], claim: 'something else entirely' });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CaptureRefused);
  assert.match(err.message, /already held by a DIFFERENT fact/);
  assert.equal(readCaptured(dir).length, 1);
  drop(dir);
});

test('consolidation merges on agreeing scope and keeps BOTH claims', () => {
  const dir = makeBase();
  const a = capture(dir, ADMIN_TOKEN);
  // Same scope, overlapping coordinates, extra one of its own: the fingerprint differs, so the
  // capture door lets it in and consolidation is what brings them together.
  const b = capture(dir, {
    subject: 'admin-token-lifetime',
    question: 'How long does the admin bearer token stay valid?',
    claim: 'The access_token from the password grant is an RS256 JWT with roughly a 30 minute expiry.',
    refutableBy: 'observation',
    anchors: ['POST /connect/token', 'access_token'],
    appliesTo: ['principal=platform-admin'],
    deployment: 'localhost',
    at: '2026-09-06T00:00:00Z',
  });

  // No blanket apply: the merge must be NAMED. Agreeing scope has been measured proposing wrong
  // merges (the password grant and the impersonation grant), so the tool proposes and a writer
  // decides.
  const proposal = consolidate(dir);
  assert.equal(proposal.proposed.length >= 1, true);
  assert.equal(proposal.applied.length, 0, 'reporting must write nothing');

  const r = consolidate(dir, { merge: [a.id, b.id] });
  assert.equal(r.applied.length, 1);
  assert.equal(r.applied[0].survivor, a.id, 'the entry observed first survives; ids are eternal');
  assert.deepEqual(r.applied[0].retired, [b.id]);

  const survivor = readCaptured(dir).find((e) => e.data.id === a.id);
  assert.match(survivor.body, /No client_id and no scope are needed/, 'the first claim is kept verbatim');
  assert.match(survivor.body, /roughly a 30 minute expiry/, 'and so is the second — a merge is a union, never a pick');
  assert.equal(survivor.data.anchors.length, 2, 'anchors are the union');
  assert.equal(survivor.data.evidence.length, 2, 'every observation that was paid for stays an observation');

  const retired = readCaptured(dir).find((e) => e.data.id === b.id);
  assert.equal(retired.data.status, 'retired', 'the other entry is retired, never deleted');
  assert.match(retired.body, new RegExp(`Consolidated into ${a.id}`));
  assert.equal(validate(dir).ok, true, validate(dir).problems.join('; '));
  drop(dir);
});

test('a dispute lands on the entry and is served as a dispute, not hidden beside it', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  dispute(dir, id, {
    deployment: 'vcst-qa',
    note: 'On this deployment the same grant returns 400 unless storeId is supplied',
    at: '2026-09-07T00:00:00Z',
  });

  const entry = readCaptured(dir)[0];
  assert.equal(disputesOf(entry.data), 1);
  assert.equal(confirmationsOf(entry.data), 1, 'a dispute does not erase the confirmation it argues with');

  const res = ask(dir, 'how do I obtain a platform bearer token for the admin api');
  assert.equal(res.miss, false);
  const hit = res.results.find((r) => r.id === id);
  assert.ok(hit, 'the disputed entry is still served — silence about a contested fact is worse than the contest');
  assert.equal(hit.trust.level, 'disputed');
  assert.equal(hit.disputed.count, 1);
  assert.match(hit.disputed.notes[0].note, /storeId/);

  const d = deliver(dir, 'how do I obtain a platform bearer token for the admin api');
  assert.match(d.block, /DISPUTED/, 'a consumer must not be able to paste it without seeing the dispute');
  drop(dir);
});

test('a knowingly wrong entry can be served, but never as settled once it is contradicted', () => {
  const dir = makeBase();
  // The reference set plants entries that are false on purpose (#3, #10, #19): the correct outcome
  // is contradicting the repository, not agreeing with it. The base is a lens, never ground truth.
  const { id } = capture(dir, {
    subject: 'catalog-search-requires-no-authentication',
    question: 'Does the catalog search endpoint need a bearer token?',
    claim: 'No. POST /api/catalog/search answers anonymously on every deployment.',
    refutableBy: 'observation',
    anchors: ['POST /api/catalog/search'],
    appliesTo: ['principal=anonymous'],
    deployment: 'localhost',
    at: '2026-09-08T00:00:00Z',
  });

  const before = deliver(dir, 'does the catalog search endpoint need a bearer token');
  assert.equal(before.hit, true);
  assert.equal(before.citations[0].disputed, false);
  assert.match(before.block, /verify in proportion to blast radius/,
    'every delivered block carries the protocol that tells the consumer to check it');

  dispute(dir, id, {
    deployment: 'vcptcore_stable',
    note: 'Returns 401 without a bearer token on this deployment',
    at: '2026-09-09T00:00:00Z',
  });

  const after = deliver(dir, 'does the catalog search endpoint need a bearer token');
  assert.equal(after.hit, true, 'a contradicted entry is still served — hiding it hides the contradiction too');
  assert.equal(after.citations[0].disputed, true);
  assert.equal(after.citations[0].trust, 'disputed');
  assert.match(after.block, /Returns 401 without a bearer token/,
    'the consumer sees what was seen instead, not just a flag');
  drop(dir);
});

test('retirement keeps the id and removes the entry from what can be served', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  assert.equal(ask(dir, 'how do I obtain a platform bearer token for the admin api').miss, false);

  retire(dir, id, { reason: 'the deployment stopped accepting the password grant' });

  assert.ok(existsSync(join(dir, 'captured', `${id}.md`)), 'the file stays: ids are eternal');
  const res = ask(dir, 'how do I obtain a platform bearer token for the admin api');
  assert.equal(res.miss, true, 'nothing may be served from a retired entry');
  assert.equal(res.degraded, null, 'and that is a coverage answer, not an infrastructure one');
  assert.equal(validate(dir).ok, true, validate(dir).problems.join('; '));
  assert.throws(() => confirm(dir, id, { deployment: 'localhost' }), /withdrawn/);
  drop(dir);
});

test('every gate stays green on an empty corpus, now with a second writer in the picture', () => {
  const dir = makeBase();
  const before = validate(dir);
  assert.equal(before.ok, true, before.problems.join('; '));
  assert.equal(before.captured, 0);

  // An empty experiential plane is a legitimate state, not a degraded one.
  const res = ask(dir, 'anything at all');
  assert.equal(res.miss, true);
  assert.equal(res.degraded, null);
  drop(dir);
});

test('a MISS delivered to a consumer is explicit, never an empty block', () => {
  const dir = makeBase();
  const d = deliver(dir, 'how do I bake sourdough bread');
  assert.equal(d.hit, false);
  assert.equal(d.degraded, null);
  assert.match(d.block, /^KB MISS/);
  assert.match(d.block, /kb capture/, 'a coverage MISS should tell the consumer what to do about it');
  assert.deepEqual(d.citations, []);

  // An unreadable base is a different answer from an uncovered question, and must stay different.
  rmSync(join(dir, 'derived-index.json'));
  const down = deliver(dir, 'how do I bake sourdough bread');
  assert.equal(down.hit, false);
  assert.ok(down.degraded, 'infrastructure failure must not read as a coverage gap');
  assert.match(down.block, /not a coverage answer/);
  drop(dir);
});

test('a captured fact is retrievable, cited, and carries its trust into the delivered block', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  confirm(dir, id, { deployment: 'vcptcore-stable', platformVersion: '3.1007.26', at: '2026-09-03T00:00:00Z' });

  const d = deliver(dir, 'how do I obtain a platform bearer token');
  assert.equal(d.hit, true);
  assert.equal(d.citations[0].id, id);
  assert.equal(d.citations[0].plane, 'experiential');
  assert.equal(d.citations[0].confirmations, 2);
  assert.match(d.block, new RegExp(`@kb\\(${id}\\)`), 'the block must carry the citation id, not just the text');
  assert.match(d.block, /confirmed, 2 observation\(s\), scoped to principal=platform-admin/);
  drop(dir);
});

test('the captured corpus, its index and its catalog stay in step with each other', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  assert.equal(validate(dir).ok, true);

  // Plant the failure the gate exists to catch: an entry on disk that the index does not carry.
  const stolen = readFileSync(join(dir, 'captured', `${id}.md`), 'utf8');
  writeFileSync(join(dir, 'captured', 'KB-DEADBEEF.md'), stolen.replace(id, 'KB-DEADBEEF').replace(ADMIN_TOKEN.subject, 'planted-orphan'));
  const after = validate(dir);
  assert.equal(after.ok, false);
  assert.ok(after.problems.some((p) => /does not carry active entry KB-DEADBEEF/.test(p)), after.problems.join('; '));
  drop(dir);
});

test('the extractor does not own the captured plane and cannot wipe it', () => {
  const dir = makeBase();
  capture(dir, ADMIN_TOKEN);
  // `kb check` compares only what the extractor regenerates; captured/ must not appear there, or
  // every capture would break a gate that exists to police the contract.
  // OWNED_ROOTS now lives in planes.mjs; the point of this test is what is NOT in it.
  assert.ok(!OWNED_ROOTS.includes('captured'));
  assert.ok(readdirSync(join(dir, 'captured')).some((f) => f.endsWith('.md')));
  drop(dir);
});

// --- the dead end a merge used to leave behind ---------------------------------------------------
//
// A retirement keeps the file and its fingerprint, so a later writer observing the same fact was
// refused, pointed at the retired entry, and then refused again by the very remedy the message
// named. Three verbs disagreed about what a retirement means; these fix the disagreement.

const retireInto = (dir) => {
  const survivor = capture(dir, ADMIN_TOKEN);
  const other = capture(dir, { ...ADMIN_TOKEN, subject: 'admin-bearer-token-second-wording', question: 'How do I authenticate against the platform API?', anchors: ['POST /connect/token', 'access_token'] });
  retire(dir, other.id, { reason: 'consolidated', supersededBy: survivor.id });
  return { survivor: survivor.id, retired: other.id };
};

test('a capture that lands on a retired fingerprint is refused against the survivor, not the tombstone', () => {
  const dir = makeBase();
  const { survivor, retired } = retireInto(dir);

  const attempt = () => capture(dir, { ...ADMIN_TOKEN, subject: 'admin-bearer-token-third-wording', question: 'Which grant issues an admin token?', anchors: ['POST /connect/token', 'access_token'] });
  assert.throws(attempt, (e) => {
    assert.ok(e instanceof CaptureRefused);
    assert.equal(e.collidesWith, survivor, 'the refusal must name what is served, not what was withdrawn');
    assert.ok(!e.message.includes(retired), 'and must not send the writer to a file nothing serves');
    return true;
  });
  drop(dir);
});

test('both remedies a refusal names actually work on what it named', () => {
  const dir = makeBase();
  const { survivor } = retireInto(dir);
  assert.equal(confirm(dir, survivor, { deployment: 'localhost' }).confirmations, 2);
  assert.equal(dispute(dir, survivor, { deployment: 'localhost', note: 'observed otherwise' }).disputes, 1);
  drop(dir);
});

test('confirming a retired entry still refuses, and now says where its fact went', () => {
  const dir = makeBase();
  const { survivor, retired } = retireInto(dir);
  assert.throws(() => confirm(dir, retired, { deployment: 'localhost' }), (e) => {
    assert.match(e.message, new RegExp(`held by ${survivor}`));
    return true;
  });
  drop(dir);
});

test('disputing a retired entry refuses instead of writing where nothing serves it', () => {
  const dir = makeBase();
  const { survivor, retired } = retireInto(dir);
  const before = readFileSync(join(dir, 'captured', `${retired}.md`), 'utf8');

  assert.throws(() => dispute(dir, retired, { deployment: 'localhost', note: 'observed otherwise' }), (e) => {
    assert.match(e.message, new RegExp(`held by ${survivor}`));
    return true;
  });
  assert.equal(readFileSync(join(dir, 'captured', `${retired}.md`), 'utf8'), before,
    'a contradiction recorded where no reader meets it is quieter than a refusal and worse');
  drop(dir);
});

test('a fingerprint retired into nothing lets a re-observation through, because withdrawal is not a ban', () => {
  const dir = makeBase();
  const first = capture(dir, ADMIN_TOKEN);
  retire(dir, first.id, { reason: 'believed wrong at the time' });

  // Refusing here would make a withdrawn fact unrecordable forever, and a later observation of it
  // is the one thing that could show the withdrawal was premature.
  const again = capture(dir, { ...ADMIN_TOKEN, subject: 'admin-bearer-token-re-observed' });
  assert.ok(again.id);
  assert.equal(validate(dir).ok, true, 'and the corpus stays valid: the fingerprint check looks at active entries');
  drop(dir);
});

test('a survivor is followed through a chain of retirements, and a cycle does not hang', () => {
  const dir = makeBase();
  const a = capture(dir, ADMIN_TOKEN);
  const b = capture(dir, { ...ADMIN_TOKEN, subject: 'admin-token-middle', anchors: ['POST /connect/token', 'middle'] });
  const c = capture(dir, { ...ADMIN_TOKEN, subject: 'admin-token-end', anchors: ['POST /connect/token', 'end'] });
  retire(dir, a.id, { reason: 'merged', supersededBy: b.id });
  retire(dir, b.id, { reason: 'merged again', supersededBy: c.id });
  assert.equal(survivorOf(dir, loadEntry(dir, a.id)).data.id, c.id, 'A -> B -> C, and a writer sent to B has been sent nowhere');

  // Point two retired entries at each other and the walk must stop rather than spin.
  const x = capture(dir, { ...ADMIN_TOKEN, subject: 'loop-one', anchors: ['POST /connect/token', 'one'] });
  const y = capture(dir, { ...ADMIN_TOKEN, subject: 'loop-two', anchors: ['POST /connect/token', 'two'] });
  retire(dir, x.id, { reason: 'merged', supersededBy: y.id });
  retire(dir, y.id, { reason: 'merged back', supersededBy: x.id });
  assert.equal(survivorOf(dir, loadEntry(dir, x.id)), null);
  drop(dir);
});

test('a retirement pointer that names nothing is refused at the door and caught by the gate', () => {
  const dir = makeBase();
  const { id } = capture(dir, ADMIN_TOKEN);
  assert.throws(() => retire(dir, id, { reason: 'merged', supersededBy: 'KB-NOTHERE' }), CaptureRefused);

  // And if one arrives another way, the gate names it rather than leaving a pointer into nowhere.
  retire(dir, id, { reason: 'merged' });
  const path = join(dir, 'captured', `${id}.md`);
  writeFileSync(path, readFileSync(path, 'utf8').replace('status: retired', 'status: retired\nsupersededBy: KB-NOTHERE'));
  assert.ok(validate(dir).problems.some((p) => /supersededBy names KB-NOTHERE/.test(p)));
  drop(dir);
});

// --- served from somewhere else -----------------------------------------------------------------

const withPin = (dir, deployment) => {
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({ deployment, pin: '0000000000000000' }));
  return dir;
};

test('an entry observed on another deployment says so at the point of use', () => {
  const dir = withPin(makeBase(), 'vcptcore_stable');
  capture(dir, ADMIN_TOKEN); // observed on localhost

  const d = deliver(dir, 'How do I obtain a platform bearer token for the admin API?');
  assert.equal(d.hit, true);
  assert.match(d.block, /OBSERVED ELSEWHERE: on localhost, not on vcptcore_stable/);
  drop(dir);
});

test('and it is named rather than filtered, because it is still the best the base has', () => {
  const dir = withPin(makeBase(), 'vcptcore_stable');
  const { id } = capture(dir, ADMIN_TOKEN);
  const d = deliver(dir, 'How do I obtain a platform bearer token for the admin API?');
  assert.ok(d.citations.some((c) => c.id === id), 'a contract covers no part of this, so hiding it would answer nothing');
  drop(dir);
});

test('an entry observed on the deployment the base describes is not flagged', () => {
  const dir = withPin(makeBase(), 'vcptcore_stable');
  capture(dir, { ...ADMIN_TOKEN, deployment: 'vcptcore_stable' });
  const d = deliver(dir, 'How do I obtain a platform bearer token for the admin API?');
  assert.doesNotMatch(d.block, /OBSERVED ELSEWHERE/);
  drop(dir);
});

test('one confirmation on the right deployment is enough to stop the flag', () => {
  const dir = withPin(makeBase(), 'vcptcore_stable');
  const { id } = capture(dir, ADMIN_TOKEN);
  confirm(dir, id, { deployment: 'vcptcore_stable' });
  const d = deliver(dir, 'How do I obtain a platform bearer token for the admin API?');
  assert.doesNotMatch(d.block, /OBSERVED ELSEWHERE/, 'it has now been seen here, whatever else it was seen on');
  drop(dir);
});

test('with no pin recorded there is nothing to compare against, and nothing is claimed', () => {
  const dir = makeBase(); // no derived/pin.json
  capture(dir, ADMIN_TOKEN);
  const d = deliver(dir, 'How do I obtain a platform bearer token for the admin API?');
  assert.doesNotMatch(d.block, /OBSERVED ELSEWHERE/);
  drop(dir);
});

// The required-input list and the help page are two halves of one instruction: the first says what
// the door demands, the second says what belongs in it. Kept apart they drift, and the failure is
// silent in the worst direction -- the door asks for something no page explains, at the moment
// someone is already fumbling. An eighth input breaks this test twice: once because the count
// moved, once because the map below does not know its flag.
const HELP_FLAG = {
  subject: '--subject',
  question: '--question',
  claim: '--claim',
  refutableBy: '--refutable-by',
  anchors: '--anchor',
  appliesTo: '--scope',
  deployment: '--deployment',
};

test('every input the door requires is explained on the capture help page', () => {
  const dir = makeBase();
  let missing = [];
  try {
    capture(dir, {});
    assert.fail('an empty capture must be refused');
  } catch (e) {
    assert.ok(e instanceof CaptureRefused);
    missing = e.missing;
  }

  assert.deepEqual(missing.slice().sort(), Object.keys(HELP_FLAG).sort(),
    'the set of required inputs moved; CAPTURE_HELP and HELP_FLAG have to move with it');

  for (const key of missing) {
    const flag = HELP_FLAG[key];
    assert.ok(CAPTURE_HELP.includes(flag),
      'the door requires ' + key + ' but the help page never mentions ' + flag);
  }

  // And the refusal has to say where that page is, because the refusal is what an agent sees first.
  assert.ok(CAPTURE_HELP.startsWith('kb capture'));
  drop(dir);
});

test('a refusal for missing inputs points at the help page', () => {
  const dir = makeBase();
  try {
    capture(dir, {});
    assert.fail('an empty capture must be refused');
  } catch (e) {
    assert.match(e.message, /kb capture --help/);
  }
  drop(dir);
});

// --- the version an observation was made against -------------------------------------------------
//
// The door accepted --pin and --platform-version from the day it was built, and no run ever passed
// them: 54 of 54 evidence rows in the live base carried a deployment NAME and nothing else, while
// derived/pin.json held the platform version the whole time. These fix that by reading the value
// where it already lives rather than asking a writer to retype a published number.

const PINNED = (dir) => {
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({
    deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95', platformVersion: '3.1007.26',
  }));
  return dir;
};

test('an observation on the deployment the corpus describes is stamped with its version', () => {
  const dir = PINNED(makeBase());
  const r = capture(dir, { ...ADMIN_TOKEN, deployment: 'vcptcore_stable' });
  const { data } = loadEntry(dir, r.id);
  assert.equal(data.evidence[0].platformVersion, '3.1007.26');
  assert.equal(data.evidence[0].pin, 'c2f9c438eba4cd95');
  assert.equal(r.stamp.source, 'pin');
  drop(dir);
});

test('an observation on any OTHER deployment is not stamped, because the pin describes a different system', () => {
  const dir = PINNED(makeBase());
  const r = capture(dir, ADMIN_TOKEN); // observed on localhost
  const { data } = loadEntry(dir, r.id);
  assert.equal(data.evidence[0].platformVersion, undefined);
  assert.equal(data.evidence[0].pin, undefined);
  assert.equal(r.stamp.source, 'foreign');
  assert.match(stampNotice(r.stamp), /version NOT recorded/);
  drop(dir);
});

test('but it is still written — a fact whose limits are visible beats no fact', () => {
  const dir = PINNED(makeBase());
  const r = capture(dir, ADMIN_TOKEN);
  assert.ok(loadEntry(dir, r.id), 'refusing here would remove the only way observedElsewhere is ever populated');
  drop(dir);
});

test('a supplied version wins over the pin, because the writer saw what the writer saw', () => {
  const dir = PINNED(makeBase());
  const r = capture(dir, { ...ADMIN_TOKEN, deployment: 'vcptcore_stable', platformVersion: '3.1008.0' });
  assert.equal(loadEntry(dir, r.id).data.evidence[0].platformVersion, '3.1008.0');
  assert.equal(r.stamp.source, 'supplied');
  drop(dir);
});

test('a base with no pin has nothing to stamp from and says so rather than inventing one', () => {
  const dir = makeBase();
  const r = capture(dir, ADMIN_TOKEN);
  assert.equal(loadEntry(dir, r.id).data.evidence[0].platformVersion, undefined);
  assert.equal(r.stamp.source, 'unpinned');
  assert.match(stampNotice(r.stamp), /no derived\/pin\.json/);
  drop(dir);
});

test('confirm stamps too, so observedOn can range over versions rather than over one name', () => {
  const dir = PINNED(makeBase());
  const { id } = capture(dir, ADMIN_TOKEN); // localhost, unversioned
  const r = confirm(dir, id, { deployment: 'vcptcore_stable' });
  assert.equal(r.stamp.source, 'pin');
  const rows = r.observedOn.filter((o) => o.platformVersion === '3.1007.26');
  assert.equal(rows.length, 1, 'the confirmation carries a version even though the original could not');
  drop(dir);
});

test('dispute stamps too — a contradiction is worthless without the version it contradicts on', () => {
  const dir = PINNED(makeBase());
  const { id } = capture(dir, { ...ADMIN_TOKEN, deployment: 'vcptcore_stable' });
  const r = dispute(dir, id, { deployment: 'vcptcore_stable', note: 'the grant is rejected now' });
  assert.equal(r.stamp.source, 'pin');
  const { data } = loadEntry(dir, id);
  const against = data.evidence.find((e) => e.contradicts);
  assert.equal(against.platformVersion, '3.1007.26');
  drop(dir);
});
