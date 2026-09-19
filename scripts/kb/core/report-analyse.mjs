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

/** Log kinds this analysis knows about. Anything else is counted and otherwise ignored. */
export const KNOWN_KINDS = Object.freeze([
  'ask', 'show', 'capture', 'capture-refused', 'confirm', 'dispute', 'flush', 'reindex', 'redacted',
]);

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

/** `log/2026-09-18/20260918T171217Z-local_26.jsonl` → `local_26`. The session is the group key. */
export function sessionOf(path) {
  const m = /([^/]+)\.jsonl$/i.exec(String(path ?? ''));
  if (!m) return '';
  const dash = m[1].indexOf('-');
  return dash === -1 ? m[1] : m[1].slice(dash + 1);
}

/** `log/2026-09-18/…` → `2026-09-18`. Used for the day filter and the sparkline. */
export function dayOf(path) {
  return /log\/(\d{4}-\d{2}-\d{2})\//.exec(String(path ?? ''))?.[1] ?? '';
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
 * Three judgement calls, each stated because each could silently inflate the rate:
 *
 *   1. SAME SESSION, AND LATER. A capture before the ask says nothing about that ask. The `at`
 *      ordering is used, not file order, because a queue file is appended by several verbs.
 *   2. THE CAPTURE'S ANCHORS MUST BE KNOWN. A capture whose entry is not in the index we fetched —
 *      queued but not yet pushed, or pushed after the index snapshot — is UNDECIDABLE, and is
 *      reported as such rather than counted either way. Counting it as unhelpful would make the
 *      rate a function of push timing.
 *   3. AN ASK WITH NO `matched` IS NOT UNHELPFUL. That is a miss, and it is panel 1's.
 *
 * The rate is over DECIDABLE asks that were followed by a decidable capture — not over all asks.
 * An ask nobody captured against is not evidence either way, and putting it in the denominator
 * would let the rate fall simply because the base got quieter.
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

  for (const [session, events] of bySession) {
    const ordered = [...events].sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
    const asks = ordered.filter((e) => e.kind === 'ask' && e.state === 'answer' && (e.matched ?? []).length);
    const captures = ordered.filter((e) => e.kind === 'capture' && e.id);
    if (!asks.length || !captures.length) continue;

    for (const ask of asks) {
      const after = captures.filter((c) => String(c.at ?? '') > String(ask.at ?? ''));
      if (!after.length) continue;

      const pool = new Set();
      for (const id of ask.matched ?? []) for (const a of idx.anchorsOf(id)) pool.add(a);

      // An ask whose OWN matched rows are not in the index cannot be judged either — the pool
      // would be empty for a reason that has nothing to do with the ranker.
      const matchedKnown = (ask.matched ?? []).filter((id) => idx.has(id)).length;

      for (const cap of after) {
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
  }

  const flagged = rows.filter((r) => r.verdict === 'unhelpful');
  return {
    rows: rows.filter((r) => r.verdict !== 'helpful').concat(rows.filter((r) => r.verdict === 'helpful')),
    flagged,
    decidable,
    undecidable,
    // §11 gates "ranking beyond token overlap" on a rate above ~15%. It is reported, never acted on
    // here: this function measures, and the decision is a human's.
    rate: decidable ? flagged.length / decidable : null,
  };
}

// ── The whole report ───────────────────────────────────────────────────────────────────────────

/** Counts by kind, so the header can say what the window actually contained. */
export function kindTally(lines) {
  const t = new Map();
  for (const l of lines) t.set(l.kind, (t.get(l.kind) ?? 0) + 1);
  return Object.fromEntries([...t.entries()].sort((a, b) => b[1] - a[1]));
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
export function analyse({ lines = [], rows = [], meta = {} } = {}) {
  const idx = indexLookup(rows);
  return {
    meta,
    tally: kindTally(lines),
    activity: activity(lines),
    sessions: new Set(lines.map((l) => l._session).filter(Boolean)).size,
    panels: {
      misses: misses(lines),
      questions: questions(lines),
      entries: entryUsage(lines, idx),
      evidence: evidence(lines, idx),
      refusals: refusals(lines, idx),
      unhelpful: unhelpful(lines, idx),
    },
  };
}
