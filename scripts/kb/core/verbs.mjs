// The v1 verb surface: ask, show, capture, confirm, dispute, stat (PLAN §4).
//
// Every verb takes an already-opened base and returns `{state, exit, ...}`; the CLI prints it and
// exits. None of them knows whether the reader behind it is a directory or a network, which is the
// seam's entire purpose.
//
// In THIS session `capture`/`confirm`/`dispute` only QUEUE. Nothing is sent anywhere -- the push
// (Git Data API, blobs -> tree -> commit -> ref) is a later session, and the queue is already the
// durable record it will read.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { mintId } from './canonical.mjs';
import { parseEntry } from './frontmatter.mjs';
import { anchorProblems, neighbours } from './coordinates.mjs';
import { findDuplicate, identityKey, refusalMessage } from './identity.mjs';
import { buildIndex, buildRow, countEvidence, entryPath } from './index-build.mjs';
import { loadIndex, normalizeScope, retrievable } from './index-load.mjs';
import { log, pendingMutations, queueDir, readQueue, sessionId } from './queue.mjs';
import { cachedWho } from './who.mjs';
import { RANKER, rank, rankNeighbours, relatedTo } from './rank.mjs';

// ── Trust, as it is shown ─────────────────────────────────────────────────────────────────────
//
// The confirmation count is COMPUTED from `evidence[]`, never declared (PLAN §12 rule 5) -- a
// declared count is a second copy of something that already has a home. The index row carries a
// precomputed `trust` so ranking need not open the entry; once the body IS open, the count is
// recomputed from the evidence and the row is only a cross-check. The two disagreeing is index
// drift, which is worth saying out loud rather than silently preferring one.
//
// The thresholds are a starting point, not a finding. The log will say whether they are the right
// places to cut.
export function trustOf(evidence = []) {
  const supporting = evidence.filter((e) => !e.contradicts);
  // The COUNTS come from index-build, which is also what writes them into the row -- so `ask`'s
  // drift check compares one implementation against itself rather than against a second opinion.
  const { trust: confirmations, disputed } = countEvidence(evidence);
  const parties = new Set(supporting.map((e) => e.by ?? e.deployment ?? 'unknown')).size;
  const label = disputed ? 'DISPUTED'
    : confirmations >= 3 ? 'well attested'
      : confirmations === 2 ? 'corroborated'
        : confirmations === 1 ? 'single observation'
          : 'unattested';
  return { label, confirmations, disputed, parties };
}

/**
 * Everything a reader needs to weigh a hit, assembled from the entry's own frontmatter.
 *
 * When the body did NOT arrive there is no `evidence[]` to compute from, and computing anyway
 * yields "0 confirmations" for an entry the index says has four -- a confident understatement,
 * which is the worst direction for a trust label to be wrong in. So an unavailable body reports
 * the index's own count, says it is provisional, and raises no drift: the two numbers were never
 * compared, so they cannot be said to disagree.
 */
function describeHit(hit, parsed, { unavailable = null } = {}) {
  const evidence = parsed?.data?.evidence ?? [];
  const trust = unavailable
    ? { label: 'unread', confirmations: hit.row.trust, disputed: hit.row.disputed, parties: 0, provisional: true }
    : trustOf(evidence);
  return {
    id: hit.row.id,
    subject: hit.row.subject,
    path: hit.row.path,
    score: hit.score,
    matchedOn: { tokens: hit.overlap, anchors: hit.anchors },
    trust,
    // Provenance, entry by entry: who saw it, where, and when. The three things `cat` cannot print
    // and whose absence the bypass measurement is about.
    provenance: evidence.map((e) => ({
      method: e.method ?? 'observation',
      deployment: e.deployment ?? null,
      at: e.at ?? null,
      by: e.by ?? null,
      contradicts: Boolean(e.contradicts),
      note: e.note ?? null,
    })),
    indexTrust: hit.row.trust,
    indexDrift: !unavailable && hit.row.trust !== trust.confirmations
      ? `index says trust ${hit.row.trust}, evidence[] has ${trust.confirmations} — run \`kb reindex\``
      : null,
    body: parsed?.body?.trim() ?? null,
    unavailable: null,
  };
}

