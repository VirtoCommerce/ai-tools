// The report's ANALYSIS — pure functions over log lines, no network, no rendering (PLAN §8).
//
// Split out from the fetching and the HTML deliberately, and the reason is the same one that gave
// `core/reader.mjs` its seam: the only part of the report that can be WRONG in a way nobody
// notices is the arithmetic, and arithmetic behind a network call is arithmetic nobody tests. Every
// panel below is a function from `{lines, rows}` to a plain object, and the unit tests call them
// with hand-written lines.
//
// THE REPORT READS LOGS, NEVER ENTRIES (PLAN §8). One exception, and it is not really one: the
// INDEX is read — for anchors and subjects. That is a single file the ask path already fetches, not
// 91 entry bodies, and it is what makes panel 6 computable with no new log field.
//
// WHAT THE REPORT MUST NOT DO, stated once because it is the failure mode with teeth: it must
// never present "I could not read the logs" as "nothing happened". That is §3.5's confusion
// relocated into the report, and it is the reason `unreachable` asks get their own panel row rather
// than being folded into misses, and the reason a cache-rendered report carries a banner.

import { MIN_COVERAGE, MIN_WORDS } from './rank.mjs';

/** Log kinds this analysis knows about. Anything else is counted and otherwise ignored. */
export const KNOWN_KINDS = Object.freeze([
  'ask', 'show', 'capture', 'capture-refused', 'confirm', 'dispute', 'flush', 'reindex', 'redacted',
]);

// ── the numbers §15 is judged by, DECLARED HERE AND NOT PASSED IN ──────────────────────────────
//
// PLAN §15.3: "thresholds, declared BEFORE the run, and not re-cut after". A threshold supplied on
// the command line is a threshold that can be moved after seeing the result, which is the one thing
// §13.5 earned the hard way and §15 exists to prevent. They are constants, in the file that
// computes against them, with their derivation attached.
//
// The floor itself is NOT restated here — `MIN_COVERAGE`/`MIN_WORDS` are imported from `rank.mjs`,
// which is the thing the report is measuring. A transcribed copy would be correct exactly once and
// would then disagree with the ranker silently, which is the failure this report exists to catch.

/**
 * A near-miss at or above this coverage is one a HUMAN must read (PLAN §15.3).
 *
 * §14.4's derivation put the cut at 0.50 with the nearest surviving BAD hit at 0.45 — one word in
 * an eleven-token question below the line. So 0.45 is not a second floor; it is the error bar on
 * the first one. Anything appearing at or above it is either a question the floor wrongly refused,
 * or an entry phrased so unlike the way people ask that it is invisible — and the log cannot tell
 * which. A human can.
 */
export const NEAR_MISS_REVIEW = 0.45;

/** PLAN §11's existing trigger, reused rather than invented for the occasion (PLAN §15.3). */
export const UNHELPFUL_MAX = 0.15;

/**
 * The n below which an ABSENCE proves nothing — the guard against §14.1's mistake.
 *
 * "A 0% unhelpful rate over two asks is not a pass." Derived once, from the rule of three: with
 * zero events observed in n trials, the 95% upper bound on the true rate is ~3/n, so a clean run
 * only excludes a rate above `UNHELPFUL_MAX` once 3/n ≤ 0.15, i.e. **n ≥ 20**. Below that, "we saw
 * none" and "the rate is under the trigger" are different statements and the report must not print
 * the second when it only has the first.
 *
 * ONE constant, applied to every row whose verdict is an absence claim — the unhelpful rate, the
 * absence of an in-band near-miss, and the absence of a capture after a miss. A PRESENCE needs no
 * such floor: one capture following a miss proves exit 1 is not a dead end, whatever n is.
 *
 * It is deliberately strict, and on a small window it will report NOT ENOUGH DATA on all three
 * rows. That is the correct output, not a failure of the measurement.
 */
export const MIN_SAMPLE = 20;

/** The three §15.3 thresholds as one frozen object — what the verdict block judged against. */
export const THRESHOLDS = Object.freeze({
  unhelpfulRate: UNHELPFUL_MAX,
  nearMissReview: NEAR_MISS_REVIEW,
  capturesAfterMiss: 1,
  minSample: MIN_SAMPLE,
  floorCoverage: MIN_COVERAGE,
  floorWords: MIN_WORDS,
});

/**
 * Parse one session's JSONL into lines tagged with where they came from.
 *
 * A torn last line is DROPPED AND COUNTED, never thrown on: a log file is written by a different
 * process than the one reading it, and a push interrupted mid-write must cost one line, not the
 * whole report. The count surfaces in the header, so a base that is losing lines says so.
 */
export function parseLogFile(text, { path = '', session = '' } = {}) {
  const lines = [];
  let malformed = 0;
  for (const raw of String(text ?? '').split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    let obj;
    try { obj = JSON.parse(t); } catch { malformed += 1; continue; }
    if (!obj || typeof obj !== 'object' || typeof obj.kind !== 'string') { malformed += 1; continue; }
    lines.push({ ...obj, _path: path, _session: session || sessionOf(path) });
  }
  return { lines, malformed };
}

/**
 * `log/20260923-f3d05dd3.jsonl` → `f3d05dd3`. The session is the group key.
 *
 * ONE SHAPE, AND THAT IS NEW AS OF THE LAYOUT MIGRATION (`2317a7a`, PLAN §23). Until then this
 * function carried two older ones — `<stamp>-<session>` under a day folder, and
 * `<session>/<session>-<seq>` under one — and tried them in a load-bearing ORDER, because an
 * all-digit session key satisfied both and only the stamp was anchored. The migration folded every
 * file in the base into the current shape and verified it (99 → 51 files, the line multiset
 * byte-identical, zero old-shape files left), so both patterns and the ordering hazard that came
 * with them are gone.
 *
 * WHAT STILL READS THE OLD SHAPES, AND WHY NOT HERE: `migrate-log-layout.mjs` keeps its own copy
 * (`oldShape`), deliberately. It is the one tool that must be able to read a file written by a stale
 * checkout still on the old layout; the report has no such duty, and a report that silently guessed
 * at an unrecognised name would be the confident half-empty result §8 forbids. An unrecognised
 * path therefore yields `''` and is not attributed to any session.
 *
 * RECOGNISED BY WHERE THE FILE SITS, not by its name alone. A name cannot carry it:
 * `12345678-0002` — an all-digit key — reads as "date 12345678, session 0002" to any pattern
 * that takes eight digits and a dash. Every current file sits directly under `log/`, so the depth is
 * exact where the name is ambiguous.
 */
