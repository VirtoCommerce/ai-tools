// WHAT A LOG LINE RECORDS — the `synthetic` mark (PLAN §14.2) and the fields added with the floor.
//
// A log field is cheap to add and effectively impossible to remove: the log is public, append-only,
// and old lines can never be backfilled. So each of these was admitted against a question somebody
// has NOW, and `verbs.mjs` carries the list of what was refused and why. This file pins the ones
// that got in, on real lines rather than on the code's intentions.
//
// EVERY TEST HERE ISOLATES `KB_QUEUE_DIR`. Anything writing through `core/queue.mjs` in a test
// must: the suite once left 73 smoke-test lines sitting in a developer's real queue, staged for a
// public repository by the next sweep (PLAN §7.1a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readQueue } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { RANKER } from '../kb/core/rank.mjs';
import { ask, capture, show } from '../kb/core/verbs.mjs';
import { captureLines } from '../kb/core/render.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = () => ({ reader: localReader(FIXTURE), locator: FIXTURE, how: 'test', why: null });

async function withQueue(fn, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-fields-'));
  try {
    return await fn({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'testsess', ...extraEnv });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const linesOf = (env) => readQueue({ env }).then((q) => q.lines);

// A question the 6-entry fixture holds an answer to, and two it does not.
const ANSWERED = 'what does the Active column on /company/members reflect';
// A question the fixture scores SOMETHING on (one shared word, coverage 0.14) and admits nothing
// for -- the interesting miss, the one that carries a near-miss.
const MISSED_NEAR = 'which kubernetes ingress annotation terminates tls for the storefront gateway';
// And one it scores nothing on at all.
const MISSED_COLD = 'what colour is the warehouse forklift';

// ── The floor's own fields ────────────────────────────────────────────────────────────────────

test('an answered ask records each hit’s score, positionally against matched', async () => {
  await withQueue(async (env) => {
    const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
    const [line] = await linesOf(env);
    assert.deepEqual(line.matched, r.hits.map((h) => h.id));
    assert.equal(line.scores.length, line.matched.length, 'scores are positional against matched');
    assert.deepEqual(line.scores, r.hits.map((h) => h.score));
    // The winning score is scores[0]. There is deliberately no second `score` field: a field for a
    // fact another field already carries is a copy that can disagree with the original.
    assert.ok(!('score' in line));
    assert.equal(line.scores[0], Math.max(...line.scores), 'sorted best first');
  });
});

test('a MISS records the best candidate that did not clear the floor', async () => {
  // The field that cannot be checked by reading the code: it needs a question the base scores
  // something on and admits nothing for.
  await withQueue(async (env) => {
    const r = await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'miss');
    const [line] = await linesOf(env);
    assert.equal(line.state, 'miss');
    assert.deepEqual(line.matched, []);
    assert.ok(line.nearMiss, 'something scored and was rejected — that is the interesting miss');
    assert.match(line.nearMiss.id, /^KB-/);
    assert.ok(line.nearMiss.score > 0);
    assert.ok(line.nearMiss.coverage > 0 && line.nearMiss.coverage < 1);
    // Two decimal places, because a human reads it and 0.45454545 is not a number anybody weighs.
    assert.equal(String(line.nearMiss.coverage), String(Math.round(line.nearMiss.coverage * 100) / 100));
  });
});

test('a miss on a question the base scores NOTHING on carries no nearMiss', async () => {
  // "Nothing came close" and "something came close and was cut" are different facts, and a field
  // that was always present would collapse them.
  await withQueue(async (env) => {
    const r = await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'miss');
    const [line] = await linesOf(env);
    assert.ok(!('nearMiss' in line));
  });
});

// ── Which ranker, and which door ──────────────────────────────────────────────────────────────