// ── What a line records about the CALL, and what it deliberately does not ─────────────────────
//
// A log field is cheap to add and effectively impossible to remove: the log is public, it is
// append-only, and old lines can never be backfilled. So the bar is A QUESTION SOMEBODY HAS NOW,
// not "might be handy one day". Three fields clear it here.
//
//   `rank`  the RANKER VERSION, not a position -- the value is a name (`floor-1`) precisely so it
//           cannot be misread as one. This session is the first ranker change, and every line
//           already in the base came from the no-floor ranker; without a marker every future
//           before/after comparison silently mixes two systems (PLAN §14.1). IT GOES ON `ask`
//           LINES ONLY, because nothing else ranks: a ranker version on a `capture` would be a
//           field with no question behind it, which is the thing this list exists to refuse.
//   `via`   which door was used, `mcp` or `cli`. PLAN §4 claims the CLI is load-bearing for three
//           reasons; a month of these says whether that is true in practice or whether it has
//           become test and CI infrastructure only, which decides whether two doors are worth
//           maintaining. This one goes on every line a door writes. Omitted rather than guessed
//           when the caller did not say: a field that defaults is a field that lies.
//   `deployment`
//           WHICH STAND the question was about, when the caller names one. `capture`, `confirm`
//           and `dispute` have always carried it and `ask` had no such parameter at all, so the
//           knowledge plane knew which deployment it was talking about and the demand plane did
//           not. Measured on the published base on 2026-09-21: 148 of 182 observations come from
//           `vcptcore_stable` and 33 from `vcst_qa`, and the only dispute this base has ever had
//           (KB-27B4CD10) turned entirely on the difference between those two stands. A demand log
//           that cannot separate them can show neither fact.
//
//           OPTIONAL, AND NEVER DEFAULTED, which is the whole of its safety. There is no source of
//           truth for a stand's canonical name, and both candidates were checked rather than
//           assumed. `TEST_ENV` is not set in the process at all (`node -e "process.env.TEST_ENV"`
//           -> undefined; the MCP server is registered with no `env` block and inherits the
//           session's), and its loader default `vcst` is not the string the base uses for that
//           stand -- `vcst_qa`, 33 evidence lines against 1. `BACK_URL`'s host would map both live
//           stands correctly and is equally absent from the process, and it invents
//           `qa_admin_leo` for the `leo` env, which is the plausible-looking wrong value this
//           whole plan keeps catching. The decisive one needs neither measurement: the server's
//           environment is fixed when the session starts, while the stand is a property of the
//           observation the question is ABOUT, and one process cannot know the other. So a default
//           would print this process's guess as the agent's fact. Absent beats plausible.
//   `who`   WHO WROTE THE LINE — the configured token's GitHub handle. Not listed among the
//           per-verb fields below because NO VERB WRITES IT: it is stamped by `queue.mjs`'s single
//           writer, like `synthetic`, so no verb can forget it and no verb can fake it. Reading
//           the published base as an outsider, nothing said who produced a line; the identity WAS
//           recoverable from the commit author and that is not enough, because the report reads
//           log FILES over HTTP and — the real reason — the pusher is not always the asker. The
//           full argument, the privacy boundary (a handle is an id and is already in every commit
//           of this public base; an email, a path or a machine name is not) and the trap the field
//           carries (it names whose TOKEN is configured, not who is at the keyboard) are in
//           `core/who.mjs`.
//
// WHAT MUST NOT BE ADDED HERE, recorded so it is not proposed again:
//
//   * ENTRY BODIES OR CLAIM TEXT. PLAN §7: ids and subjects only. Claim prose in a second place is
//     claim prose that can drift from the entry.
//   * ANYTHING THE REPORT CAN DERIVE -- re-ask counts, repeat frequency, whether a capture followed
//     a miss. One file per session makes all of it computable, and a field for a derivable fact is
//     a second copy that can disagree with the first.
//   * WHO CALLED IT -- main agent or subagent. STILL not recorded, and still not knowable here:
//     the server sees a request, never the conversation around it. `parent_tool_use_id` is not in
//     the request, exactly as this note said.
//
//     BUT THE NOTE OVERREACHED, and the correction is the useful half. "The request carries
//     nothing identifying" was never checked -- it was inferred from one absent field. Dumping a
//     real request on 2026-09-19 (`KB_RAW_DUMP`) found
//     `_meta["claudecode/toolUseId"]`, the caller's OWN tool-use id. That is not a proxy for the
//     answer, which is what this note rightly refused; it is the JOIN KEY to it, because every
//     `tool_use` in the transcript carries `isSidechain` and `agentName`. So it is recorded as
//     `call`, and "was that a subagent?" is now a lookup instead of the elimination argument it
//     took that morning -- seven calls in a session's log against zero in the main thread.
//
//     The lesson is worth more than the field: "we cannot see X" and "we never looked" wear the
//     same clothes, and this file asserted the first for two sessions while meaning the second.
//   * FREE TEXT FROM THE AGENT about why it asked. Unreliable, and the log is public.
//   * THE DEPLOYMENT on `ask` -- REVERSED 2026-09-21, and it is now listed above. The refusal
//     read: "`capture` records it, where it is a property of the observation rather than of the
//     question". The premise is true and the conclusion does not follow -- a question is asked
//     WHILE working on a stand, and the base's only dispute was two stands disagreeing. What the
//     refusal got right is kept whole: the field is REPORTED, never derived.
const DOORS = new Set(['mcp', 'cli']);
/**
 * `via` is WHICH DOOR; `call` is WHICH CALL — the caller's own tool-use id, when the client sends
 * one (see `callIdOf` in mcp.mjs). It is the join key that makes "was this a subagent?" a lookup in
 * the transcript rather than the elimination argument it took on 2026-09-19. Opaque, no content,
 * and omitted rather than invented when the client offers nothing.
 */
