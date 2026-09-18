// WHO WROTE A ROW — set by the tool, never typed.
//
// Found by the second independent review, 2026-09-16. Fifteen evidence rows in the live corpus
// carried `by: round2-arm-B` and the like, timestamped to the minute the arm had run. No arm ever
// ran a writing verb in any round; the author had typed the witness's name while reading the arm's
// report. Three entries reached `confirmed` on that, and the arrival replay read those rows as help
// that existed before the run — which is where "295 -> 316 arrivals" and "two calls gained" came
// from. Both are zero once the replay's own pre-existence filter is applied.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { sessionParty, writerParty, transcriptionSource, partiesOf, ProvenanceRefused } from '../src/provenance.mjs';
import { asAnotherParty } from './parties.mjs';
import { capture, loadEntry } from '../src/capture.mjs';
import { buildIndex } from '../src/index-build.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';
import { fileURLToPath } from 'node:url';

const KB = fileURLToPath(new URL('../bin/kb.mjs', import.meta.url));

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-prov-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({ deployment: 'vcptcore_stable', pin: 'p', platformVersion: '3.1007.26' }));
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([]), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FACT = {
  subject: 'only the largest cart-subtotal promotion applies',
  question: 'why did only one promotion apply when two were active',
  claim: 'CombinePolicy is BestReward on this deployment.',
  refutableBy: 'observation',
  anchors: ['GET /api/marketing/promotions'],
  appliesTo: ['surface=rest'],
  deployment: 'vcptcore_stable',
};

test('the tool stamps the writing session onto a row the writer did not author', () => {
  const dir = makeBase();
  const r = asAnotherParty(() => capture(dir, FACT));
  const row = loadEntry(dir, r.id).data.evidence[0];
  assert.match(row.by, /^session:/, 'a row says which session wrote it, and the writer did not choose it');
  drop(dir);
});

test('a transcription names an artefact that exists', () => {
  const dir = makeBase();
  const report = join(dir, 'report.md');
  writeFileSync(report, '# arm B\n\nOnly one promotion applied.\n');
  const r = asAnotherParty(() => capture(dir, { ...FACT, from: report }));
  const row = loadEntry(dir, r.id).data.evidence[0];
  assert.equal(row.from, report.split(String.fromCharCode(92)).join('/'));
  assert.match(row.by, /^session:/, 'the transcriber is still recorded — the artefact is WHERE it was read, not WHO read it');
  drop(dir);
});

test('a transcription whose artefact does not exist is refused', () => {
  const dir = makeBase();
  assert.throws(
    () => capture(dir, { ...FACT, from: join(dir, 'no-such-report.md') }),
    (e) => e instanceof ProvenanceRefused && /does not exist/.test(e.message),
    'the point of naming the artefact is that somebody else can open it and disagree',
  );
  drop(dir);
});

// The rule that matters. Before this, `by` was a free string and 121 of 124 rows carried none, so
// the independence rule added days earlier could not bite on anything.
test('one party writing twice is one party; two artefacts are two', () => {
  const now = '2026-09-16T00:00:00Z';
  assert.equal(partiesOf([{ by: 'session:aaaa', at: now }, { by: 'session:aaaa', at: now }]), 1,
    'two rows typed in one session are one reading twice');
  assert.equal(partiesOf([
    { by: 'session:aaaa', from: 'logs/round2/arm-B/report.md' },
    { by: 'session:aaaa', from: 'logs/round2/arm-C/report.md' },
  ]), 2, 'one author transcribing two reports is two observations badly recorded, not one');
  assert.equal(partiesOf([
    { by: 'session:aaaa', from: 'logs/round2/arm-B/report.md' },
    { by: 'session:bbbb', from: 'logs/round2/arm-B/report.md' },
  ]), 1, 'two people reading the same report are still one observation');
});

// LEGACY ROWS KEEP THE PERMISSIVE READING THEY WERE GRADED UNDER. The rows written before any of
// this existed must keep their levels, or the corpus re-grades itself the day a rule lands and
// every measurement taken against it stops comparing.
//
// Collapsing them to one party was tried on 2026-09-18 and reverted. The measurement that said it
// was free covered `captured` and `rules` — 0 of 318 entries moved — and missed the FLOW plane,
// which is where the authorless rows actually are: 2 of 3 flows crossed the `confirmed` threshold
// and `flows-catalog.md`, which carries the count and is byte-compared, stopped matching. Re-grading
// a published corpus is a decision about the corpus, not a tightening of a tool. The hole that
// change was aimed at is closed at the writing end instead — see `writerParty`.
test('rows with neither field each count as their own party', () => {
  assert.equal(partiesOf([{ at: 'a' }, { at: 'b' }, { at: 'c' }]), 3);
  assert.equal(partiesOf([{ at: 'a' }, { by: 'session:aaaa' }, { by: 'session:aaaa' }]), 2);
});