test('every ask names the ranker that produced it — and only asks do', async () => {
  // Every line already in the base came from the no-floor ranker. Without this marker a future
  // before/after comparison silently mixes two systems.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    const lines = await linesOf(env);
    for (const l of lines) assert.equal(l.rank, RANKER, 'answered and missed alike');
    assert.equal(RANKER, 'floor-1');

    const cap = await capture({
      subject: 'a fact about something else entirely',
      question: 'what happens to a saved filter on sign-out',
      claim: 'It is dropped.',
      deployment: 'vcst_qa',
      anchors: ['/account/filters'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(cap.state, 'queued');
    const capLine = (await linesOf(env)).at(-1);
    assert.ok(!('rank' in capLine), 'a capture does not rank, so a ranker version there means nothing');
  });
});

test('the door is recorded when the caller names it, and omitted when it does not', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'mcp' });
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(ANSWERED, opened(), { env });
    await ask(ANSWERED, opened(), { env, via: 'telepathy' });
    const lines = await linesOf(env);
    assert.equal(lines[0].via, 'mcp');
    assert.equal(lines[1].via, 'cli');
    // A field that defaults is a field that lies: an unnamed door is absent, not guessed.
    assert.ok(!('via' in lines[2]));
    assert.ok(!('via' in lines[3]), 'and an unknown door is not recorded either');
  });
});

// ── capture: the ask it followed ──────────────────────────────────────────────────────────────

test('a capture points back at the ask it followed — as a pointer, not a copy', async () => {
  await withQueue(async (env) => {
    await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    const askLine = (await linesOf(env)).at(-1);

    const r = await capture({
      subject: 'the storefront gateway terminates tls at the ingress, not in the app',
      question: 'where is tls terminated for the storefront',
      claim: 'Observed on the deployment: the app receives plain http behind the ingress.',
      deployment: 'vcst_qa',
      anchors: ['/company/gateway'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');

    const capLine = (await linesOf(env)).at(-1);
    assert.equal(capLine.kind, 'capture');
    assert.equal(capLine.after, askLine.at, 'the timestamp of the preceding ask, which is already in this file');
    // NOT a copy of THE ASK's question. The link back is `after`, a pointer; copying the ask's `q`
    // onto the capture would be a second thing that can disagree with the first.
    //
    // The capture's OWN `question` IS recorded, and it is a different fact: the ask's `q` is what
    // somebody searched for, this entry's `question` is the retrieval key it will be found by
    // forever. It duplicates the entry's frontmatter exactly as `subject` already does, which is
    // what §7's "ids and subjects" has always permitted. Spelled out because this assertion passed
    // unchanged when `question` was added — the letter held while the intent moved, which is the
    // failure that hid a dead anchor bonus for two sessions.
    assert.ok(!('q' in capLine), 'the ask’s question is pointed at, never copied');
    assert.equal(capLine.question, 'where is tls terminated for the storefront',
      'the capture’s own retrieval key, which is not the same fact');
  });
});

test('a capture with no ask before it says nothing rather than guessing', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a fact recorded without asking first',
      question: 'does the saved cart survive a sign-out',
      claim: 'It does.',
      deployment: 'vcst_qa',
      anchors: ['/cart/saved'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    const [capLine] = await linesOf(env);
    assert.ok(!('after' in capLine), '`after` means FOLLOWED; with nothing before it, there is nothing to say');
  });
});

// ── capture: the related hint it surfaced ─────────────────────────────────────────────────────

test('a capture records WHICH related entries it put in front of the writer', async () => {
  await withQueue(async (env) => {
    // The fixture holds two entries about where a cart-level promotion lands (KB-55C8E448,
    // KB-378EEA52), which is what this fact speaks to.
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    assert.ok(r.related.hits.length > 0, 'the fixture holds two entries about cart-level discounts');

    const line = (await linesOf(env)).at(-1);
    // ONE field, naming what was SURFACED. PLAN §7: ids, never subjects or prose, and no second
    // field for a count the list already carries. IDS AND NOT A COUNT because the question that
    // matters is whether the writer ACTED on what it was shown — a later dispute of an id that
    // appears here is that chain, and a bare number cannot record it. It shipped as a count and
    // met real traffic the same day: a session was shown three related entries and then disputed
    // one, and the log could not say whether the disputed entry was among the three.
    assert.deepEqual(line.related, r.related.hits.map((h) => h.row.id));
    assert.ok(line.related.every((id) => /^KB-[0-9A-F]{8}$/.test(id)), 'ids, so a dispute is traceable');
    assert.ok(!('relatedCount' in line) && !('relatedTotal' in line));
  });
});

test('a capture the base holds nothing near records related [] rather than omitting it', async () => {
  // `0` is the reading that makes the rest of the column mean anything: it says the hint ran and
  // found nothing, which is a different fact from a line written before the hint existed.
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'the warehouse forklift is repainted every spring',
      question: 'how often is the forklift repainted',
      claim: 'Observed: annually.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    assert.equal(r.related.hits.length, 0);
    assert.deepEqual((await linesOf(env)).at(-1).related, []);
  });
});