const door = (via, call) => ({
  ...(DOORS.has(via) ? { via } : {}),
  ...(typeof call === 'string' && call ? { call } : {}),
});
/**
 * WHICH STAND the question was about, when the caller names one -- and nothing at all when it
 * does not. Trimmed, because an argument of whitespace is a caller that meant to say nothing, and
 * `deployment: ""` in the log would read as a stand whose name is the empty string.
 *
 * The value is recorded VERBATIM and is never normalised. The base already holds `vcst` once
 * against `vcst_qa` 33 times, so a normaliser has a real fragmentation to argue for -- and it
 * would be a transcribed mapping with no source of truth behind it, which is the same defect
 * wearing a tidier name. What the log needs is what the caller believed; the disagreement is a
 * finding, not something to iron out on the way in.
 *
 * A STRING OR NOTHING, which is not defensive typing. `kb.mjs`'s parser hands a flag given
 * without a value the boolean `true`, so `kb ask "q" --deployment --json` would otherwise publish
 * `deployment: "true"` -- a stand name that is not a stand, indistinguishable in the log from one
 * an agent meant. The typed guard is the same one `door()` puts on `call`, for the same reason.
 */
const stand = (deployment) => {
  const d = typeof deployment === 'string' ? deployment.trim() : '';
  return d ? { deployment: d } : {};
};
const ranked = ({ via, call, deployment }) => ({ rank: RANKER, ...door(via, call), ...stand(deployment) });

/** Two decimal places: `nearMiss.coverage` is read by a human, and 0.45454545 is not. */
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Open the base and load the index; every read verb starts here. */
async function catalogue(opened) {
  if (!opened.reader) return { state: 'no-base', why: opened.why };
  return loadIndex(opened.reader);
}

// ── ask ───────────────────────────────────────────────────────────────────────────────────────

export async function ask(question, opened, { env = process.env, top = 3, via = null, call = null, deployment = null } = {}) {
  const started = Date.now();
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'ask', q: question, state: cat.state, why: cat.why, ...ranked({ via, call, deployment }) }, { env });
    return { state: cat.state, why: cat.why, hits: [] };
  }

  const { hits, nearMiss } = rank(question, retrievable(cat.rows), { top });
  if (!hits.length) {
    // THE MISS LINE, which since the floor landed is a line that can actually occur (PLAN §14.1).
    // It carries the best REJECTED candidate: a miss that keeps naming the same near-miss is
    // either a floor set too high or an entry phrased unlike the way anyone asks -- and neither
    // is visible from a bare "matched: []".
    await log({
      kind: 'ask',
      q: question,
      matched: [],
      state: 'miss',
      ...(nearMiss ? { nearMiss: { id: nearMiss.row.id, score: nearMiss.score, coverage: round2(nearMiss.coverage) } } : {}),
      ms: Date.now() - started,
      ...ranked({ via, call, deployment }),
    }, { env });
    return { state: 'miss', hits: [], nearMiss, rows: cat.rows.length };
  }

  // Bodies in parallel (PLAN §3.1 step 3).
  const described = await Promise.all(hits.map(async (hit) => {
    const read = await opened.reader.readEntry(hit.row.path);
    if (!read.ok) {
      // GRACEFUL DEGRADATION (PLAN §3.5): the base HAS an entry on this and we can still say so
      // from the index alone. Strictly better than silence, and it cannot be mistaken for a miss.
      const unavailable = read.reason === 'missing'
        ? `the index names ${hit.row.path}, which is not in the base — drift; run \`kb reindex\``
        : `body unavailable (${read.detail})`;
      return { ...describeHit(hit, null, { unavailable }), unavailable, unavailableReason: read.reason };
    }
    try {
      return describeHit(hit, parseEntry(read.text, hit.row.path));
    } catch (err) {
      const unavailable = `unparseable entry: ${err.message}`;
      return { ...describeHit(hit, null, { unavailable }), unavailable, unavailableReason: 'missing' };
    }
  }));

  const opened_ = described.filter((h) => !h.unavailable);
  // At least one body arrived -> the question is answered, with the broken ones flagged. None
  // arrived -> the agent got nothing, and the honest state is "conclude nothing": exit 1 would say
  // the base holds nothing, which is the opposite of what the index just told us, and would send
  // the agent off to capture a fact that already exists.
  const state = opened_.length ? 'answer' : 'unreachable';
  await log({
    kind: 'ask',
    q: question,
    matched: described.map((h) => h.id),
    // `scores` is POSITIONAL against `matched`, so the winning score is scores[0] and there is no
    // separate `score` field. A field for a fact another field already carries is a second copy
    // that can disagree with the first -- the rule PLAN §2 applies to the confirmation count.
    scores: described.map((h) => h.score),
    // WHY each hit matched, positional against `matched`. A closed vocabulary — never prose.
    //
    // This is the field that makes PLAN §17.4(3) measurable from the log instead of from a replay.
    // The base's strongest signal is the anchor, and it fires on 0 of 91 of the entries' OWN
    // questions because nobody writes `Mutations.changeOrganizationContactRole` in a sentence —
    // while firing 3-4 times per session on the URLs an agent types into its tools. The renderer
    // has always computed this and SHOWN it to the agent ("matched on: anchor …; words …") and
    // then thrown it away. A month of these answers, from real traffic, whether the coordinate
    // door is reachable at all by the way people actually ask.
    matchedBy: described.map((h) => {
      const byAnchor = h.matchedOn.anchors.length > 0;
      const byWords = h.matchedOn.tokens.length > 0;
      return byAnchor && byWords ? 'both' : byAnchor ? 'anchor' : 'words';
    }),
    // WHAT THE AGENT WAS TOLD about trust, at the moment it was told. Positional, and not
    // derivable later: an entry's label moves as evidence accrues, so reading today's entry does
    // not reconstruct what a reader saw last week. §14.2a is the reason this matters — the label
    // was overstating independence for ~20% of the corpus, and no log line recorded what any
    // agent had actually been shown while that was true.
    trustShown: described.map((h) => h.trust.label),
    opened: opened_.map((h) => h.id),
    state,
    ...(state === 'unreachable' ? { why: described[0]?.unavailable ?? 'no body could be read' } : {}),
    ms: Date.now() - started,
    ...ranked({ via, call, deployment }),
  }, { env });

  return { state, hits: described, rows: cat.rows.length };
}