// THE HOLE, CLOSED WHERE IT COSTS NOTHING. `sessionParty` is null outside a Claude Code session —
// a plain terminal, a CI job, a script — so every row those callers wrote was authorless, and one
// actor could `capture` then `confirm` their own entry and reach `confirmed`, the licence to act
// without re-verifying, in two commands. Reproduced 2026-09-18. A machine id is coarser than a
// session and it is real rather than invented; it errs by counting two people on one machine as
// one party, never the reverse.
test('a row written with no session still names a writer, so one actor cannot vouch for itself', () => {
  assert.equal(sessionParty({}), null, 'the session accessor stays honest — an invented session id is worse than none');
  const w = writerParty({});
  assert.match(w, /^machine:[0-9a-f]{8}$/, 'but the WRITER is always named');
  assert.equal(writerParty({}), w, 'and stably, or capture and confirm would still read as two parties');
  assert.equal(partiesOf([{ by: w }, { by: w }]), 1, 'which is what closes the hole');
  assert.equal(writerParty({ KB_SESSION_ID: '09e39416-9083-43d4-b352-859c1de3f08a' }), 'session:09e39416', 'a named session still wins');
});

test('a session id the writer cannot choose, and no id at all when there is none', () => {
  assert.equal(sessionParty({ CLAUDE_CODE_SESSION_ID: '09e39416-9083-43d4-b352-859c1de3f08a' }), 'session:09e39416');
  assert.equal(sessionParty({}), null, 'no identity is honest; an invented one is not');
});

test('transcriptionSource passes through nothing when nothing is claimed', () => {
  assert.equal(transcriptionSource(undefined), null);
  assert.equal(transcriptionSource(''), null);
});

