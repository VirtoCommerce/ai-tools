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
import { log, pendingMutations, readQueue, sessionId } from './queue.mjs';
import { rank } from './rank.mjs';

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

/** Open the base and load the index; every read verb starts here. */
async function catalogue(opened) {
  if (!opened.reader) return { state: 'no-base', why: opened.why };
  return loadIndex(opened.reader);
}

// ── ask ───────────────────────────────────────────────────────────────────────────────────────

export async function ask(question, opened, { env = process.env, top = 3 } = {}) {
  const started = Date.now();
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'ask', q: question, state: cat.state, why: cat.why }, { env });
    return { state: cat.state, why: cat.why, hits: [] };
  }

  const hits = rank(question, retrievable(cat.rows), { top });
  if (!hits.length) {
    await log({ kind: 'ask', q: question, matched: [], state: 'miss', ms: Date.now() - started }, { env });
    return { state: 'miss', hits: [], rows: cat.rows.length };
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
    opened: opened_.map((h) => h.id),
    state,
    ...(state === 'unreachable' ? { why: described[0]?.unavailable ?? 'no body could be read' } : {}),
    ms: Date.now() - started,
  }, { env });

  return { state, hits: described, rows: cat.rows.length };
}

// ── show ──────────────────────────────────────────────────────────────────────────────────────

export async function show(id, opened, { env = process.env } = {}) {
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'show', id, state: cat.state, why: cat.why }, { env });
    return { state: cat.state, why: cat.why };
  }
  // Retired entries are shown. Retrieval will not return one, but a reader holding an id is
  // entitled to see what is behind it -- including that it was retired.
  const row = cat.rows.find((r) => r.id.toUpperCase() === String(id).toUpperCase());
  if (!row) {
    await log({ kind: 'show', id, state: 'miss' }, { env });
    return { state: 'miss', why: `${id} is not in this base's index` };
  }
  const read = await opened.reader.readEntry(row.path);
  if (!read.ok) {
    // Both a 404 and a timeout leave the caller without the entry, so both are 'conclude
    // nothing'. What differs is the REMEDY, which is why the message is built separately.
    await log({ kind: 'show', id, state: 'unreachable', why: read.detail }, { env });
    return { state: 'unreachable', row, why: read.reason === 'missing' ? `${row.path} is not in the base — drift; run \`kb reindex\`` : read.detail };
  }
  let parsed;
  try {
    parsed = parseEntry(read.text, row.path);
  } catch (err) {
    await log({ kind: 'show', id, state: 'unreachable', why: err.message }, { env });
    return { state: 'unreachable', row, why: `unparseable entry: ${err.message}` };
  }
  await log({ kind: 'show', id: row.id, state: 'answer' }, { env });
  return { state: 'answer', row, entry: parsed.data, body: parsed.body.trim(), trust: trustOf(parsed.data.evidence ?? []) };
}

// ── capture ───────────────────────────────────────────────────────────────────────────────────

const REQUIRED = ['subject', 'question', 'claim', 'deployment'];

export async function capture(input, opened, { env = process.env } = {}) {
  const missing = REQUIRED.filter((f) => !String(input[f] ?? '').trim());
  if (!input.anchors?.length) missing.push('anchor');
  if (missing.length) return { state: 'invalid', why: `capture needs: ${missing.join(', ')}` };

  const problems = anchorProblems(input.anchors);
  if (problems.length) return { state: 'invalid', why: 'unusable anchor(s)', problems };

  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind: 'capture', subject: input.subject, state: cat.state, why: cat.why }, { env });
    return { state: cat.state, why: cat.why };
  }

  const scope = normalizeScope(input.scope);
  if (!scope.length) return { state: 'invalid', why: 'capture needs at least one --scope axis=value (without scope, a storefront fact gets applied to admin)' };

  // THE DEDUP CHECK. Runs here against the session's index, and AGAIN at push time against the
  // freshly re-read one -- which is what makes it race-free rather than merely likely (PLAN §2).
  const dupe = findDuplicate(cat.rows, { anchors: input.anchors, scope });
  if (dupe) {
    await log({
      kind: 'capture-refused', dupeOf: dupe.row.id, subject: input.subject,
      why: 'anchors+scope', when: 'call',
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
  const alsoHere = neighbours(cat.rows, input.anchors, { exclude: id });

  const written = await log({
    kind: 'capture',
    id,
    subject: input.subject,
    // The PAYLOAD the pusher needs. The public log line is this minus `payload` (see toLogLine):
    // a log line carries ids and subjects only, but the queue must carry what it is queueing.
    payload: { entry, body: String(input.claim).trim(), key: identityKey({ anchors: input.anchors, scope }) },
  }, { env });

  return { state: 'queued', id, entry, queuedTo: written.path, logWrite: written, alsoHere };
}

// ── confirm / dispute ─────────────────────────────────────────────────────────────────────────

async function appendEvidence(kind, id, input, opened, { env = process.env } = {}) {
  const cat = await catalogue(opened);
  if (cat.state !== 'ok') {
    await log({ kind, id, state: cat.state, why: cat.why }, { env });
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
    ...(kind === 'confirm' ? { trust: row.trust + 1 } : { saw: input.saw }),
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