// ── show ──────────────────────────────────────────────────────────────────────────────────────

export async function show(id, opened, { env = process.env, via = null, call = null } = {}) {
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'show', id, state: cat.state, why: cat.why, ...door(via, call) }, { env });
    return { state: cat.state, why: cat.why };
  }
  // Retired entries are shown. Retrieval will not return one, but a reader holding an id is
  // entitled to see what is behind it -- including that it was retired.
  const row = cat.rows.find((r) => r.id.toUpperCase() === String(id).toUpperCase());
  if (!row) {
    await log({ kind: 'show', id, state: 'miss', ...door(via, call) }, { env });
    return { state: 'miss', why: `${id} is not in this base's index` };
  }
  const read = await opened.reader.readEntry(row.path);
  if (!read.ok) {
    // Both a 404 and a timeout leave the caller without the entry, so both are 'conclude
    // nothing'. What differs is the REMEDY, which is why the message is built separately.
    await log({ kind: 'show', id, state: 'unreachable', why: read.detail, ...door(via, call) }, { env });
    return { state: 'unreachable', row, why: read.reason === 'missing' ? `${row.path} is not in the base — drift; run \`kb reindex\`` : read.detail };
  }
  let parsed;
  try {
    parsed = parseEntry(read.text, row.path);
  } catch (err) {
    await log({ kind: 'show', id, state: 'unreachable', why: err.message, ...door(via, call) }, { env });
    return { state: 'unreachable', row, why: `unparseable entry: ${err.message}` };
  }
  await log({ kind: 'show', id: row.id, state: 'answer', ...door(via, call) }, { env });
  return { state: 'answer', row, entry: parsed.data, body: parsed.body.trim(), trust: trustOf(parsed.data.evidence ?? []) };
}

// ── capture ───────────────────────────────────────────────────────────────────────────────────

const REQUIRED = ['subject', 'question', 'claim', 'deployment'];

/**
 * The `ask` this capture FOLLOWED, as a pointer into the session's own log.
 *
 * Panel 6 answers "did the agent go and find out anyway?" by comparing the captured entry's
 * anchors against what each earlier ask matched -- an inference across lines. This records the
 * link directly, so the panel becomes exact instead of heuristic.
 *
 * TWO THINGS IT IS CAREFUL ABOUT. It stores the preceding ask's `at`, which is a POINTER to a line
 * already in this file, never a copy of the question -- a second copy of a question is a second
 * thing that can disagree with the first. And the name means what it says: `after` is FOLLOWED,
 * not CAUSED BY. An agent may capture something unrelated to the last thing it asked, and a field
 * that claimed causation would be read as evidence of it.
 */
async function precedingAsk({ env }) {
  const { lines } = await readQueue({ env });
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].kind === 'ask' && lines[i].at) return String(lines[i].at);
  }
  return null;
}