test('the hint never blocks the capture — it is computed after the queue write is decided', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    // Related entries exist AND the capture is queued, with the payload the pusher needs intact.
    assert.ok(r.related.hits.length > 0);
    assert.equal(r.state, 'queued');
    const line = (await linesOf(env)).at(-1);
    assert.equal(line.kind, 'capture', 'not `capture-refused`');
    assert.ok(line.payload?.entry, 'and it still carries what the push will send');
  });
});

test('both doors say the same thing, because the sentence lives in the renderer', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a cart promotion discount is not shown against any product line on the cart page',
      question: 'does a cart subtotal promotion change the discount on each cart line item',
      claim: 'Observed: the line items carry no share of the cart-level discount.',
      deployment: 'vcst_qa',
      anchors: ['/cart/summary'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    const cli = captureLines(r, { prefix: 'kb capture' });
    const mcp = captureLines(r, { prefix: 'kb_capture' });
    const related = (lines) => lines.filter((l) => l.startsWith('  related') || /^ {4}KB-/.test(l));
    assert.deepEqual(related(cli), related(mcp), 'the two doors differ only in the prefix');
    assert.ok(related(cli).length > 1);
    // It must not read as a gate: the capture is already queued by the time these lines exist.
    assert.match(related(cli)[0], /nothing is blocked/);
  });
});

test('a capture with nothing related prints no related block at all', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'the warehouse forklift is repainted every spring',
      question: 'how often is the forklift repainted',
      claim: 'Observed: annually.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.ok(!captureLines(r).some((l) => l.includes('related')));
  });
});

// ── what the agent was SHOWN, and why it matched ──────────────────────────────────────────────
// Both positional against `matched`, both admitted 2026-09-19 against questions that exist now.
test('an answer records WHY each hit matched — the coordinate door made measurable', async () => {
  await withQueue(async (env) => {
    const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'answer');
    const line = (await linesOf(env)).at(-1);

    assert.equal(line.matchedBy.length, line.matched.length, 'positional against matched');
    assert.ok(line.matchedBy.every((v) => ['anchor', 'words', 'both'].includes(v)),
      'a closed vocabulary — never prose, never a free-form reason');

    // The question names `/company/members`, an anchor of the fixture's entry, so at least one hit
    // must report the coordinate. If this ever reads all-'words', the anchor is dead again — which
    // is exactly how 73 of 221 anchors stayed invisible for two sessions.
    assert.ok(line.matchedBy.some((v) => v === 'anchor' || v === 'both'),
      'a question that literally names an anchor must record that it did');
  });
});

test('an answer records the trust label AS SHOWN, because the entry will move', async () => {
  await withQueue(async (env) => {
    const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
    const line = (await linesOf(env)).at(-1);
    assert.equal(line.trustShown.length, line.matched.length, 'positional against matched');
    assert.deepEqual(line.trustShown, r.hits.map((h) => h.trust.label),
      'what the reader was told, not what the entry says today');
    assert.ok(line.trustShown.every((v) => typeof v === 'string' && v.length < 40));
  });
});

test('a capture records the QUESTION as well as the subject', async () => {
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'the depot forklift roster is keyed by yard, not by site',
      question: 'why does the forklift roster show nothing for a site that has yards',
      claim: 'Observed on the depot board: the roster query takes a yard id.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    // The subject is the claim; the question is the RETRIEVAL KEY, and only one of them says
    // anything about how a person would go looking for this.
    assert.equal((await linesOf(env)).at(-1).question,
      'why does the forklift roster show nothing for a site that has yards');
  });
});

// ── `call`: the join key that makes "who asked" a lookup ──────────────────────────────────────
test('a line records the caller’s tool-use id when the client sends one, and omits it otherwise',
  async () => {
    await withQueue(async (env) => {
      await ask(ANSWERED, opened(), { env, via: 'mcp', call: 'toolu_01Fy89fmgM4sCT11S7dAyshH' });
      await ask(ANSWERED, opened(), { env, via: 'mcp' });
      await ask(ANSWERED, opened(), { env, via: 'cli', call: '' });
      const lines = await linesOf(env);

      // Opaque, no content, and it says nothing by itself — its whole value is that every
      // `tool_use` in the transcript carries `isSidechain` and `agentName` under this same id.
      assert.equal(lines[0].call, 'toolu_01Fy89fmgM4sCT11S7dAyshH');
      // A field that defaults is a field that lies: a client that sends nothing gets no field,
      // rather than a null that later reads as "the main agent asked".
      assert.ok(!('call' in lines[1]), 'absent when the client offers nothing');
      assert.ok(!('call' in lines[2]), 'and an empty string is not an id');
    });
  });

