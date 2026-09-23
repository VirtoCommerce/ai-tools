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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RUN_MAX, metaPath, queuePath, readQueue } from '../kb/core/queue.mjs';
import { fingerprint, whoPath } from '../kb/core/who.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { RANKER } from '../kb/core/rank.mjs';
import { DEPLOYMENT_MAX, NOTE_MAX, TOPIC_MAX, ask, askAbout, capture, confirm, dispute, show } from '../kb/core/verbs.mjs';
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
// An entry the fixture actually holds, for the verbs that take an id.
const EXISTING_ID = 'KB-27B4CD10';

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

test('`after` SURVIVES A FLUSH — the pointer is kept where the flush cannot reach it', async () => {
  // PLAN §23.5: 12 of 21 published captures carried no `after`, exactly the ones in a session's
  // second push, because the pointer was found by scanning the local queue and the flush deletes
  // that file every five minutes. The flush is simulated the only way it matters here: the queue
  // file is gone and nothing else is.
  await withQueue(async (env) => {
    await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    const askLine = (await linesOf(env)).at(-1);
    rmSync(queuePath(env), { force: true });

    const r = await capture({
      subject: 'the storefront gateway ingress terminates tls, found one flush after the ask',
      question: 'which ingress terminates tls for the storefront gateway',
      claim: 'It must.',
      deployment: 'vcst_qa',
      anchors: ['/company/after-a-flush'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    const [capLine] = await linesOf(env);
    assert.equal(capLine.after, askLine.at, 'the ask before the flush, not nothing');
  });
});

test('`after` names the ask the capture is ABOUT — not merely the last one (PLAN §23.11)', async () => {
  // Run `cdb27d99`: three captures inside a minute of one answered ask, all pointed at it. One was
  // about it; one answered a MISS fifty minutes earlier; one followed no question at all.
  await withQueue(async (env) => {
    await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    const theMiss = (await linesOf(env)).at(-1);
    await ask(ANSWERED, opened(), { env, via: 'cli' });

    await capture({
      subject: 'the storefront gateway ingress terminates tls, not the app',
      question: 'which ingress annotation terminates tls for the storefront gateway',
      claim: 'Observed.',
      deployment: 'vcst_qa',
      anchors: ['/company/gateway-tls'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal((await linesOf(env)).at(-1).after, theMiss.at, 'the earlier miss it answers, not the later ask');

    await capture({
      subject: 'a saved cart survives a sign-out',
      question: 'does a saved cart survive a sign-out',
      claim: 'It does.',
      deployment: 'vcst_qa',
      anchors: ['/cart/saved-lists'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.ok(!('after' in (await linesOf(env)).at(-1)),
      'about nothing that was asked: unprompted is the true reading, a pointer to the nearest ask a false one');
  });
});

test('the asks survive a flush in the sidecar, words and all — the queue alone forgets them', async () => {
  await withQueue(async (env) => {
    await ask(MISSED_NEAR, opened(), { env, via: 'cli' });
    const theMiss = (await linesOf(env)).at(-1);
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    rmSync(queuePath(env), { force: true });
    await capture({
      subject: 'the storefront gateway ingress terminates tls',
      question: 'where does the storefront gateway terminate tls',
      claim: 'At the ingress.',
      deployment: 'vcst_qa',
      anchors: ['/company/gateway-tls2'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    assert.equal((await linesOf(env)).at(-1).after, theMiss.at);
  });
});

test('askAbout: the most shared words win, ties go to the later ask, below the floor there is none', () => {
  // The run that motivated it, replayed from its public log lines (`log/20260923-cdb27d99.jsonl`).
  const asks = [
    { at: 'T1', q: 'storefront /checkout place order — what is the expected order status after card authorization on virtostart, and does a CyberSource Decision Manager held-for-review note block order creation?' },
    { at: 'T2', q: 'storefront configurable product page — are CFG_LAPTOP / CFG_RING configurable product URLs present on virtostart, or do they 404?' },
    { at: 'T3', q: "storefront homepage / — does the virtostart demo homepage render a 'Popular categories' section with category tiles, or a 'Daily Deals' product carousel?" },
    { at: 'T4', q: 'storefront /cart Bank card (CyberSource) authorizePayment — is the sandbox outcome deterministic, or can the same card sometimes authorize to Processing and sometimes be held for review as Payment required?' },
  ];
  assert.equal(askAbout(asks, { text: 'On virtostart the seeded configurable-product fixtures CFG_LAPTOP and CFG_RING do not exist — both /products-with-options/cfg-parents/* URLs return the storefront 404 page. Do the @td(CFG_LAPTOP.url) / @td(CFG_RING.url) configurable-product URLs resolve on the virtostart demo storefront?' }), 'T2');
  assert.equal(askAbout(asks, { text: "CyberSource sandbox authorization on the storefront cart is non-deterministic between runs on one build: the same card and amount can authorize cleanly to Processing, or be held for review and leave the order at Payment required. Does a CyberSource card order on /cart always end up held for review at 'Payment required', or can it authorize straight through to Processing?" }), 'T4');
  assert.equal(askAbout(asks, { text: 'Switching organization from the storefront account menu BLANKS the header account control instead of relabelling it; the new org name only appears after a full page reload. After a multi-org buyer switches organization from the account menu, does the header show the new organization name?' }), null);

  assert.equal(askAbout([{ at: 'A', q: 'tls ingress gateway' }, { at: 'B', q: 'tls ingress gateway' }], { text: 'gateway ingress tls' }), 'B', 'a tie goes to the later');
  assert.equal(askAbout([{ at: 'A', q: 'what does POST /api/carts/merge return' }], { text: 'an unrelated sentence', anchors: ['POST /api/carts/merge'] }), 'A',
    'a structured coordinate named verbatim is enough on its own');
  assert.equal(askAbout([{ at: 'A', q: 'storefront /cart layout' }], { text: 'an unrelated sentence', anchors: ['/cart'] }), null,
    'a one-segment page sits in half the questions, so it names nothing by itself');
});

// ── capture: turned away at the door (PLAN §23.11) ────────────────────────────────────────────

test('a capture refused AT THE DOOR is logged — kinds of problem, never the rejected text', async () => {
  // Run `cdb27d99` had one refused for an anchor of `/`, retried it nine seconds later, and the
  // report printed "refusals 0". A rejected anchor is one nobody vetted; `local-path` is a directory
  // on the writer's machine, so it must not ride into a public log.
  await withQueue(async (env) => {
    const r = await capture({
      subject: 'a fact with a mangled anchor',
      question: 'does the door log what it turned away',
      claim: 'It does now.',
      deployment: 'vcst_qa',
      anchors: ['C:/Program Files/Git/cart', '/'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'invalid');
    const lines = await linesOf(env);
    assert.equal(lines.length, 1, 'one line, and it is not a capture');
    const [l] = lines;
    assert.equal(l.kind, 'capture-invalid');
    assert.equal(l.subject, 'a fact with a mangled anchor');
    assert.deepEqual(l.problems.sort(), ['local-path', 'unstructured']);
    assert.ok(!JSON.stringify(l).includes('Program Files'), 'the rejected coordinate stays on the laptop');
    assert.ok(!('payload' in l) && !('id' in l), 'nothing was queued for the base');
  });
});

test('a capture missing a field is turned away and logged the same way', async () => {
  await withQueue(async (env) => {
    const r = await capture({ subject: 'half a capture' }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'invalid');
    const [l] = await linesOf(env);
    assert.equal(l.kind, 'capture-invalid');
    assert.match(l.why, /capture needs/);
    assert.ok(!('problems' in l), 'no anchor was judged, so no problem kinds');
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

test('an evidence NOTE is bounded too - the one prose field every agent actually reads', async () => {
  // THE INCONSISTENCY THIS CLOSES (review 3, F6). `topic` is capped at 60, `run` at 120 and
  // `deployment` at 40 - all three LOG fields no agent reads back. `note` is the opposite on every
  // axis: printed IN FULL, to every agent, on every hit, on every ask, from a public repo, forever,
  // and it had no bound at all. Measured payload before this: 2,661 B per ask on average, worst
  // single ask 11,610 B.
  //
  // The slope is what makes it a bound rather than a watch: every confirmation may add a note, and
  // confirming is the behaviour the whole design is built to encourage. The mechanism that makes an
  // entry trustworthy is the mechanism that makes it expensive.
  //
  // Driven through `dispute` rather than through the helper, because the bound is a property of what
  // reaches the ENTRY: a test of a private function would not notice a caller that stopped using it.
  await withQueue(async (env) => {
    const LONG = 'x'.repeat(NOTE_MAX * 2);
    const r = await dispute(EXISTING_ID, { deployment: 'vcst_qa', saw: LONG }, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'queued');
    assert.ok(r.item.note.length < LONG.length, 'it is bounded');

    // THE MARKER IS LOAD-BEARING HERE WHERE IT IS NOT FOR A TOPIC. A reader must be able to tell a
    // note that ENDS from one that was CUT, or the last clause of an argument reads as the whole.
    assert.match(r.item.note, /\[cut at \d+ chars\]$/);
  });

  // AND IT IS SET CLEAR OF EVERY REAL NOTE. The review proposed 1,500; measured over all 45 notes in
  // the live base, three exceed that and the longest is 2,547 - the dispute notes on KB-4D082C89,
  // which carry the whole argument of a contradiction and are exactly the prose this base is for.
  assert.ok(NOTE_MAX > 2_547, 'a bound that cuts the best writing in the corpus is the wrong bound');
  await withQueue(async (env) => {
    const real = 'y'.repeat(2_547);
    const r = await dispute(EXISTING_ID, { deployment: 'vcst_qa', saw: real }, opened(), { env, via: 'cli' });
    assert.equal(r.item.note, real, 'the longest note the base actually holds is untouched');
  });
});

test('an over-long deployment is BOUNDED — "verbatim" is about normalising, not about length', async () => {
  // F1 (PLAN §22.3). The field is caller-supplied and lands in a PUBLIC, APPEND-ONLY log where a
  // line cannot be edited or withdrawn, and nothing between the tool call and the file had a view
  // on its size — so an agent that put a paragraph here published a paragraph, against §7's "ids
  // and subjects only, never prose". The bound is imported, never transcribed (GOLDEN RULE).
  //
  // "Verbatim" survives intact, because it was always a promise about NORMALISING: no case-fold,
  // no mapping `vcst` onto `vcst_qa`, no opinion about what a stand is called. The test below this
  // one is the one that pins that, and it is unchanged.
  const LONG = `vcst_qa ${'x'.repeat(DEPLOYMENT_MAX * 3)}`;
  assert.ok(LONG.length > DEPLOYMENT_MAX, 'the fixture must actually exceed the bound');
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: LONG });
    await ask(MISSED_COLD, opened(), { env, via: 'cli', deployment: LONG });
    const lines = await linesOf(env);
    for (const l of lines) assert.equal(l.deployment.length, DEPLOYMENT_MAX);
    // Deterministic, so an ask and the confirm that follows it still join on the same stand.
    assert.equal(lines[0].deployment, lines[1].deployment);
  });

  // A BOUND, NOT A VALIDATOR: it is set far clear of every stand name this base has ever held —
  // the longest, `vcptcore_stable`, is 15 characters — so a real value is never touched.
  await withQueue(async (env) => {
    for (const stand of ['vcst_qa', 'vcptcore_stable', 'vcptcore_qa1', 'virtostart']) {
      await ask(ANSWERED, opened(), { env, via: 'cli', deployment: stand });
    }
    const lines = await linesOf(env);
    assert.deepEqual(lines.map((l) => l.deployment), ['vcst_qa', 'vcptcore_stable', 'vcptcore_qa1', 'virtostart']);
  });
});

test('the cap is a property of the FIELD, so confirm writes the same bounded deployment ask does', async () => {
  // One public log, one `deployment` key, two verbs writing it — a bound only one of them applies
  // is a bound the log does not have. `confirm` used to put `input.deployment` on the line
  // directly, bypassing the very function that holds the rule.
  const LONG = `vcst_qa ${'x'.repeat(DEPLOYMENT_MAX * 3)}`;
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', deployment: LONG });
    await confirm(EXISTING_ID, { deployment: LONG }, opened(), { env, via: 'cli' });
    const [asked, confirmed] = await linesOf(env);
    assert.equal(confirmed.kind, 'confirm');
    assert.equal(confirmed.deployment.length, DEPLOYMENT_MAX);
    assert.equal(confirmed.deployment, asked.deployment, 'both doors, one rule');
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

// ── `who`: the line says who wrote it ─────────────────────────────────────────────────────────
//
// Reading the published base as an outsider, nothing said who produced a line. The identity WAS
// already recoverable — it is the commit author — and that is not enough twice over: the report
// reads log FILES over HTTP and never sees git metadata, and THE PUSHER IS NOT ALWAYS THE ASKER,
// because a queue left behind by one session is swept by another, possibly on a different machine
// under a different person's token. So the handle is stamped when the line is WRITTEN.
//
// Stamped by `queue.mjs`'s single writer, like `synthetic`: no verb can forget it and no verb can
// fake it. `core/who.mjs` holds the resolver, the cache rules and the field's one honest limit —
// it names whose TOKEN is configured, not who is at the keyboard.
//
// THE LOOKUP IS NOT ON THIS PATH. `log()` reads a cache off the filesystem and never the network,
// which is why these tests seed the cache and why the whole suite stays offline.

const HANDLE = 'octo-tester';
const TEST_TOKEN = 'ghp_atestonlytokenvaluethatisnotreal01';

/** A queue directory whose identity cache is already warm, as a door would have left it. */
async function withKnownWho(fn, { handle = HANDLE, token = TEST_TOKEN, extraEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-who-line-'));
  // An env root with no env files: `writeToken` resolves through the repo's real `.env.local`
  // otherwise, and then which token these tests run under depends on the machine.
  const root = mkdtempSync(join(tmpdir(), 'kb-who-line-root-'));
  try {
    if (token) {
      writeFileSync(whoPath(dir), `${JSON.stringify({ fp: fingerprint(token), who: handle, at: new Date().toISOString() })}\n`, 'utf8');
    }
    return await fn({
      KB_QUEUE_DIR: dir,
      VC_ENV_ROOT: root,
      CLAUDE_CODE_HOST_SESSION_ID: 'testsess',
      ...(token ? { GITHUB_TOKEN: token } : {}),
      ...extraEnv,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

test('every line a session writes carries the handle — ask, miss, show and capture alike', async () => {
  await withKnownWho(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    await show('KB-27B4CD10', opened(), { env, via: 'cli' });
    await capture({
      subject: 'a fact written by somebody the log can name',
      question: 'who wrote this line',
      claim: 'Observed: the handle is on it.',
      deployment: 'vcst_qa',
      anchors: ['/depot/forklifts'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });

    const lines = await linesOf(env);
    assert.equal(lines.length, 4);
    for (const l of lines) assert.equal(l.who, HANDLE, `${l.kind}/${l.state ?? ''} carries it too`);
  });
});

test('a session with NO write token writes no handle and still works end to end', async () => {
  // Reads are tokenless by design (PLAN §6.4) and a reader writes nothing worth attributing, so
  // this is the correct answer rather than a degradation. What must not happen is the verb
  // changing shape around it.
  await withKnownWho(async (env) => {
    const answered = await ask(ANSWERED, opened(), { env, via: 'cli' });
    const missed = await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    assert.equal(answered.state, 'answer');
    assert.equal(missed.state, 'miss');
    for (const l of await linesOf(env)) {
      assert.ok(!('who' in l), 'absent — never null, never "unknown"');
      assert.equal(l.kind, 'ask');
    }
  }, { token: null });
});

test('a cache belonging to a DIFFERENT token stamps nobody', async () => {
  // The shared-machine case. Without the fingerprint check, whoever resolved first on this box
  // would have their handle published on everyone else's lines — the confident wrong attribution
  // that ruled out using the commit author in the first place.
  async function withMismatchedCache() {
    const dir = mkdtempSync(join(tmpdir(), 'kb-who-mismatch-'));
    const root = mkdtempSync(join(tmpdir(), 'kb-who-mismatch-root-'));
    try {
      writeFileSync(whoPath(dir), `${JSON.stringify({ fp: fingerprint('another-persons-token'), who: 'Not-Me', at: new Date().toISOString() })}\n`, 'utf8');
      const env = { KB_QUEUE_DIR: dir, VC_ENV_ROOT: root, CLAUDE_CODE_HOST_SESSION_ID: 'testsess', GITHUB_TOKEN: TEST_TOKEN };
      await ask(ANSWERED, opened(), { env, via: 'cli' });
      return (await linesOf(env))[0];
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  }
  assert.ok(!('who' in await withMismatchedCache()), 'no identity beats the wrong one');
});

test('the handle sits between the verb’s own fields and the synthetic mark, on both doors',
  async () => {
    // Key ORDER, because two doors writing differently-shaped lines is the thing having one core
    // is for — the same assertion `deployment` is pinned by. Stamped last and by the single
    // writer, so it lands in one place for every kind of line there is.
    await withKnownWho(async (env) => {
      await ask(ANSWERED, opened(), { env, via: 'cli' });
      await ask(ANSWERED, opened(), { env, via: 'mcp', call: 'toolu_01Fy89fmgM4sCT11S7dAyshH' });
      const [cli, mcp] = await linesOf(env);
      assert.deepEqual(Object.keys(mcp).filter((k) => k !== 'call'), Object.keys(cli));
      assert.equal(Object.keys(cli).at(-1), 'who', 'last, because nothing after it is a verb’s business');
      assert.equal(cli.who, mcp.who);
    });
  });

test('a lookup is never attempted while logging, even with a transport that explodes', async () => {
  // THE GUARANTEE, stated as a test rather than as a comment: `log()` reads a cache off the
  // filesystem and cannot reach the network at all, so a slow or broken GitHub can cost a line its
  // handle and can never cost a verb its answer. `kb-no-network.mjs` enforces the same thing for
  // the spawned doors; this covers the in-process path the unit suite actually uses.
  const saved = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('KB-NETWORK-TRAP: fetch was called'); };
  try {
    await withKnownWho(async (env) => {
      const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
      assert.equal(r.state, 'answer');
      assert.equal((await linesOf(env))[0].who, HANDLE);
    });
  } finally {
    globalThis.fetch = saved;
  }
});

// ── `run` and `topic`: what the work WAS ──────────────────────────────────────────────────────
//
// Reading the published base as an outsider on 2026-09-21, nothing said what the work was about.
// That the 07:22-08:15 window concerned a configurable-product order was inferred from the question
// TEXTS and from nothing else — a person reading nine sentences, which does not survive volume.
//
// TWO FIELDS AND NOT ONE, because they are different things that only look alike. `run` is the
// operator's opaque POINTER (a ticket, a PR, a branch) and joins this log to something outside it;
// `topic` is the agent's short English DESCRIPTION of the work. Conflating them is what makes this
// area feel slippery, and each is pinned separately below.
//
// BOTH GO ON THE LINE. Neither can go on the FILE — a file boundary is set by the push timer, and
// session `local_e8` left four files for one afternoon — and neither can go on the SESSION, which
// covers many tasks. A line is the only unit unambiguously about one thing, so a window's topics
// are COMPUTED from the lines (`topics()` in report-analyse.mjs), never declared.

test('the run handle rides on every line when the env var is set, and on none when it is not', async () => {
  // Stamped by `queue.mjs`'s single writer, like `who` and `synthetic`: an env var has to cover the
  // `flush` and `session` lines too, which no agent ever calls a verb for and which are exactly the
  // lines an outsider reads first.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(MISSED_COLD, opened(), { env, via: 'cli' });
    await show('KB-27B4CD10', opened(), { env, via: 'cli' });
    await capture({
      subject: 'a fact captured under a run handle',
      question: 'does the run handle reach a capture line',
      claim: 'It does.',
      deployment: 'vcst_qa',
      anchors: ['/depot/runs'],
      scope: ['surface=platform'],
    }, opened(), { env, via: 'cli' });
    const lines = await linesOf(env);
    assert.ok(lines.length >= 4);
    for (const l of lines) assert.equal(l.run, 'VCST-1234', `${l.kind} carries it too`);
  }, { KB_RUN: 'VCST-1234' });

  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    assert.ok(!('run' in (await linesOf(env))[0]), 'absent, not null and not an empty string');
  });
});

test('the run handle is never parsed — a ticket, a PR, a URL and a sentence all survive verbatim', async () => {
  // THE WHOLE OF ITS CONTRACT. The moment this tool recognises a ticket it has an opinion about
  // what a run is, and the field's entire value is that it has none: only the thing it points AT
  // knows what it means. No shape check, no case fold.
  //
  // IT USED TO ASSERT NO LENGTH BOUND EITHER, with `'x'.repeat(300)` in the list below, and that
  // was the promise F1 struck out (PLAN §22.3): the handle is read straight out of the environment
  // into a PUBLIC, APPEND-ONLY file, so "we never truncate" meant a `KB_RUN` holding a pasted
  // command or an expanded variable published whatever it held, once, forever. Not-parsing and
  // not-bounding are different promises, and only the first one was ever worth making. `RUN_MAX` is
  // set clear of every shape this field is FOR — which is what the list below still pins.
  const handles = ['VCST-1234', 'PR#313', 'https://github.com/VirtoCommerce/vc-knowledge/pull/313',
    'claude/kb-v1-core', 'sprint 26-18 — configurable products'];
  for (const handle of handles) {
    assert.ok(handle.length <= RUN_MAX, `${handle} must fit the bound, or the bound is set wrong`);
    // eslint-disable-next-line no-await-in-loop
    await withQueue(async (env) => {
      await ask(ANSWERED, opened(), { env, via: 'cli' });
      assert.equal((await linesOf(env))[0].run, handle);
    }, { KB_RUN: handle });
  }
});

test('a run handle of pure whitespace records nothing — an operator who meant to say nothing', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    assert.ok(!('run' in (await linesOf(env))[0]));
  }, { KB_RUN: '   ' });
});

test('the topic rides on every verb an agent calls, and joins an ask to its capture', async () => {
  // THE ACCEPTANCE CRITERION, as an assertion: a unit of work is an ask and the capture that
  // followed it, and the two are only joinable if both lines carry the same handle and the same
  // topic. Before this field the join key was the SESSION, which is exactly the unit this whole
  // change exists to say is not one.
  await withQueue(async (env) => {
    const TOPIC = 'configurable product checkout';
    await ask(MISSED_COLD, opened(), { env, via: 'mcp', topic: TOPIC });
    await capture({
      subject: 'a fact found after the miss',
      question: 'what happens to a saved filter on sign-out',
      claim: 'It is dropped.',
      deployment: 'vcst_qa',
      anchors: ['/account/filters'],
      scope: ['surface=storefront-ui'],
    }, opened(), { env, via: 'mcp', topic: TOPIC });
    const [askLine, capLine] = await linesOf(env);
    assert.equal(askLine.kind, 'ask');
    assert.equal(capLine.kind, 'capture');
    assert.equal(askLine.topic, TOPIC);
    assert.equal(capLine.topic, TOPIC);
    assert.equal(askLine.run, capLine.run, 'and the run handle joins them too');
    assert.equal(askLine.run, 'VCST-5678');
  }, { KB_RUN: 'VCST-5678' });
});

test('a session can change topic mid-run, and the lines say so', async () => {
  // The reason a topic is NOT sticky per session. Typing a second prompt changes the work while the
  // session id does not, so a cached topic would keep labelling new lines with the old work —
  // confidently and wrongly, which is the failure mode this plan keeps refusing. The agent passes
  // it per call, so the change is visible in the log rather than smoothed over.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'mcp', topic: 'B2B member roles' });
    await ask(MISSED_COLD, opened(), { env, via: 'mcp', topic: 'warehouse fleet' });
    const lines = await linesOf(env);
    assert.deepEqual(lines.map((l) => l.topic), ['B2B member roles', 'warehouse fleet']);
  });
});

test('no topic means NO FIELD — including the valueless-flag boolean the CLI parser produces', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: '' });
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: '   ' });
    // `kb.mjs`'s parser gives a valueless flag the boolean `true`, so `--topic --json` would
    // otherwise publish `topic: "true"` — the same trap `deployment` is pinned against.
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: true });
    for (const line of await linesOf(env)) assert.ok(!('topic' in line), 'absent beats invented');
  });
});

test('an over-long topic is CUT IN CODE, deterministically, so the join survives it', async () => {
  // THE CAP IS A §7 BOUNDARY, and §7 boundaries do not live in a tool description — a description
  // is advice. `TOPIC_MAX` is imported rather than typed here: a transcribed constant is correct
  // exactly once (`.claude/rules/test-data.md`, GOLDEN RULE).
  //
  // TRUNCATED AND NOT DROPPED, which is where this field departs from `stand()`. `stand()` drops
  // because there is no correct value to record and a guess would be somebody else's fact; here the
  // agent HAS said what the work was and the only defect is length. Truncation is deterministic, so
  // two calls passing the same over-long topic still land on the same string and still join —
  // dropping would break that silently, at the one moment the field was most needed.
  const LONG = 'a full sentence describing what the agent believes it is doing right now, at length';
  assert.ok(LONG.length > TOPIC_MAX, 'the fixture must actually exceed the cap');
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: LONG });
    await ask(MISSED_COLD, opened(), { env, via: 'cli', topic: LONG });
    const lines = await linesOf(env);
    for (const l of lines) assert.ok(l.topic.length <= TOPIC_MAX, `cut to ${TOPIC_MAX}`);
    assert.equal(lines[0].topic, lines[1].topic, 'same input, same output — the join still holds');
    assert.equal(lines[0].topic, LONG.slice(0, TOPIC_MAX).trim());
  });

  // And a topic whose cut lands on a space does not publish the trailing one: a key with invisible
  // characters in it is a key two readers can disagree about.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: `${'x'.repeat(TOPIC_MAX - 1)} tail` });
    assert.equal((await linesOf(env))[0].topic, 'x'.repeat(TOPIC_MAX - 1));
  });
});