/**
 * Every entry THIS SESSION has already opened and read, newest first.
 *
 * THE MEASUREMENT THAT PUT IT HERE. The base's contradiction hint was `relatedTo`, which ranks the
 * corpus by shared vocabulary. Against the three labelled contradiction pairs the corpus records in
 * its own bodies ("This CONTRADICTS KB-…", "This refines the DISPUTED entry KB-…"), that hint
 * surfaced 1 of 4 targets. The motivating miss is not close: KB-133FD544 and the entry its body
 * says it "directly contradicts" share exactly ONE token — `order` — for a coverage of 0.029
 * against a floor of three words. No threshold reaches that, and three different reorderings of the
 * ranked lists were measured before this was written; the best put the target at rank 12 of 25.
 *
 * The reason is structural rather than a tuning error. 45% of the corpus's subjects are 8 words or
 * fewer — the old terse house style — while a capture written today opens with 17 words of
 * identifiers. Old entries and new facts do not share vocabulary by construction, and the entries
 * most likely to have gone stale are precisely the old terse ones.
 *
 * SO THE SIGNAL IS NOT IN THE TEXT. It is in what the agent just did: it asked, it opened four
 * bodies, and 67 seconds later it wrote a fact contradicting one of them. Checked against the same
 * three pairs, "what this session opened before the capture" carries 4 of 4 targets, where the
 * immediately-preceding ask alone carries 2 of 4 — so the union over the session is the one worth
 * having, and `precedingAsk`'s single pointer is not enough.
 *
 * THE COST IS BOUNDED BY THE SESSION AND NOT BY THE BASE, which is what makes this affordable
 * where a ranked list is not. Over the 14 captures in a fortnight of logs: median 3 entries, max 5,
 * and 5 captures where the session had opened nothing at all and this prints nothing.
 *
 * `show` counts as an open and so does every `ask` hit whose body arrived: both put the entry's
 * body in front of the agent, which is the only thing this is asking about. Newest first, because
 * a contradiction is likelier with what was read a minute ago than with what was read at the start.
 */