// ── capture: the entries this session had already opened ──────────────────────────────────────

test('a capture is warned about an entry it read, which the WORD hint cannot reach', async () => {
  // THE 2026-09-20 REGRESSION, in miniature. A session opened an entry, then wrote a fact whose
  // vocabulary has nothing in common with it — the real pair shared exactly one token, `order`, for
  // a coverage of 0.029 against a floor of three words. The word hint is not at fault and is not
  // fixable here: there is nothing in the text to match on. What the session DID is the signal.
  await withQueue(async (env) => {
    await show('KB-D10625AA', opened(), { env, via: 'cli' });
    const r = await capture({
      subject: 'the storefront sends a configurable product’s chosen sections as configurationItems',
      question: 'how does a configured line reach the cart mutation',
      claim: 'Observed: the mutation carries sectionId per chosen option.',
      deployment: 'vcst_qa',
      anchors: ['Mutations.addItemsCart'],
      scope: ['surface=graphql'],
    }, opened(), { env, via: 'cli' });

    assert.deepEqual(r.read.map((n) => n.id), ['KB-D10625AA'], 'it was read, so it is surfaced');
    assert.equal(r.related.hits.some((h) => h.row.id === 'KB-D10625AA'), false,
      'and the vocabulary hint never had a chance at it — which is the whole point of the new list');
    assert.deepEqual((await linesOf(env)).at(-1).read, ['KB-D10625AA']);
  });
});

test('an entry the session read is NOT repeated as an anchor neighbour or as related', async () => {
  // The dedup used to run the other way: neighbours were printed first and then excluded from the
  // related hint. On 2026-09-20 that removed the entry a capture's own body said it contradicted
  // from the one list framed as a warning, leaving it at row 10 of an unranked 25-line coordinate
  // dump. Read-in-this-session is the strongest framing available, so it wins and the others defer.
  await withQueue(async (env) => {
    await show('KB-55C8E448', opened(), { env, via: 'cli' });
    const r = await capture({
      subject: 'a second coupon on the same cart replaces the first rather than stacking',
      question: 'can two coupons apply to one cart at once',
      claim: 'Observed: adding a second coupon dropped the first.',
      deployment: 'vcst_qa',
      anchors: ['POST /api/carts'],
      scope: ['surface=rest'],
    }, opened(), { env, via: 'cli' });

    assert.deepEqual(r.read.map((n) => n.id), ['KB-55C8E448']);
    const elsewhere = [...r.alsoHere.hits.map((n) => n.id), ...r.related.hits.map((h) => h.row.id)];
    assert.equal(elsewhere.includes('KB-55C8E448'), false, 'said once, in the strongest place');
    assert.ok(r.alsoHere.hits.some((n) => n.id === 'KB-378EEA52'),
      'the OTHER entry at that coordinate is still reported — deferring is not suppressing');
  });
});

test('the read list is the whole session, newest first, and never repeats an entry', async () => {
  // The union over the session rather than the preceding ask alone: measured on the three labelled
  // contradiction pairs, the session-wide list carries 4 of 4 targets and the preceding ask 2 of 4,
  // because one of those captures followed an ask that opened nothing.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });          // opens KB-27B4CD10
    await show('KB-06664A3A', opened(), { env, via: 'cli' });
    await show('KB-06664A3A', opened(), { env, via: 'cli' });    // read twice, listed once
    const r = await capture({
      subject: 'an unrelated observation about background job scheduling',
      question: 'when does the indexing job run',
      claim: 'Observed: hourly.',
      deployment: 'vcst_qa',
      anchors: ['/api/platform/jobs'],
      scope: ['surface=rest'],
    }, opened(), { env, via: 'cli' });

    assert.deepEqual(r.read.map((n) => n.id), ['KB-06664A3A', 'KB-27B4CD10'],
      'newest first: a contradiction is likelier with what was read a minute ago');
  });
});