test('both doors put both fields on the line, because both go through one core', async () => {
  // A divergence here would mean two logs with different shapes, which is the thing having one core
  // is for — the same assertion `deployment` and `who` are pinned by.
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: 'B2B member roles' });
    await ask(ANSWERED, opened(), { env, via: 'mcp', call: 'toolu_01Fy89fmgM4sCT11S7dAyshH', topic: 'B2B member roles' });
    const [cli, mcp] = await linesOf(env);
    assert.equal(cli.topic, mcp.topic);
    assert.equal(cli.run, mcp.run);
    assert.deepEqual(Object.keys(mcp).filter((k) => k !== 'call'), Object.keys(cli));
  }, { KB_RUN: 'PR#313' });
});

test('the stamped tail is run then who, and a topic sits among the verb’s own fields', async () => {
  // KEY ORDER, pinned because it is the one thing two doors can quietly disagree about, and because
  // the older assertion said only "who is last" — which stops being a statement about ordering the
  // moment a second stamped field exists. `topic` is a VERB's field and sits among them; `run` and
  // `who` are stamped afterwards by the single writer, in that order.
  await withKnownWho(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli', topic: 'B2B member roles' });
    const [line] = await linesOf(env);
    const keys = Object.keys(line);
    assert.deepEqual(keys.slice(-2), ['run', 'who']);
    assert.ok(keys.indexOf('topic') < keys.indexOf('run'), 'a topic is the verb’s business');
    assert.equal(line.run, 'REL-9');
  }, { extraEnv: { KB_RUN: 'REL-9' } });
});