async function openedThisSession({ env }) {
  const { lines } = await readQueue({ env });
  const out = [];
  const seen = new Set();
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const l = lines[i];
    const ids = l.kind === 'ask' ? (l.opened ?? [])
      : l.kind === 'show' && l.state === 'answer' && l.id ? [l.id]
        : [];
    for (const id of ids) {
      if (typeof id !== 'string' || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function capture(input, opened, { env = process.env, via = null, call = null } = {}) {
  const missing = REQUIRED.filter((f) => !String(input[f] ?? '').trim());
  if (!input.anchors?.length) missing.push('anchor');
  if (missing.length) return { state: 'invalid', why: `capture needs: ${missing.join(', ')}` };

  const problems = anchorProblems(input.anchors);
  if (problems.length) return { state: 'invalid', why: 'unusable anchor(s)', problems };

  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'capture', subject: input.subject, state: cat.state, why: cat.why, ...door(via, call) }, { env });
    return { state: cat.state, why: cat.why };
  }

  const scope = normalizeScope(input.scope);
  if (!scope.length) return { state: 'invalid', why: 'capture needs at least one --scope axis=value (without scope, a storefront fact gets applied to admin)' };

  // Read BEFORE this capture writes its own line, or the lookback finds nothing but itself.
  const after = await precedingAsk({ env });

  // THE DEDUP CHECK. Runs here against the session's index, and AGAIN at push time against the
  // freshly re-read one -- which is what makes it race-free rather than merely likely (PLAN §2).
  const dupe = findDuplicate(cat.rows, { anchors: input.anchors, scope });
  if (dupe) {
    await log({
      kind: 'capture-refused', dupeOf: dupe.row.id, subject: input.subject,
      why: 'anchors+scope', when: 'call', ...(after ? { after } : {}), ...door(via, call),
    }, { env });
    return { state: 'refused', dupeOf: dupe.row, message: refusalMessage(dupe.row) };
  }

  const id = mintId(input.subject);
  const entry = {
    id,
    subject: input.subject,
    plane: input.plane ?? 'experiential',
    question: input.question,
    status: 'active',
    appliesTo: scope.map((s) => {
      const [axis, ...rest] = s.split('=');
      return { axis, value: rest.join('=') };
    }),
    anchors: input.anchors.map((a) => ({ coordinate: typeof a === 'string' ? a : a.coordinate })),
    evidence: [{
      method: input.method ?? 'observation',
      deployment: input.deployment,
      at: new Date().toISOString(),
      by: `session:${sessionId(env)}`,
    }],
  };

  // Shown, never enforced: other entries already anchored at these coordinates. Two entries
  // sharing a coordinate are usually two honest facts about one place -- but the writer is the
  // only party who can notice that one of them contradicts a clause in the other, and only while
  // the page is still open.
  // WHAT THE WRITER ALREADY READ, and it is computed FIRST because it OUTRANKS both lists below.
  //
  // The dedup rule used to run the other way: neighbours were printed, then excluded from the
  // related hint "so one entry is not reported twice". On 2026-09-20 that rule removed the entry a
  // capture's own body said it contradicted from the one list framed as a contradiction warning,
  // leaving it in an unranked 25-line coordinate dump. An entry the agent read minutes ago is the
  // strongest thing either list can say about it, so it is said once, first, and the weaker framings
  // do not repeat it. See `openedThisSession` for the measurement.
  const live = new Set(retrievable(cat.rows).map((r) => r.id));
  const read = (await openedThisSession({ env })).filter((rid) => rid !== id && live.has(rid));
  const readRows = read.map((rid) => cat.rows.find((r) => r.id === rid)).filter(Boolean);

  const alsoHere = rankNeighbours(
    neighbours(cat.rows, input.anchors, { exclude: id }).filter((n) => !read.includes(n.id)),
    `${input.subject} ${input.question}`,
  );

  // And entries this fact may SPEAK TO, which is a different question from where it was observed.
  //
  // `alsoHere` above asks who else stood at this coordinate. That was the whole of PLAN §17.4(6)
  // until 2026-09-19, when it was checked against the pair that motivated it: KB-F78ED1CC's body
  // says in terms that it CONTRADICTS KB-0C163966, and their normalised anchor sets do not
  // intersect at all -- not a near miss, no shared coordinate. Measured across the 91-entry base,
  // the anchor trigger fires on 1 entry and that entry is the wrong one. Anchors record WHERE
  // SOMEBODY STOOD; a contradiction is about WHAT THEY CONCLUDED, and the two coincide less often
  // than the design assumed.
  //
  // So this is keyed on the words instead (`relatedTo`, which carries the measurement). It is
  // computed AFTER the queue write decision and feeds nothing into it: a capture is never blocked,
  // slowed or altered by what comes back, and a base that ranks badly costs the writer a glance.
  // The neighbours already named above are excluded so one entry is not reported twice.
  const related = relatedTo(
    `${input.subject} ${input.question}`,
    retrievable(cat.rows),
    { exclude: [id, ...read, ...alsoHere.hits.map((n) => n.id)] },
  );

  const written = await log({
    kind: 'capture',
    id,
    subject: input.subject,
    // THE QUESTION, not only the subject. The subject is the claim; the question is the RETRIEVAL
    // KEY, and it is the half that decides whether anyone ever finds this entry again. Session 10
    // measured why that distinction is load-bearing: a base subject is a 3-11 token label while
    // the questions live sessions actually write are 12-17 token sentences, so a corpus of
    // subjects can only describe the old house style. Analysing how agents PHRASE things — the
    // whole point of the harvester — needs what they wrote here.
    //
    // Public without hesitation now that clients READ the base and never write to it: every
    // question in this log is written by our own sessions about our own QA stands, which is the
    // same standing `q` on `ask` has always had.
    question: input.question,
    ...(after ? { after } : {}),
    // WHAT was surfaced, not how many. It shipped as a count on 2026-09-19 and was too thin within
    // hours of meeting real traffic: a session was shown three related entries, then DISPUTED one --
    // the first dispute in this base's history -- and the log could not say whether the entry it
    // disputed was among the three. The count answered "does the hint put anything in front of a
    // writer"; it could not answer "did the writer act on what it was shown", which is the only
    // question that decides whether this feature earns its place.
    //
    // Ids, so §7 holds unchanged -- ids and subjects only, never prose. The count is dropped rather
    // than kept alongside: a length is derivable from the list, and §7's rule against a second copy
    // of a derivable fact is the same rule that governs the confirmation count in §2.
    //
    // An empty array still goes on every queued capture. `[]` means the hint ran and found nothing,
    // which is what makes the non-empty rows mean anything.
    related: related.hits.map((h) => h.row.id),
    // THE ENTRIES THIS CAPTURE WAS WARNED ABOUT, by the same argument that turned `related` from a
    // count into a list of ids: the question worth answering is not "did the hint fire" but "did
    // the writer act on what it was shown", and only ids let a later dispute be matched back to the
    // line that offered it. An empty array still ships — `[]` says the session had opened nothing,
    // which was true of 5 of the 14 captures in the fortnight this was measured on, and is a
    // different fact from a line written before the field existed.
    read,
    ...door(via, call),
    // The PAYLOAD the pusher needs. The public log line is this minus `payload` (see toLogLine):
    // a log line carries ids and subjects only, but the queue must carry what it is queueing.
    payload: { entry, body: String(input.claim).trim(), key: identityKey({ anchors: input.anchors, scope }) },
  }, { env });

  return { state: 'queued', id, entry, queuedTo: written.path, logWrite: written, alsoHere, related, read: readRows };
}

// ── confirm / dispute ─────────────────────────────────────────────────────────────────────────