test('a capture by a session that read nothing records read [] rather than omitting it', async () => {
  // Same argument as `related: []`. It was true of 5 of the 14 captures in the fortnight this was
  // measured on, and "wrote without reading anything" is a fact worth being able to count.
  await withQueue(async (env) => {
    await capture({
      subject: 'a first observation in a fresh session',
      question: 'what happens on a cold start',
      claim: 'Observed: nothing was read first.',
      deployment: 'vcst_qa',
      anchors: ['/api/platform/jobs'],
      scope: ['surface=rest'],
    }, opened(), { env, via: 'cli' });
    assert.deepEqual((await linesOf(env)).at(-1).read, []);
  });
});

// ── `deployment`: which stand the QUESTION was about ──────────────────────────────────────────
//
// `capture` / `confirm` / `dispute` have always carried it; `ask` carried nothing, so the demand
// side of the log could not be read per stand at all. Measured on the published base 2026-09-21
// (`grep -h "deployment:" entries/*.md | sort | uniq -c`): 148 observations on `vcptcore_stable`,
// 33 on `vcst_qa`, 1 on `vcst` — a skew and a spelling split that no demand panel could see.
//
// BOTH CASES ARE PINNED, and the absent one is the load-bearing half: there is no source of truth
// for a stand's canonical name (`stand()` in verbs.mjs carries the measurements), so the only safe
// value for "the caller did not say" is no field — never `null`, never `""`, never a guess.

test('an ask records the deployment the question was about when the caller names one', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: 'vcptcore_stable' });
    await ask(MISSED_COLD, opened(), { env, via: 'mcp', deployment: 'vcst_qa' });
    const lines = await linesOf(env);
    // It rides on the ANSWER and on the MISS alike: a miss on a stand is the more interesting of
    // the two, because "nobody has written this down about THAT stand" is the panel's whole job.
    assert.equal(lines[0].state, 'answer');
    assert.equal(lines[0].deployment, 'vcptcore_stable');
    assert.equal(lines[1].state, 'miss');
    assert.equal(lines[1].deployment, 'vcst_qa');
  });
});

test('an ask with no deployment records NO field — not null, not an empty string', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: '' });
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: '   ' });
    // `kb.mjs`'s parser gives a valueless flag the boolean `true`, and `deployment: "true"` is a
    // stand name that is not a stand — unreadable later as anything but a real one.
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: true });
    for (const line of await linesOf(env)) {
      assert.ok(!('deployment' in line), 'absent beats plausible-and-wrong');
    }
  });
});

test('both doors put the same field on the line, because both go through one core', async () => {
  // A divergence here would mean two logs with different shapes, which is the thing having one
  // core is for. The CLI reaches `ask()` through `kb.mjs`, MCP through `mcp.mjs`; neither adds a
  // default, so the only difference between these two lines is the door.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: 'vcst_qa' });
    await ask(ANSWERED, opened(), { env, via: 'mcp', call: 'toolu_01Fy89fmgM4sCT11S7dAyshH', deployment: 'vcst_qa' });
    const [cli, mcp] = await linesOf(env);
    assert.equal(cli.deployment, mcp.deployment);
    assert.deepEqual(Object.keys(mcp).filter((k) => k !== 'call'), Object.keys(cli));
  });
});

test('the deployment is recorded verbatim — the log reports, it does not normalise', async () => {
  // The base already holds `vcst` once against `vcst_qa` 33 times. Ironing that out on the way in
  // would need a mapping with no source of truth behind it, and would hide the one thing worth
  // knowing: that two callers disagree about what the stand is called.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: '  vcst  ' });
    assert.equal((await linesOf(env)).at(-1).deployment, 'vcst', 'trimmed, and otherwise untouched');
  });
});

test('nothing but an ask carries it — a capture already has its own', async () => {
  // `capture` puts the deployment in the ENTRY's evidence, where it is a property of the
  // observation. A second copy on the capture's log line would be the duplicate-field defect §7
  // refuses, and the two could disagree.
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a fact captured while a stand was named on the ask',
      question: 'does the stand reach the capture line',
      claim: 'It does not; it reaches the entry.',
      deployment: 'vcptcore_stable',
      anchors: ['/depot/stands'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    const line = (await linesOf(env)).at(-1);
    assert.ok(!('deployment' in line), 'the capture LINE carries none');
    assert.equal(line.payload.entry.evidence[0].deployment, 'vcptcore_stable', 'the ENTRY carries it');
  });
});