export function sessionOf(path) {
  return /(?:^|\/)log\/\d{8}-([^/]+)\.jsonl$/i.exec(String(path ?? ''))?.[1] ?? '';
}

/**
 * `log/20260918-f3d05dd3.jsonl` → `2026-09-18`. Used for the day filter and the sparkline. The
 * date is the date of the LINES inside the file (`logTargetOf` in push.mjs), where the old day
 * folder was the day of the push — which is why ten lines changed day in the migration.
 */
export function dayOf(path) {
  const m = /(?:^|\/)log\/(\d{4})(\d{2})(\d{2})-[^/]+\.jsonl$/.exec(String(path ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * A question, reduced to the key repeats are counted on.
 *
 * Case and punctuation are dropped; word ORDER is not. Two agents asking the same thing rarely
 * phrase it identically, so an exact-string key would scatter the miss panel into singletons and
 * the panel's whole value is the repeat count. But a bag-of-words key merges questions that differ
 * only in a negation, which is a different question with the same words. So: normalise the
 * surface, keep the sequence.
 */
export function questionKey(q) {
  return String(q ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Index rows → `{byId, anchorsById}`. Rows come from the same `index.json` `ask` ranks over. */
export function indexLookup(rows = []) {
  const byId = new Map();
  for (const r of rows) byId.set(String(r.id), r);
  return {
    byId,
    anchorsOf: (id) => new Set((byId.get(String(id))?.anchors ?? []).map(norm).filter(Boolean)),
    subjectOf: (id) => byId.get(String(id))?.subject ?? '',
    has: (id) => byId.has(String(id)),
  };
}

// ── Panel 1 — misses, ranked by repeat count ───────────────────────────────────────────────────

/**
 * A question asked and not answered. Ranked by repeat count, because a question asked three times
 * and never answered is the highest-value entry nobody has written (PLAN §8 panel 1).
 *
 * `unreachable` is NOT a miss and is counted separately. Folding it in would inflate the work queue
 * with questions the base may well answer — the one confusion §3.5 forbids.
 */
export function misses(lines) {
  const groups = new Map();
  let unreachable = 0;
  for (const l of lines) {
    if (l.kind !== 'ask') continue;
    if (l.state === 'unreachable') { unreachable += 1; continue; }
    if (l.state !== 'miss') continue;
    const key = questionKey(l.q);
    if (!key) continue;
    const g = groups.get(key) ?? { key, question: l.q, count: 0, sessions: new Set(), last: '' };
    g.count += 1;
    g.sessions.add(l._session);
    if (String(l.at ?? '') > g.last) { g.last = String(l.at ?? ''); g.question = l.q; }
    groups.set(key, g);
  }
  const ranked = [...groups.values()]
    .map((g) => ({ question: g.question, count: g.count, sessions: g.sessions.size, last: g.last }))
    .sort((a, b) => b.count - a.count || b.sessions - a.sessions || a.question.localeCompare(b.question));
  return { ranked, unreachable, total: ranked.reduce((n, g) => n + g.count, 0) };
}

// ── Panel 1a — near misses, the floor's own error bar ──────────────────────────────────────────

/**
 * Every miss that carried a rejected candidate, sorted by coverage DESCENDING.
 *
 * WHY THIS PANEL EXISTS AT ALL. Session 6 added `nearMiss` to the log for one stated purpose — *"is
 * the floor too high — visible immediately, without another replay"* — and then nothing read it.
 * A field written to a public, append-only log and consumed by nobody is not a measurement; it is
 * storage. This is the reader.
 *
 * WHY THE SORT IS COVERAGE DESCENDING, and not repeat count like panel 1. The top of this list is
 * the floor's error bar. §14.4 cut at 0.50 with the nearest surviving BAD hit at 0.45, so a row at
 * or above `NEAR_MISS_REVIEW` is one word from having been returned — exactly the row a reader has
 * to look at, and exactly the row a count-ranked list would bury under singletons.
 *
 * REPEATS STILL MATTER, so they get their own roll-up. A candidate that near-misses on several
 * different questions is not a coverage problem: it is an entry **phrased differently from how
 * people ask**, which is fixable by rewriting its subject and is otherwise invisible — never
 * returned, never counted, never suspected.
 *
 * ONE INFERENCE IS MADE AND IT IS LABELLED. The log line carries `{id, score, coverage}` but not
 * the overlap word count, so which clause of the floor rejected a candidate is not directly
 * recorded. It is still derivable in one direction: a candidate with no anchor whose coverage
 * already clears `MIN_COVERAGE` can only have been stopped by `MIN_WORDS`. That is reported as
 * `rejectedBy: 'words'`; everything else is `'coverage'`, which is the safe way round — the words
 * case is provable, the coverage case is the default.
 */
export function nearMisses(lines, idx) {
  const rows = [];
  const byCandidate = new Map();
  let missTotal = 0;
  let withoutNearMiss = 0;

  for (const l of lines) {
    if (l.kind !== 'ask' || l.state !== 'miss') continue;
    missTotal += 1;
    const nm = l.nearMiss;
    const coverage = Number(nm?.coverage);
    if (!nm || !Number.isFinite(coverage)) {
      // Nothing scored above zero at all. That is a different fact from "something nearly made it"
      // and it is counted rather than dropped: a window whose misses all look like this says the
      // base is nowhere near the subject, which is not a floor problem.
      withoutNearMiss += 1;
      continue;
    }
    const id = String(nm.id ?? '');
    const row = {
      id,
      subject: idx.subjectOf(id),
      inIndex: idx.has(id),
      coverage,
      score: Number(nm.score ?? 0),
      question: String(l.q ?? ''),
      session: l._session,
      at: String(l.at ?? ''),
      inBand: coverage >= NEAR_MISS_REVIEW,
      rejectedBy: coverage >= MIN_COVERAGE ? 'words' : 'coverage',
    };
    rows.push(row);
    const g = byCandidate.get(id)
      ?? { id, subject: row.subject, count: 0, best: 0, questions: new Set() };
    g.count += 1;
    g.best = Math.max(g.best, coverage);
    g.questions.add(questionKey(l.q));
    byCandidate.set(id, g);
  }

  rows.sort((a, b) => b.coverage - a.coverage
    || b.score - a.score
    || a.id.localeCompare(b.id));

  const repeats = [...byCandidate.values()]
    .filter((g) => g.count > 1)
    .map((g) => ({
      id: g.id, subject: g.subject, count: g.count, best: g.best, distinctQuestions: g.questions.size,
    }))
    .sort((a, b) => b.count - a.count || b.best - a.best || a.id.localeCompare(b.id));

  return {
    rows,
    repeats,
    inBand: rows.filter((r) => r.inBand),
    missTotal,
    withoutNearMiss,
    floor: MIN_COVERAGE,
    minWords: MIN_WORDS,
    review: NEAR_MISS_REVIEW,
  };
}

// ── Does the loop close? `capture` → the `ask` it followed ─────────────────────────────────────

/**
 * Captures linked back to the ask before them, via the `after` field (PLAN §14.4, §15.2).
 *
 * §15.3's third threshold is *"at least one capture following a miss — otherwise exit 1 is a dead
 * end and the message is wrong, not the floor"*. `after` holds the preceding ask's `at`, a pointer
 * into the same session's own file, so the link is exact rather than inferred from ordering.
 *
 * THREE NON-LINKS, EACH COUNTED SEPARATELY, because collapsing them would let the number move for
 * reasons that have nothing to do with the loop:
 *
 *   * `unlinked`  — the capture carries no `after` at all. Every capture written before the field
 *     existed (session 6) looks like this, and a pre-field capture is not evidence that the loop
 *     failed. It is not evidence that it closed either.
 *   * `dangling`  — `after` names an `at` no ask in that session's window carries. The ask is
 *     outside the window, or its file was not read.
 *   * `after-answer` — linked, but to an ask that was answered. A real link, and not this row's.
 *
 * `capture-refused` is tracked alongside but counted apart. A refusal following a miss is the loop
 * closing on the agent's side and failing at the write — genuinely interesting (the base held the
 * fact and `ask` did not find it), but it is not a capture, and a gate that accepted it would pass
 * on an event that wrote nothing.
 */
export function captureLoop(lines) {
  const askAt = new Map();
  for (const l of lines) {
    if (l.kind === 'ask' && l.at) askAt.set(`${l._session} ${String(l.at)}`, l);
  }

  const rows = [];
  const counts = { afterMiss: 0, afterAnswer: 0, unlinked: 0, dangling: 0, refusedAfterMiss: 0 };

  for (const l of lines) {
    // A `capture` logged with a `state` and no `id` is a failure to reach the base, not a write.
    const isCapture = l.kind === 'capture' && Boolean(l.id);
    const isRefused = l.kind === 'capture-refused';
    if (!isCapture && !isRefused) continue;

    const ask = l.after ? askAt.get(`${l._session} ${String(l.after)}`) : null;
    let link;
    if (!l.after) { link = 'unlinked'; counts.unlinked += 1; } else if (!ask) { link = 'dangling'; counts.dangling += 1; } else if (ask.state === 'miss') {
      link = 'after-miss';
      if (isRefused) counts.refusedAfterMiss += 1; else counts.afterMiss += 1;
    } else {
      link = 'after-answer';
      if (isCapture) counts.afterAnswer += 1;
    }

    rows.push({
      link,
      kind: l.kind,
      id: String(l.id ?? l.dupeOf ?? ''),
      subject: String(l.subject ?? ''),
      session: l._session,
      at: String(l.at ?? ''),
      askQuestion: ask ? String(ask.q ?? '') : '',
      askState: ask ? String(ask.state ?? '') : '',
    });
  }

  const order = { 'after-miss': 0, 'after-answer': 1, dangling: 2, unlinked: 3 };
  rows.sort((a, b) => order[a.link] - order[b.link] || b.at.localeCompare(a.at));
  return { rows, ...counts, captures: rows.filter((r) => r.kind === 'capture').length };
}

// ── Panel 2 — questions asked ──────────────────────────────────────────────────────────────────

/** Everything asked, answered or not — what agents actually want, which §1 says cannot be guessed. */
export function questions(lines) {
  const groups = new Map();
  const perSession = new Map();
  for (const l of lines) {
    if (l.kind !== 'ask') continue;
    const key = questionKey(l.q);
    if (!key) continue;
    const g = groups.get(key) ?? { question: l.q, count: 0, sessions: new Set(), states: new Map(), ms: [] };
    g.count += 1;
    g.sessions.add(l._session);
    g.states.set(l.state, (g.states.get(l.state) ?? 0) + 1);
    if (Number.isFinite(l.ms)) g.ms.push(Number(l.ms));
    groups.set(key, g);
    perSession.set(l._session, (perSession.get(l._session) ?? 0) + 1);
  }
  const asked = [...groups.values()]
    .map((g) => ({
      question: g.question,
      count: g.count,
      sessions: g.sessions.size,
      states: Object.fromEntries(g.states),
      medianMs: median(g.ms),
    }))
    .sort((a, b) => b.count - a.count || a.question.localeCompare(b.question));
  return {
    asked,
    bySession: [...perSession.entries()].map(([session, count]) => ({ session, count }))
      .sort((a, b) => b.count - a.count),
    totalAsks: asked.reduce((n, g) => n + g.count, 0),
  };
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ── Panel 3 — entries used / never used ────────────────────────────────────────────────────────

/**
 * Which entries the base actually served, and which it has never served.
 *
 * A never-opened entry is either unfindable or worthless, and the log names the candidates —
 * IT DOES NOT DECIDE WHICH (PLAN §8 panel 3). Stated as a rule because the tempting next step is
 * auto-retirement, which §11 rules out on exactly this evidence: an entry nobody has needed yet is
 * not an entry nobody will need.
 *
 * The window matters and is reported: an entry written yesterday cannot have been used last month.
 */
export function entryUsage(lines, idx) {
  const matched = new Map();
  const opened = new Map();
  const shown = new Map();
  const bump = (m, id) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const l of lines) {
    if (l.kind === 'ask') {
      for (const id of l.matched ?? []) bump(matched, String(id));
      for (const id of l.opened ?? []) bump(opened, String(id));
    } else if (l.kind === 'show' && l.id) {
      bump(shown, String(l.id));
    }
  }
  const used = [];
  for (const id of new Set([...matched.keys(), ...opened.keys(), ...shown.keys()])) {
    used.push({
      id,
      subject: idx.subjectOf(id),
      inIndex: idx.has(id),
      matched: matched.get(id) ?? 0,
      opened: opened.get(id) ?? 0,
      shown: shown.get(id) ?? 0,
    });
  }
  used.sort((a, b) => (b.matched + b.shown) - (a.matched + a.shown) || a.id.localeCompare(b.id));
  const never = [...idx.byId.values()]
    .filter((r) => !matched.has(String(r.id)) && !shown.has(String(r.id)))
    .map((r) => ({ id: String(r.id), subject: r.subject ?? '', trust: r.trust ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { used, never, indexed: idx.byId.size };
}

// ── Panel 4 — confirmations and disputes ───────────────────────────────────────────────────────

/**
 * Where a fact was seen to hold again, and where it did not.
 *
 * "A disputed entry with four confirmations is the single most decision-worthy row in the whole
 * report" (PLAN §8 panel 4) — so the sort puts disputed rows first regardless of count, and the
 * confirmation total comes from the log EVENTS, not from `evidence[]`: the report reads logs.
 */
export function evidence(lines, idx) {
  const rows = new Map();
  const get = (id) => {
    const key = String(id);
    if (!rows.has(key)) {
      rows.set(key, { id: key, subject: idx.subjectOf(key), confirms: 0, disputes: 0, deployments: new Set(), saw: [] });
    }
    return rows.get(key);
  };
  for (const l of lines) {
    if (l.kind === 'confirm' && l.id) {
      const r = get(l.id);
      r.confirms += 1;
      if (l.deployment) r.deployments.add(String(l.deployment));
    } else if (l.kind === 'dispute' && l.id) {
      const r = get(l.id);
      r.disputes += 1;
      if (l.deployment) r.deployments.add(String(l.deployment));
      if (l.saw) r.saw.push(String(l.saw));
    }
  }
  const all = [...rows.values()].map((r) => ({ ...r, deployments: [...r.deployments].sort() }));
  all.sort((a, b) => (b.disputes > 0) - (a.disputes > 0)
    || b.disputes - a.disputes
    || b.confirms - a.confirms
    || a.id.localeCompare(b.id));
  return {
    rows: all,
    contested: all.filter((r) => r.disputes > 0 && r.confirms > 0),
    confirms: all.reduce((n, r) => n + r.confirms, 0),
    disputes: all.reduce((n, r) => n + r.disputes, 0),
  };
}

// ── Panel 5 — refused captures ─────────────────────────────────────────────────────────────────

/**
 * Each refusal is a RANKING MISS THAT DID NOT BECOME A DUPLICATE (PLAN §8 panel 5). A rising count
 * is not a problem — it is §2's guard working, and simultaneously a direct measure of how often
 * `ask` fails to find something the base already holds.
 */
export function refusals(lines, idx) {
  const rows = [];
  const byTarget = new Map();
  for (const l of lines) {
    if (l.kind !== 'capture-refused') continue;
    const target = String(l.dupeOf ?? '');
    rows.push({
      subject: String(l.subject ?? ''),
      dupeOf: target,
      dupeSubject: idx.subjectOf(target),
      why: String(l.why ?? ''),
      when: String(l.when ?? ''),
      session: l._session,
      at: String(l.at ?? ''),
    });
    byTarget.set(target, (byTarget.get(target) ?? 0) + 1);
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return {
    rows,
    total: rows.length,
    repeatTargets: [...byTarget.entries()].filter(([, n]) => n > 1)
      .map(([id, n]) => ({ id, subject: idx.subjectOf(id), count: n }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Panel 6 — unhelpful answers ────────────────────────────────────────────────────────────────

/**
 * THE PANEL THE MISS LIST CANNOT PRODUCE (PLAN §8 panel 6).
 *
 * A miss is honest: the base says it holds nothing. The dangerous case is the opposite —
 * `state: "answer"`, three ids returned, and not one of them any use. That never appears as a miss,
 * and it is what a token-overlap ranker produces when it produces anything.
 *
 * THE DEFINITION, computable from the log v1 already writes: *an `ask` is unhelpful when the same
 * session later `capture`s a fact whose anchors appear in NONE of that ask's `matched` rows.* The
 * base answered; the agent went and found out anyway.
 *
 * THE PAIRING IS THE CAPTURE'S OWN `after` POINTER, AND FOR TWO YEARS OF THIS FILE'S LIFE IT WAS
 * NOT (fixed 2026-09-22). The rule used to be "same session, and later by timestamp", which pairs
 * EVERY answered ask with EVERY subsequent capture — an N×M cross product with no test that the two
 * are about the same thing. A session that asked about configurable products at 10:00 and captured
 * something about `capturedDate` at 11:00 produced an `unhelpful` row against the 10:00 ask, and
 * the same fault inflated the denominator, so the rate could not be read in either direction. It
 * was found by an independent audit session and confirmed here (PLAN §22.11).
 *
 * The remedy needed no new field. `capture` has always written `after` — the `at` of the ask it
 * followed — and `precedingAsk()` in `verbs.mjs` says in terms what it is for: *"Panel 6 answers
 * 'did the agent go and find out anyway?' … This records the link directly, so the panel becomes
 * exact instead of heuristic."* The panel never read it. The local variable that shadowed the name
 * is how it stayed invisible.
 *
 * Four judgement calls, each stated because each could silently inflate the rate:
 *
 *   1. ONLY A CAPTURE THAT NAMES ITS ASK IS PAIRED. `after` is a pointer to a line in the same
 *      session's own log, so the match is exact rather than temporal. A capture with NO `after`
 *      had no ask before it in its session: it is `unprompted`, counted and reported, and it is not
 *      evidence about any ask. Measured on the whole published log the day this landed: 8 of 21
 *      captures carry the pointer, so 13 were being paired against asks they had nothing to do with.
 *   2. AN `after` POINTING AT A MISS IS THE LOOP WORKING, not an unhelpful answer. The base said it
 *      held nothing, the agent went and found out, and that is `captureLoop`'s panel. Counted here
 *      as `afterMiss` so the number is visible rather than silently dropped.
 *   3. THE CAPTURE'S ANCHORS MUST BE KNOWN. A capture whose entry is not in the index we fetched —
 *      queued but not yet pushed, or pushed after the index snapshot — is UNDECIDABLE, and is
 *      reported as such rather than counted either way. Counting it as unhelpful would make the
 *      rate a function of push timing.
 *   4. AN ASK WITH NO `matched` IS NOT UNHELPFUL. That is a miss, and it is panel 1's.
 *
 * The rate is over DECIDABLE pairs — not over all asks. An ask nobody captured against is not
 * evidence either way, and putting it in the denominator would let the rate fall simply because the
 * base got quieter.
 */
export function unhelpful(lines, idx) {
  const bySession = new Map();
  for (const l of lines) {
    if (l.kind !== 'ask' && l.kind !== 'capture') continue;
    const s = l._session || '';
    if (!bySession.has(s)) bySession.set(s, []);
    bySession.get(s).push(l);
  }

  const rows = [];
  let decidable = 0;
  let undecidable = 0;
  let unprompted = 0;
  let afterMiss = 0;

  for (const [session, events] of bySession) {
    // Asks indexed by their OWN `at`, which is what a capture's `after` points at. Exact, so no
    // ordering or windowing is involved: either the capture names a line in this set or it does not.
    const askAt = new Map();
    for (const e of events) if (e.kind === 'ask' && e.at) askAt.set(String(e.at), e);

    for (const cap of events) {
      if (cap.kind !== 'capture' || !cap.id) continue;

      // NO POINTER, NO PAIR. A capture written with no ask before it in its session is not evidence
      // about any ask, and the old rule's whole error was treating it as evidence about all of them.
      if (!cap.after) { unprompted += 1; continue; }

      const ask = askAt.get(String(cap.after));
      if (!ask) {
        // The pointer names a line outside this window — the report reads day folders, and a
        // session can straddle one. Reported, never guessed at.
        undecidable += 1;
        rows.push({
          verdict: 'undecidable',
          session,
          question: '',
          matched: [],
          captureId: String(cap.id),
          captureSubject: String(cap.subject ?? idx.subjectOf(cap.id)),
          captureAnchors: [...idx.anchorsOf(cap.id)],
          overlap: [],
          why: 'the ask this capture points at is not in the window',
        });
        continue;
      }

      // The base said it held nothing and the agent went and found out. That is the loop working,
      // and it belongs to `captureLoop`, not here.
      if (ask.state !== 'answer' || !(ask.matched ?? []).length) { afterMiss += 1; continue; }

      const pool = new Set();
      for (const id of ask.matched ?? []) for (const a of idx.anchorsOf(id)) pool.add(a);
      // An ask whose OWN matched rows are not in the index cannot be judged either — the pool
      // would be empty for a reason that has nothing to do with the ranker.
      const matchedKnown = (ask.matched ?? []).filter((id) => idx.has(id)).length;

      const capAnchors = idx.anchorsOf(cap.id);
      if (!idx.has(cap.id) || capAnchors.size === 0 || matchedKnown === 0) {
        undecidable += 1;
        rows.push({
          verdict: 'undecidable',
          session,
          question: String(ask.q ?? ''),
          matched: (ask.matched ?? []).map(String),
          captureId: String(cap.id),
          captureSubject: String(cap.subject ?? idx.subjectOf(cap.id)),
          captureAnchors: [...capAnchors],
          overlap: [],
          why: !idx.has(cap.id) ? 'the captured entry is not in the index snapshot'
            : capAnchors.size === 0 ? 'the captured entry declares no anchors'
              : 'none of the matched ids are in the index snapshot',
        });
        continue;
      }
      decidable += 1;
      const overlap = [...capAnchors].filter((a) => pool.has(a));
      rows.push({
        verdict: overlap.length ? 'helpful' : 'unhelpful',
        session,
        question: String(ask.q ?? ''),
        matched: (ask.matched ?? []).map(String),
        matchedSubjects: (ask.matched ?? []).map((id) => ({ id: String(id), subject: idx.subjectOf(id) })),
        captureId: String(cap.id),
        captureSubject: String(cap.subject ?? idx.subjectOf(cap.id)),
        captureAnchors: [...capAnchors],
        overlap,
      });
    }
  }

  const flagged = rows.filter((r) => r.verdict === 'unhelpful');
  return {
    rows: rows.filter((r) => r.verdict !== 'helpful').concat(rows.filter((r) => r.verdict === 'helpful')),
    flagged,
    decidable,
    undecidable,
    // Both are REPORTED rather than folded into the rate, for the reason the rate exists: a number
    // whose inputs are invisible cannot be argued with. `unprompted` says how many captures were
    // written with no ask before them — the class the old pairing silently counted as evidence —
    // and `afterMiss` how many followed a miss, which is the loop working rather than a bad answer.
    unprompted,
    afterMiss,
    // §11 gates "ranking beyond token overlap" on a rate above ~15%. It is reported, never acted on
    // here: this function measures, and the decision is a human's.
    rate: decidable ? flagged.length / decidable : null,
  };
}

// ── The §15 verdict block ──────────────────────────────────────────────────────────────────────

/** The three states. `NOT_ENOUGH_DATA` is a REAL verdict and must never read as a pass. */
export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const NO_DATA = 'NOT ENOUGH DATA';
/**
 * OVER THE LINE, UNDER THE SAMPLE — and it is a THIRD thing, not a soft NOT ENOUGH DATA.
 *
 * The defect this closes: the unhelpful row printed `NOT ENOUGH DATA` while its own detail string
 * read *"3 unhelpful of 7 decidable = 42.9%"* against a declared trigger of 15%. The number was
 * right and the headline was `pass 1 — fail 0 — noData 2`, which a reader scanning for a go/no-go
 * reads as "nothing failed". The instrument this project built so it could not grade itself
 * generously was rounding its own worst reading up to silence.
 *
 * NOT_ENOUGH_DATA means *we did not see enough to say*. This means *what we saw is over the line and
 * the sample is too thin to call it settled* — the two are opposite states of knowledge and they
 * were sharing a word. The sample floor is kept, because with 3 of 7 the lower confidence bound sits
 * near 12% and "not conclusive" is a fair reading; what is not fair is reporting a presence as an
 * absence of information.
 */
export const INCONCLUSIVE = 'OVER THE LINE, SAMPLE TOO THIN';
/**
 * A row a machine cannot judge and a human must read. Same argument: the near-miss row set NO_DATA
 * whenever a candidate sat in the review band — which is the one case where there IS data and it is
 * the operator's to read. §15.3 says "one such is a signal, two mean the floor is too high", and a
 * signal reported as an absence is a signal nobody acts on.
 */
export const NEEDS_READING = 'NEEDS READING';

/**
 * §15.3's three thresholds, judged against this window — three rows, each with the number it judged.
 *
 * THE POINT OF THE `NOT ENOUGH DATA` STATE. §14.1's mistake was a comfortable number with nothing
 * behind it: zero misses in 39 asks read as perfect coverage and was the absence of a floor. §15
 * exists because of that, so a row here reports the n it had and refuses to convert an absence into
 * a pass below `MIN_SAMPLE`. On 18 real asks most of this block will say NOT ENOUGH DATA. That is
 * the correct output.
 *
 * AND WHAT THIS FUNCTION MUST NOT DO, because it is the row that could quietly overreach: it does
 * **not** judge whether an in-band near-miss was ANSWERABLE. §15.3's second threshold is a
 * conjunction — a machine-checkable part (coverage ≥ 0.45) and a human part ("turns out, on
 * reading"). The script owns the first and flags the rows; a reader owns the second. So a window
 * with rows in the band is reported as NOT ENOUGH DATA *with the rows named*, never as a FAIL: a
 * FAIL there would be the script claiming a judgement it has no way to make.
 */
export function verdict({ unhelpful: u, nearMisses: nm, loop }) {
  const rows = [];

  // 1 ── unhelpful-answer rate ≤ 15% (PLAN §11's trigger, reused).
  {
    const n = u.decidable;
    const flagged = u.flagged.length;
    const rate = u.rate;
    let state;
    let detail;
    if (n < MIN_SAMPLE && rate != null && rate > UNHELPFUL_MAX) {
      // THE CASE THAT USED TO DISAPPEAR. Over the trigger, under the sample: a presence, reported as
      // one. The old branch called this NOT ENOUGH DATA and the headline counted it beside rows that
      // genuinely had nothing behind them.
      state = INCONCLUSIVE;
      detail = `${flagged} unhelpful of ${n} decidable ask(s) = ${(rate * 100).toFixed(1)}%, `
        + `OVER the ${UNHELPFUL_MAX * 100}% trigger — but n=${n}, below the declared minimum of `
        + `${MIN_SAMPLE}, so this is a reading to act on, not a verdict to quote.`;
    } else if (n < MIN_SAMPLE) {
      state = NO_DATA;
      detail = `${flagged} unhelpful of ${n} decidable ask(s)`
        + `${rate == null ? '' : ` = ${(rate * 100).toFixed(1)}%`}`
        + ` — n=${n}, below the declared minimum of ${MIN_SAMPLE}.`;
    } else if (rate <= UNHELPFUL_MAX) {
      state = PASS;
      detail = `${flagged} unhelpful of ${n} decidable ask(s) = ${(rate * 100).toFixed(1)}%, at or under ${UNHELPFUL_MAX * 100}%.`;
    } else {
      state = FAIL;
      detail = `${flagged} unhelpful of ${n} decidable ask(s) = ${(rate * 100).toFixed(1)}%, over ${UNHELPFUL_MAX * 100}%.`;
    }
    rows.push({
      key: 'unhelpful',
      threshold: `unhelpful-answer rate ≤ ${UNHELPFUL_MAX * 100}%`,
      source: "PLAN §11's existing trigger, reused (§15.3)",
      state,
      n,
      value: rate,
      detail,
      undecidable: u.undecidable,
    });
  }

  // 2 ── no miss whose nearMiss coverage ≥ 0.45 (PLAN §15.3). Flags; never judges answerability.
  {
    const n = nm.rows.length;
    const band = nm.inBand.length;
    let state;
    let detail;
    if (band > 0) {
      // A candidate in the review band is DATA the operator has to read, not an absence of it.
      state = NEEDS_READING;
      detail = `${band} near-miss row(s) at coverage ≥ ${NEAR_MISS_REVIEW} — a human must read them and`
        + ' decide whether they were answerable. This script does not judge that'
        + `${band > 1 ? '. §15.3: one is a signal, two mean the floor is too high' : ''}.`;
    } else if (n < MIN_SAMPLE) {
      state = NO_DATA;
      detail = `no near-miss reached ${NEAR_MISS_REVIEW}, but only ${n} miss(es) carried a candidate at all`
        + ` — n=${n}, below the declared minimum of ${MIN_SAMPLE}. Too few to call the floor clean.`;
    } else {
      state = PASS;
      detail = `none of ${n} near-miss row(s) reached ${NEAR_MISS_REVIEW}; there is nothing to read.`;
    }
    rows.push({
      key: 'near-miss',
      threshold: `no miss whose nearMiss coverage ≥ ${NEAR_MISS_REVIEW}`,
      source: 'PLAN §15.3',
      state,
      n,
      value: nm.rows[0]?.coverage ?? null,
      detail,
      needsReading: band,
    });
  }

  // 3 ── at least one capture following a miss, via `after` (PLAN §14.4, §15.3).
  {
    const n = nm.missTotal;
    const hit = loop.afterMiss;
    let state;
    let detail;
    const aside = [
      loop.unlinked ? `${loop.unlinked} capture/refusal(s) carry no \`after\` and cannot be linked` : '',
      loop.dangling ? `${loop.dangling} point at an ask outside this window` : '',
      loop.refusedAfterMiss ? `${loop.refusedAfterMiss} REFUSED capture(s) followed a miss — the agent acted, the write was deduped` : '',
    ].filter(Boolean).join('; ');
    if (hit >= THRESHOLDS.capturesAfterMiss) {
      state = PASS;
      detail = `${hit} capture(s) followed a miss — exit 1 produced knowledge.`;
    } else if (n < MIN_SAMPLE) {
      state = NO_DATA;
      detail = `no capture followed a miss, but only ${n} miss(es) occurred — n=${n}, below the declared`
        + ` minimum of ${MIN_SAMPLE}. Too few for the absence to mean anything.`;
    } else {
      state = FAIL;
      detail = `no capture followed any of ${n} miss(es) — exit 1 is a dead end, and the message is`
        + ' wrong, not the floor (§15.3).';
    }
    rows.push({
      key: 'capture-after-miss',
      threshold: `≥ ${THRESHOLDS.capturesAfterMiss} capture following a miss`,
      source: 'PLAN §15.3, via the `after` field (§14.4)',
      state,
      n,
      value: hit,
      detail: aside ? `${detail} (${aside}.)` : detail,
    });
  }

  return {
    thresholds: THRESHOLDS,
    rows,
    pass: rows.filter((r) => r.state === PASS).length,
    fail: rows.filter((r) => r.state === FAIL).length,
    noData: rows.filter((r) => r.state === NO_DATA).length,
    // COUNTED SEPARATELY, so the headline cannot absorb them. A reader who takes in one line of this
    // report takes in that line; if "over the line" and "nothing to say" arrive under one word, the
    // line is worse than no line.
    inconclusive: rows.filter((r) => r.state === INCONCLUSIVE).length,
    needsReading: rows.filter((r) => r.state === NEEDS_READING).length,
  };
}

// ── The whole report ───────────────────────────────────────────────────────────────────────────

/** Counts by kind, so the header can say what the window actually contained. */
export function kindTally(lines) {
  const t = new Map();
  for (const l of lines) t.set(l.kind, (t.get(l.kind) ?? 0) + 1);
  return Object.fromEntries([...t.entries()].sort((a, b) => b[1] - a[1]));
}

/**
 * REACH -- the denominator, and the only panel whose subject is sessions the base never heard from.
 *
 * Every other panel here is built from lines the base received, so all of them share one blind
 * spot: they can count how the base was USED and never how often it was available and skipped. The
 * `sessions` figure in the header is the sharpest form of it -- distinct sessions APPEARING IN THE
 * LOG -- so an hour of work with three hundred tool calls and not one question looked exactly like
 * no work at all. `session` lines (see `reach.mjs`) are what make that case countable.
 *
 * TOUCHES, NOT ASKS. A `session` line counts tool calls that went to the base through either door,
 * which includes `show`, `capture`, `confirm` and `dispute` -- so it is an upper bound on asking
 * and must not be printed as one. The ask count beside it comes from the ask lines themselves, and
 * the gap between the two is itself readable: touches far above asks is a session re-reading
 * entries whose ids it already had.
 *
 * `firstTouch` IS THE DIAGNOSIS, which is why the ordinals are carried and not just a count. One
 * touch at call 3 is a session that oriented itself and then worked blind; one touch at call 290 is
 * a session that worked blind and then checked. The remedies are opposite, and a ratio cannot tell
 * them apart.
 *
 * SESSIONS WITH NO `session` LINE ARE COUNTED APART AND SAID SO. A machine whose `Stop` hook is not
 * registered still logs asks, and folding those into the denominator as "0 tool calls" would invent
 * a ratio out of a missing measurement -- the same discipline `unreachable` gets in the miss panel,
 * where the base was not read and so the ask says nothing about coverage.
 */
/**
 * `since` — THE WINDOW, and this panel is the one place it has to be applied by hand.
 *
 * Every other panel is windowed for free, because `--days N` selects DAY FOLDERS under `log/` and an
 * `ask` line is written into its own session's file on the day it happened. A `session` line is not:
 * it describes a session that has ENDED and is published by whichever LATER session sweeps it
 * (`push.mjs`), so a line about a 09-18 session routinely rides in a 09-22 file. Measured the day
 * this landed: `2ca7d89e-0001.jsonl` carries the `session` lines for `35b6f0e1` and `798dcffa`,
 * neither of which is `2ca7d89e`.
 *
 * So filtering by file date does not filter these rows at all, and the symptom is a reach figure
 * that does not move when the window narrows — which is how an audit session found it (PLAN §22.11).
 * The row already carries `firstAt`, the session's OWN time. Nothing read it. Now this does.
 *
 * `null` means no window — `--sessions` replaces the day range rather than narrowing it, and a row
 * with no `firstAt` is kept rather than guessed at, because dropping it would under-count silently
 * in the one panel whose whole job is counting what did NOT happen.
 */
export function reach(lines, { since = null } = {}) {
  const asksBySession = new Map();
  for (const l of lines) {
    if (l.kind !== 'ask' || !l._session) continue;
    asksBySession.set(l._session, (asksBySession.get(l._session) ?? 0) + 1);
  }

  // ONE ROW PER SESSION, AND IT IS THE FULLEST LINE, NOT THE FIRST (PLAN §23.7). Idleness is the only
  // end-of-session signal this system has, so a session quiet for `REACH_IDLE_MS` is published as
  // finished — and then it RESUMES, and is published again with more tool calls. First-wins kept the
  // stale counters and dropped the real ones. Highest `tools` wins, ties to the later `lastAt`:
  // `tools` never falls across a resumption, because a resumed state re-reads the transcript from
  // the start, so the larger count is the one that saw more of the session.
  //
  // The session's START is the EARLIEST `firstAt` across its lines, not the chosen line's: a state
  // dropped after publication is rebuilt with a fresh `firstAt`, and windowing on that would move a
  // session that began inside the window out of it.
  const best = new Map();
  for (const l of lines) {
    if (l.kind !== 'session') continue;
    // The line names the session it DESCRIBES, which since 2026-09-23 is also the file it lives in;
    // an older file belongs to whichever session pushed it, so `l.session` is still read first.
    const id = l.session ?? l._session;
    if (!id) continue;
    const began = String(l.firstAt ?? l.at ?? '');
    const prior = best.get(id);
    const tools = Number(l.tools ?? 0);
    const fuller = !prior || tools > prior.tools
      || (tools === prior.tools && String(l.lastAt ?? l.at ?? '') > String(prior.line.lastAt ?? prior.line.at ?? ''));
    const start = prior && prior.began && (!began || prior.began < began) ? prior.began : began;
    best.set(id, fuller ? { line: l, tools, began: start } : { ...prior, began: start });
  }

  const rows = [];
  const seen = new Set();
  for (const [id, { line: l, began }] of best) {
    if (since && began && began < since) continue;
    seen.add(id);
    const touchAt = Array.isArray(l.touchAt) ? l.touchAt : [];
    rows.push({
      session: id,
      tools: Number(l.tools ?? 0),
      turns: Number(l.turns ?? 0),
      touches: touchAt.length,
      firstTouch: touchAt.length ? touchAt[0] : null,
      lastTouch: touchAt.length ? touchAt[touchAt.length - 1] : null,
      asks: asksBySession.get(id) ?? 0,
      at: began || '',
    });
  }

  const tools = rows.reduce((n, r) => n + r.tools, 0);
  const touches = rows.reduce((n, r) => n + r.touches, 0);
  // WORST FIRST, and "worst" is WORK DONE WITHOUT CONSULTING THE BASE -- `tools / (touches + 1)`.
  //
  // Not "silent first", which was the obvious rule and is the wrong one: it ranks a four-call
  // session that asked nothing above a three-hundred-call session that asked once, and only the
  // second is evidence of anything. Not calls-per-touch either, which divides by zero exactly where
  // the panel matters most. The +1 is what makes the two comparable on one scale -- a silent
  // session is charged for all of its work, a session with one touch for half of it -- so a small
  // silent session falls where it belongs, below a large one and below nothing else.
  const blind = (r) => r.tools / (r.touches + 1);
  rows.sort((a, b) => (blind(b) - blind(a)) || a.session.localeCompare(b.session));
  return {
    rows,
    accounted: rows.length,
    unaccounted: [...asksBySession.keys()].filter((s) => !seen.has(s)).length,
    tools,
    touches,
    silent: rows.filter((r) => r.touches === 0).length,
    perHundred: tools ? (touches / tools) * 100 : null,
  };
}

/**
 * WHAT THE WINDOW WAS ABOUT -- the distinct topics inside it, with the shape of each one's traffic.
 *
 * COMPUTED, NEVER DECLARED. A topic sits on the LINE (`label()` in verbs.mjs), because the two
 * units a reader reaches for first are both wrong: a FILE boundary is the push timer, and a SESSION
 * covers many tasks. So "what was this window about" is a set derived from the lines, the same way
 * §2 keeps a confirmation count off an entry's frontmatter -- a declared copy of something that
 * already has a home is the copy that goes stale.
 *
 * IT REPLACES NOTHING. Panel 3 groups by session and keeps doing so; this is the grouping that
 * survives a session covering four tasks, which panel 3 cannot see at all.
 *
 * `untopiced` is the honest denominator and it is a COUNT, not a row: lines written before this
 * field existed, and lines from a session whose agent never passed one, are not a topic called
 * "unknown" -- rendering them as one would invent a subject nobody wrote. The number says how much
 * of the window this panel can speak for.
 */
export function topics(lines) {
  const by = new Map();
  let untopiced = 0;
  for (const l of lines) {
    const t = typeof l.topic === 'string' && l.topic ? l.topic : null;
    if (!t) { untopiced += 1; continue; }
    const row = by.get(t) ?? { topic: t, lines: 0, asks: 0, misses: 0, captures: 0, sessions: new Set(), runs: new Set(), first: l.at, last: l.at };
    row.lines += 1;
    if (l.kind === 'ask') { row.asks += 1; if (l.state === 'miss') row.misses += 1; }
    if (l.kind === 'capture') row.captures += 1;
    if (l._session) row.sessions.add(l._session);
    if (l.run) row.runs.add(l.run);
    if (String(l.at ?? '') < String(row.first)) row.first = l.at;
    if (String(l.at ?? '') > String(row.last)) row.last = l.at;
    by.set(t, row);
  }
  const rows = [...by.values()]
    .map((r) => ({ ...r, sessions: r.sessions.size, runs: [...r.runs].sort() }))
    // Most lines first: the thing the window was mostly about is the thing a reader wants named.
    // Ties break on the topic itself so the order is stable between two runs over one window.
    .sort((a, b) => b.lines - a.lines || a.topic.localeCompare(b.topic));
  return { rows, untopiced, topiced: lines.length - untopiced };
}

/** Asks per day — the header's one-line shape of activity. */
export function activity(lines) {
  const byDay = new Map();
  for (const l of lines) {
    const day = dayOf(l._path);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));
}

/**
 * Every panel, from parsed lines plus the index rows.
 *
 * `meta` carries the things a reader needs to know to trust the numbers at all — the window, the
 * file count, whether the tree was truncated, whether this came from cache, and how many lines
 * failed to parse. It is not decoration: a report that cannot say where its data came from is a
 * report whose numbers cannot be acted on.
 */
/**
 * The earliest instant the day-folder window covers, or `null` when there is no window.
 *
 * `collect()` fetches `days` folders ENDING on `at`, so the earliest one starts `days - 1` days
 * before `at`'s day — computed the same way `dayFolder` cuts, in UTC, so this agrees with the
 * folder names rather than with a local clock. `--sessions` replaces the range instead of narrowing
 * it, which is the one case that must answer `null` rather than a date.
 */
export function windowStart(meta = {}) {
  if (Array.isArray(meta.sessions) && meta.sessions.length) return null;
  const days = Number(meta.days);
  if (!Number.isInteger(days) || days < 1 || !meta.at) return null;
  const end = new Date(meta.at);
  if (Number.isNaN(end.getTime())) return null;
  const start = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - (days - 1) * 86_400_000;
  return new Date(start).toISOString();
}

export function analyse({ lines = [], rows = [], meta = {} } = {}) {
  const idx = indexLookup(rows);
  // SYNTHETIC LINES ARE EXCLUDED FROM EVERY PANEL AND COUNTED IN THE HEADER (PLAN §14.2).
  //
  // A benchmark is not demand. Measured on the first 12 log files: six questions asked five times
  // each -- 30 of 39 asks -- were one latency run, so panel 2 was ranking a stopwatch and panel 1's
  // denominator was four times real demand. Filtering here rather than at the writer is deliberate:
  // the line is still in the base, still readable, still auditable, and the header says how many
  // were set aside. A measurement that quietly removed its own inputs would be the same defect the
  // filter exists to fix.
  const notSynthetic = lines.filter((l) => l.synthetic !== true);
  const syntheticLines = lines.length - notSynthetic.length;
  // SCOPED TO ONE RUN, when the operator named one. Filtered HERE and not in `report.mjs` for the
  // reason the synthetic filter is here: every panel and the §15 verdict must be computed from the
  // same set of lines, and a filter applied at the caller is one a second caller forgets. The
  // comparison is EXACT and the handle is never parsed -- `runOf()` in queue.mjs is the contract,
  // and a report that pattern-matched run handles would be the tool having an opinion about what a
  // run is, which is precisely what the field refuses to have.
  const run = typeof meta.run === 'string' && meta.run.trim() ? meta.run.trim() : null;
  const real = run ? notSynthetic.filter((l) => l.run === run) : notSynthetic;
  const panels = {
    misses: misses(real),
    nearMisses: nearMisses(real, idx),
    questions: questions(real),
    entries: entryUsage(real, idx),
    evidence: evidence(real, idx),
    refusals: refusals(real, idx),
    unhelpful: unhelpful(real, idx),
    loop: captureLoop(real),
    // THE ONE PANEL THAT NEEDS THE WINDOW HANDED TO IT — see `reach()` for why a `session` line is
    // not where its file's date says it is. `--sessions` replaces the day range, so there is no
    // window to apply; a missing `days` or `at` means the same.
    reach: reach(real, { since: windowStart(meta) }),
    topics: topics(real),
  };
  return {
    meta: {
      ...meta,
      synthetic: syntheticLines,
      syntheticAsks: lines.filter((l) => l.synthetic === true && l.kind === 'ask').length,
      // THE SCOPE IS PART OF THE NUMBER (PLAN §15.2): a report headed "last 30 days" that actually
      // analysed one run is a figure nobody can reproduce. `outOfRun` is what the filter set aside,
      // printed rather than dropped, for the same reason the synthetic count is.
      run,
      outOfRun: run ? notSynthetic.length - real.length : 0,
    },
    tally: kindTally(real),
    activity: activity(real),
    sessions: new Set(real.map((l) => l._session).filter(Boolean)).size,
    panels,
    // The §15 gate, computed from the panels above rather than from the lines again — one
    // derivation, so a number in the verdict can never disagree with the panel it came from.
    verdict: verdict({ unhelpful: panels.unhelpful, nearMisses: panels.nearMisses, loop: panels.loop }),
  };
}