async function appendEvidence(kind, id, input, opened, { env = process.env, via = null, call = null } = {}) {
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind, id, state: cat.state, why: cat.why, ...door(via, call) }, { env });
    return { state: cat.state, why: cat.why };
  }
  const row = cat.rows.find((r) => r.id.toUpperCase() === String(id).toUpperCase());
  if (!row) return { state: 'invalid', why: `${id} is not in this base's index` };
  if (!String(input.deployment ?? '').trim()) return { state: 'invalid', why: `${kind} needs --deployment <env>` };
  if (kind === 'dispute' && !String(input.saw ?? '').trim()) return { state: 'invalid', why: 'dispute needs --saw "<what you saw instead>"' };

  const item = {
    method: input.method ?? 'observation',
    deployment: input.deployment,
    at: new Date().toISOString(),
    by: `session:${sessionId(env)}`,
    ...(kind === 'dispute' ? { contradicts: true, note: input.saw } : input.note ? { note: input.note } : {}),
  };

  const written = await log({
    kind,
    id: row.id,
    deployment: input.deployment,
    // A dispute's `saw` used to be HERE, in the public line, and it should not have been. §7 is
    // "ids and subjects only, never prose", and this was hundreds of characters of free text from
    // an agent — found 2026-09-19 by reading a published line rather than the rule. Two reasons it
    // goes, and the second is the one that generalises:
    //
    //   * It is a SECOND COPY. The same text is already the evidence item's `note` on the entry
    //     itself, where it is reviewed as part of the entry. §7's rule against duplicating a
    //     derivable fact is the rule PLAN §2 applies to the confirmation count.
    //   * Free prose is the one shape `secret-gate` cannot protect. It scans VALUES — tokens,
    //     passwords, paths it knows — and a sentence an agent composed is none of those. Session 3
    //     found operator paths and usernames heading for this log by exactly that route.
    //
    // It is still in `payload` (local, never published) and still on the entry. Nothing is lost.
    ...(kind === 'confirm' ? { trust: row.trust + 1 } : {}),
    ...door(via, call),
    payload: { id: row.id, path: row.path, item },
  }, { env });

  // A dispute NEVER auto-retires anything. One contradicting observation against four
  // confirmations is not a deletion; it is a flag, and a human decides. Automatic retirement on a
  // single dissent would let one bad observation delete four good ones.
  return { state: 'queued', id: row.id, row, item, queuedTo: written.path, logWrite: written };
}

export const confirm = (id, input, opened, opts) => appendEvidence('confirm', id, input, opened, opts);
export const dispute = (id, input, opened, opts) => appendEvidence('dispute', id, input, opened, opts);

// ── stat ──────────────────────────────────────────────────────────────────────────────────────

/** Not logged: an operator looking at the tool is not an agent using the base (PLAN §7). */
export async function stat(opened, { env = process.env } = {}) {
  const queue = await readQueue({ env });
  const out = {
    // `stat` NAMES THE BASE AND HOW IT WAS CHOSEN -- both, always (PLAN §12 rule 5).
    base: opened.locator,
    how: opened.how,
    reader: opened.reader?.kind ?? null,
    readerWhy: opened.why ?? null,
    session: sessionId(env),
    // WHO this process's lines will be attributed to -- read from the cache, never looked up
    // here: `stat` is an operator looking at the tool, and it reports state rather than making
    // any. A door has already resolved it by the time this runs (`resolveWho` in kb.mjs).
    who: cachedWho({ dir: queueDir(env), env }),
    queue: queue.path,
    queueDepth: queue.lines.length,
    pending: pendingMutations(queue.lines),
    malformedQueueLines: queue.malformed,
  };
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') return { ...out, state: cat.state, why: cat.why };
  return {
    ...out,
    state: 'answer',
    indexes: cat.indexes,
    entries: cat.rows.length,
    active: retrievable(cat.rows).length,
    schema: cat.manifest.schema ?? null,
  };
}

// ── reindex ───────────────────────────────────────────────────────────────────────────────────
//
// THE REPAIR VERB (PLAN §2). It rebuilds `index.json` from every entry, and it is the only
// operation that reads the whole corpus. In normal weeks it never runs: the index is written by
// whoever writes an entry, in the same commit, and nobody else ever. It exists for the two moments
// when that invariant has already been broken -- a push that half-landed, or somebody editing an
// entry on GitHub -- and for the three drift messages `ask` and `show` print, which named this verb
// before it existed.
//
// IT IS LOCAL-ONLY, and that is not a limitation being apologised for. `reindex` has to enumerate
// `entries/` and then WRITE the index; `raw` is a CDN that can do neither, and the API path that
// could is the push, which is authenticated, rate-limited and a later session's business. The
// operator repairing a base has a checkout in front of them -- that is what "after a botched push"
// means -- so this runs against one and says so plainly when handed a URL.

/**
 * Rebuild every index the manifest declares, from the entries actually present.
 *
 * Reports what MOVED rather than just succeeding, because a repair whose output nobody looks at is
 * indistinguishable from one that quietly made things worse: a row that vanished is either the
 * drift being fixed or an entry that failed to parse, and only the operator can tell which.
 */