// The door itself. A refusal that only lives in the library is a refusal an agent routes around.
test('the CLI refuses a typed author or a typed timestamp', () => {
  // `--base` is supplied although nothing is written: the door requires a base before any verb
  // runs, so without one this fails on base resolution and never reaches the refusal under test.
  // It passed in the lab only because the old sibling walk happened to find the real corpus.
  const dir = mkdtempSync(join(tmpdir(), 'kb-prov-cli-'));
  for (const flag of ['--by', '--at']) {
    let code = 0; let err = "";
    try {
      // Located from THIS FILE. `process.cwd()` resolved only because the lab root happened to
      // be where the runner stood; from a plugin it is the consumer repository.
      execFileSync(process.execPath, [KB, 'capture', flag, 'x', '--base', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { code = e.status; err = String(e.stderr ?? ""); }
    assert.equal(code, 2, flag + " must be refused, not silently ignored");
    assert.match(err, /refused/);
    assert.match(err, /--from/, 'a refusal that does not name what to do instead is a wall');
  }
  rmSync(dir, { recursive: true, force: true });
});

// Condition set by the second review when it accepted the artefact rule.
test('a session cannot vote twice by citing an artefact it produced', () => {
  const rows = [
    { by: 'session:aaaa' },
    { by: 'session:aaaa', from: 'logs/its-own-report.md' },
  ];
  assert.equal(partiesOf(rows), 1,
    '`from ?? by` counted this session once for the unaided row and again for its own report');

  // Unchanged where the session did NOT also write unaided: a transcriber citing two reports is
  // still two observations badly recorded, which is the whole point of the artefact rule.
  assert.equal(partiesOf([
    { by: 'session:aaaa', from: 'logs/round2/arm-B/report.md' },
    { by: 'session:aaaa', from: 'logs/round2/arm-C/report.md' },
  ]), 2);
});

// A CONFIRM NOBODY CAN SHOW AN OBSERVATION FOR DOES NOT VOTE. Round four's arm confirmed an entry
// about order timestamps at the end of a pricing task, in a batch of three one second apart; its
// report names no timestamp. Asked for by the second review, which also asked for the same check
// over every confirm ever written — see `scripts/demote-unattested-confirm-2026-09-16.mjs` for why
// the sweep is refused: `confirm` has never taken a note, so the absence of one is a gap in the
// verb and not a verdict on 37 rows nobody can read.
test('a row marked unattested is kept and does not count as a party', () => {
  const rows = [
    { by: 'session:aaaa' },
    { by: 'session:bbbb', attested: false, whyNot: 'the report describes nothing of the kind' },
  ];
  assert.equal(partiesOf(rows), 1, 'an unattested row must not take an entry to `confirmed`');

  // Kept, not deleted: the row still records that a session touched the entry, and a later reader
  // can open the artefact named in `whyNot` and disagree.
  assert.equal(rows.length, 2, 'partiesOf must not mutate or drop the rows it is given');

  // Absent or true both vote. Only an explicit false is a judgement somebody made.
  assert.equal(partiesOf([{ by: 'session:aaaa' }, { by: 'session:bbbb', attested: true }]), 2);
});

// A CONFIRMATION MUST DESCRIBE SOMETHING. `dispute` has required `--note` since it was written, on
// the grounds that a contradiction nobody described cannot be resolved; `confirm` made the same
// claim on agreement and never asked. Round four's arm confirmed an entry about order timestamps
// at the end of a pricing task, and nothing in the row could show that nothing was seen.
test('confirm refuses without a note, and says why in terms of what the count buys', async () => {
  const { capture, confirm, CaptureRefused } = await import('../src/capture.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kb-confirm-note-'));
  mkdirSync(join(dir, 'derived-entries'), { recursive: true });
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify({ byId: {}, terms: {} }));

  const { id } = capture(dir, {
    subject: 'a claim somebody may agree with',
    question: 'does this hold',
    claim: 'It holds.',
    refutableBy: 'observation',
    anchors: ['GET /api/example'],
    appliesTo: ['surface=rest'],
    deployment: 'localhost',
    at: '2026-09-16T00:00:00Z',
  });

  assert.throws(
    () => confirm(dir, id, { deployment: 'localhost' }),
    (e) => e instanceof CaptureRefused
      && /--note is required/.test(e.message)
      && /confirmed/.test(e.message)
      && /--source/.test(e.message),
    'the refusal has to name what the count buys the next reader, not just the missing flag',
  );

  // With a note it goes through, and the note is on the row rather than only in the console.
  const r = confirm(dir, id, { deployment: 'localhost', note: 'saw the same 200 and the same body' });
  assert.ok(r.confirmations >= 1);
  const written = readFileSync(join(dir, 'captured', `${id}.md`), 'utf8');
  assert.match(written, /note: saw the same 200 and the same body/);

  rmSync(dir, { recursive: true, force: true });
});

// THE BAN IS ON TYPED PROVENANCE, NOT ON THE STRING `--at`.
//
// It was written as a global scan of argv and so it also caught `kb arrives <id> --at <coordinate>`
// — the interface that verb documents in its own help, in two places. The verb was unusable through
// its advertised flag and answered with a refusal about timestamps and a corpus incident, which
// names neither the verb nor the real problem. `arrives` writes no evidence row at all, so there is
// no provenance there to protect. Found 2026-09-18, present since the ban landed.
test('`kb arrives --at` is a coordinate and is not caught by the typed-provenance ban', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-prov-at-'));
  let code = 0; let err = '';
  try {
    execFileSync(process.execPath, [KB, 'arrives', 'KB-NOSUCH', '--at', 'Query.cart', '--reason', 'x', '--base', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { code = e.status; err = String(e.stderr ?? ''); }
  assert.doesNotMatch(err, /refused: the tool writes who wrote a row/, 'the timestamp ban must not fire on a coordinate');
  assert.doesNotMatch(err, /unknown flag/, 'and the flag is a real one, not a typo');
  assert.notEqual(code, 0, 'the id is fictional, so it still fails — on the id, which is the honest complaint');
  rmSync(dir, { recursive: true, force: true });
});

test('`--by` stays refused on every verb, `arrives` included', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-prov-by-'));
  let err = '';
  try {
    execFileSync(process.execPath, [KB, 'arrives', 'KB-NOSUCH', '--by', 'somebody', '--base', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { err = String(e.stderr ?? ''); }
  assert.match(err, /--by refused/, 'who wrote a row is never the writer’s to type');
  rmSync(dir, { recursive: true, force: true });
});