/**
 * A base locator that is safe to put in a PUBLIC log.
 *
 * A remote base is public by definition and is what a reader of the log actually needs. A LOCAL
 * base is a path on one machine: useless to every other reader and carrying the operator's home
 * directory and username, which the secret gate cannot catch because that gate scans for the
 * VALUES of known credentials, not for personal data. So a local base is reported as a category.
 */
export function publicLocator(locator) {
  const s = String(locator ?? '');
  return /^https?:\/\//i.test(s) ? s : '(local checkout)';
}

export async function reindex(opened, { env = process.env, write = true, generated } = {}) {
  if (!opened.reader) return { state: 'no-base', why: opened.why };
  if (typeof opened.reader.listEntries !== 'function') {
    return {
      state: 'no-base',
      why: `reindex rebuilds the index from every entry and writes it back, which ${opened.locator} `
        + 'cannot do — it is a read-only CDN base. Point it at a checkout: '
        + 'kb reindex --base <path-to-clone>',
    };
  }

  const cat = await catalogue(opened);
  if (cat.state !== 'ok') return { state: cat.state, why: cat.why };

  const listed = await opened.reader.listEntries();
  if (!listed.ok) return { state: 'unreachable', why: `could not list entries/: ${listed.detail}` };

  // plane -> index file, inverted from the manifest. An entry whose plane nothing declares has
  // nowhere to be filed, and silently dropping it is how an index starts lying.
  const byPlane = new Map(Object.entries(cat.manifest.indexes).map(([plane, file]) => [plane, String(file)]));
  const rowsFor = new Map([...new Set(byPlane.values())].map((file) => [file, []]));

  const problems = [];
  const before = new Map(cat.rows.map((r) => [r.id, r]));
  const seen = new Set();

  for (const path of listed.paths) {
    const read = await opened.reader.readEntry(path);
    if (!read.ok) { problems.push({ path, why: `unreadable: ${read.detail}` }); continue; }
    let data;
    try { ({ data } = parseEntry(read.text, path)); } catch (err) { problems.push({ path, why: err.message }); continue; }

    // The id is derived from the subject, so a file whose name disagrees with its own frontmatter
    // is one of two entries wearing one address -- never something to guess about.
    const expected = entryPath(String(data.id));
    if (expected !== path) { problems.push({ path, why: `frontmatter id ${data.id} wants ${expected}` }); continue; }
    if (seen.has(data.id)) { problems.push({ path, why: `duplicate id ${data.id}` }); continue; }

    const file = byPlane.get(String(data.plane ?? 'experiential'));
    if (!file) { problems.push({ path, why: `plane "${data.plane}" is not in kb.json indexes` }); continue; }

    seen.add(data.id);
    rowsFor.get(file).push(buildRow(data, path));
  }

  const written = [];
  for (const [file, rows] of rowsFor) {
    const built = buildIndex(rows, generated ? { generated } : {});
    if (write) await writeFile(join(opened.reader.locator, file), `${JSON.stringify(built, null, 2)}\n`, 'utf8');
    written.push({ file, count: built.count });
  }

  const added = [...seen].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !seen.has(id)).sort();
  const retrusted = [...rowsFor.values()].flat()
    .filter((r) => before.has(r.id) && (before.get(r.id).trust !== r.trust || before.get(r.id).disputed !== r.disputed))
    .map((r) => ({ id: r.id, was: before.get(r.id).trust, now: r.trust }));

  // `base` is CATEGORISED, never logged verbatim. The log is a file in a PUBLIC repository (PLAN
  // §7), and `reindex` is the one verb that must be pointed at a local checkout -- so the verbatim
  // locator is a filesystem path carrying the operator's home directory and username. The secret
  // gate cannot catch it: that is a VALUE scan for credentials read out of `.env.local`, and a
  // home-directory path is not a credential. Measured: three queued lines read
  // `C:\Users\<name>\AppData\Local\Temp\dbg-6eY7Sr`. A remote base is public by
  // definition and stays verbatim, because WHICH base was reindexed is the only part a reader of
  // the log can use -- one machine's checkout path is not.
  await log({ kind: 'reindex', base: publicLocator(opened.locator), entries: seen.size, added: added.length,
    removed: removed.length, retrusted: retrusted.length, problems: problems.length }, { env });

  return { state: 'answer', written, entries: seen.size, indexed: [...rowsFor.keys()],
    added, removed, retrusted, problems, wrote: write };
}

/**
 * The public form of a queued line: everything except the push payload.
 *
 * PLAN §7 says a log line carries ids and subjects only and never an entry body, and the queue has
 * to carry the body or there is nothing to push. Both hold, because they are two artifacts: this
 * strips the local queue down to the line that goes into the PUBLIC log. The pusher calls it.
 */
export function toLogLine(line) {
  const { payload, ...rest } = line;
  return rest;
}
