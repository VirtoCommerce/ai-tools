// The dispute queue and the judge's write (VCST-6179, `/kb-judge`).
//
// A dispute only FLAGS an entry -- "a dispute retires nothing, a human decides" -- and until this
// module nothing helped the human decide, and nothing could record that they had. Measured
// 2026-10-08 on vc-knowledge@3c98af1: 58 of 532 active entries disputed, 39 with disputes >=
// confirmations, 266 of 1,070 asks shown at least one of them, and two entries a person had
// already settled by hand still served as DISPUTED.
//
// Everything here is DERIVED from the entries and the logs of a local base checkout; nothing is
// declared. The hints are hypotheses for the judge to test live, never a verdict: a dispute is
// settled by a fresh investigation (stands, storefront, Admin, docs, source), not from the papers.

import { isResolved, RESOLUTIONS } from './index-build.mjs';
import { parseConditions } from './conditions.mjs';
import { NOTE_MAX } from './verbs.mjs';

const lower = (s) => String(s ?? '').trim().toLowerCase();
const anchorOf = (a) => lower(typeof a === 'string' ? a : a?.coordinate);
const idsIn = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
const counted = (evidence) => (Array.isArray(evidence) ? evidence : []).filter((e) => !e?.duplicateSession);

/**
 * Two evidence / log stamps compared by TIME. A string comparison of ISO stamps is wrong when only
 * one carries milliseconds (`…:00Z` sorts after `…:00.000Z`), and legacy items were written both
 * ways. Unparsable stamps fall back to the string order rather than to "never".
 */
const cmpAt = (a, b) => {
  const x = Date.parse(String(a ?? ''));
  const y = Date.parse(String(b ?? ''));
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return String(a ?? '').localeCompare(String(b ?? ''));
};
const atOrBefore = (a, b) => cmpAt(a, b) <= 0;
const after = (a, b) => cmpAt(a, b) > 0;

/** The investigation's own observation (`appendObservation`): the one item that does not make its session a party. */
export const isInvestigation = (e) => e?.investigation === true && !e?.contradicts;

/** An entry a judge may still work on: active, with at least one open dispute. */
const hasOpenDispute = (data) => String(data?.status ?? 'active') === 'active'
  && (Array.isArray(data?.evidence) ? data.evidence : []).some((e) => e.contradicts && !isResolved(e));

/**
 * Build strings a note names in prose: `3.1007.27`, `2.59.0-pr-2476-31b5`, `pr-141`. Exactly three
 * numeric parts, so an IP address (`10.0.0.1`) is not read as `10.0.0`; a dotted date (`08.10.2026`)
 * is dropped. Both are common in notes and neither is a build.
 */
const DOTTED_DATE = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
export function mentionedBuilds(text) {
  const found = new Set();
  for (const m of String(text ?? '').matchAll(/(?<![\d.])\d+\.\d+\.\d+(?!\.?\d)(?:-[a-z]+(?:-[0-9a-z]+)*)?\b|\bpr-\d+\b/gi)) {
    if (!DOTTED_DATE.test(m[0])) found.add(m[0]);
  }
  return [...found];
}

/**
 * One entry's dispute state, or null when it has no open dispute or is not active.
 * `entry` is `{data, body, path}` as parseEntry returns it plus its path.
 */
export function disputeState(entry) {
  const d = entry.data;
  if (String(d.status ?? 'active') !== 'active') return null;
  const items = counted(d.evidence);
  const open = items.filter((e) => e.contradicts && !isResolved(e));
  if (!open.length) return null;
  const support = items.filter((e) => !e.contradicts);
  const firstOpenAt = open.map((e) => String(e.at ?? '')).sort(cmpAt)[0];
  const sessionsOf = (xs) => new Set(xs.map((e) => e.by).filter(Boolean));
  const supportSessions = sessionsOf(support);
  const supportStands = new Set(support.map((e) => lower(e.deployment)).filter(Boolean));
  return {
    id: String(d.id),
    path: entry.path,
    subject: String(d.subject ?? ''),
    confirmations: support.length,
    open: open.length,
    resolved: items.filter(isResolved).length,
    invalidResolutions: items.filter((e) => e.contradicts && e.resolved && !isResolved(e)).length,
    firstOpenAt,
    concepts: idsIn(d.concepts),
    anchors: (d.anchors ?? []).map(anchorOf).filter(Boolean),
    splitFrom: [...new Set(items.map((e) => e.splitFrom).filter(Boolean))],
    // Hints, each a hypothesis the investigation must confirm or kill:
    selfDisputed: open.some((e) => e.by && supportSessions.has(e.by)),
    otherStand: open.some((e) => e.deployment && !supportStands.has(lower(e.deployment))),
    confirmedSince: support.filter((e) => after(e.at, firstOpenAt)).length,
    withConditions: items.filter((e) => e.conditions).length,
  };
}

/** What a judge should test first, from the shape of the evidence. Never a verdict. */
export function hints(s) {
  const out = [];
  if (s.selfDisputed) out.push('one session both confirmed and disputed it: the entry may hold two facts (split?)');
  if (s.splitFrom.length) out.push(`its evidence came through a split of ${s.splitFrom.join(', ')}: a dispute may belong to a sibling`);
  if (s.otherStand) out.push('a dispute was made on a stand no confirmation names: build or configuration difference?');
  if (s.confirmedSince) out.push(`${s.confirmedSince} confirmation(s) arrived after the first open dispute: dispute wrong, or two conditions?`);
  if (s.withConditions === 0) out.push('no evidence item records its conditions: the investigation must establish them on every stand');
  if (s.invalidResolutions) out.push(`${s.invalidResolutions} item(s) carry an unknown resolution value and count as open`);
  return out;
}

/** How often an entry was put in front of agents since its first open dispute (from the logs). */
export function exposure(lines, states) {
  const since = new Map(states.map((s) => [s.id, s.firstOpenAt]));
  const out = new Map(states.map((s) => [s.id, { asks: 0, shows: 0 }]));
  for (const l of lines) {
    if (l.synthetic === true) continue;
    if (l.kind === 'ask') {
      for (const id of new Set([...idsIn(l.shown), ...idsIn(l.matched)])) {
        if (since.has(id) && after(l.at, since.get(id))) out.get(id).asks += 1;
      }
    } else if (l.kind === 'show' && since.has(l.id) && after(l.at, since.get(l.id))) {
      out.get(l.id).shows += 1;
    }
  }
  return out;
}

/**
 * Group disputed entries that share at least TWO keys (concepts and anchors). A cluster is judged
 * together: ten disputes about one feature are more likely one behaviour change than ten
 * independent errors.
 *
 * Two, not one, because the grouping is transitive. Measured on the 58 disputed entries of
 * 2026-10-08: one shared key chained invitations, loyalty missions, OTP and wishlists into a single
 * 34-entry cluster through generic concepts (`api-error`, `sign-in`); two shared keys gave 16
 * wishlist/list-sharing, 5 invitation/membership and a tail of feature-sized pairs.
 */
export const CLUSTER_LINK = 2;
export function clusters(states) {
  const parent = new Map(states.map((s) => [s.id, s.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const keys = states.map((s) => new Set([...s.concepts.map((c) => `c:${c}`), ...s.anchors.map((a) => `a:${a}`)]));
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      let shared = 0;
      for (const k of keys[i]) if (keys[j].has(k)) shared += 1;
      if (shared >= CLUSTER_LINK) parent.set(find(states[i].id), find(states[j].id));
    }
  }
  const groups = new Map();
  for (const s of states) {
    const root = find(s.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s);
  }
  return [...groups.values()];
}

/** Queue order: disputes that outweigh their confirmations first, then the most-served. */
export function priority(s, exp = { asks: 0, shows: 0 }) {
  return (s.open >= s.confirmations ? 1000 : 0) + (s.open - s.confirmations) * 10 + exp.asks + exp.shows;
}

/** The dossier of one entry, as Markdown: everything weighed, nothing concluded. */
export function dossier(entry, { exp = null, state = null } = {}) {
  const d = entry.data;
  const items = Array.isArray(d.evidence) ? d.evidence : [];
  const lines = [
    `## ${d.id} — ${d.subject}`,
    '',
    `- question: ${d.question ?? '—'}`,
    `- anchors: ${(d.anchors ?? []).map(anchorOf).join(', ') || '—'}`,
    `- scope: ${(d.appliesTo ?? []).map((a) => `${a.axis}=${a.value}`).join(', ') || '—'}`,
    `- concepts: ${idsIn(d.concepts).join(', ') || '—'}`,
  ];
  if (exp) lines.push(`- served since the first open dispute: ${exp.asks} ask(s), ${exp.shows} show(s)`);
  if (state) for (const h of hints(state)) lines.push(`- hint: ${h}`);
  lines.push('', '| # | side | stand | conditions | builds in note | at | by | resolution |', '|---|---|---|---|---|---|---|---|');
  items.forEach((e, i) => {
    const side = e.duplicateSession ? 'dup' : e.contradicts ? 'DISPUTE' : isInvestigation(e) ? 'investigation' : 'confirm';
    const cond = e.conditions ? Object.entries(parseConditions(e.conditions)).map(([k, v]) => `${k}=${v}`).join('<br>') : '—';
    const builds = [e.platformVersion, ...mentionedBuilds(e.note)].filter(Boolean).join(', ') || '—';
    const res = e.contradicts ? (isResolved(e) ? `${e.resolved}` : e.resolved ? `INVALID ${e.resolved}` : 'open') : '';
    lines.push(`| ${i + 1} | ${side} | ${e.deployment ?? '?'} | ${cond} | ${builds} | ${e.at ?? '?'} | ${e.by ?? '?'}${e.who ? ` (${e.who})` : ''} | ${res} |`);
  });
  const noted = items.map((e, i) => [i + 1, e]).filter(([, e]) => e.note);
  if (noted.length) {
    lines.push('', '### Notes');
    for (const [n, e] of noted) lines.push('', `**#${n} (${e.contradicts ? 'dispute' : 'confirm'})** ${e.note}`);
  }
  lines.push('', '### Body', '', String(entry.body ?? '').trim());
  return lines.join('\n');
}

/**
 * The investigation's own observation of a DISPUTED entry, appended on the judge's branch.
 *
 * Why not the normal door (`kb_confirm` / `kb_dispute`): the queue publishes to the base's main,
 * while the decision waits in the PR. A confirmation of the clause the PR is about to correct would
 * land on the OLD body first and read as support for what the judge found wrong. The observation and
 * the decision it supports are reviewed together, in one PR. Observations of any OTHER entry still go
 * through the door.
 *
 * It never contradicts: a contradiction the investigation finds is what the verdict and the body
 * edit are for, and a new open dispute inside the PR that resolves the old ones would restart the
 * queue. It is refused on an entry that is retired or holds no open dispute -- there it would be a
 * confirmation that bypassed the door and its gates -- and it is marked `investigation: true`, the
 * one thing that lets `applyResolution` tell the judge's own work from a session taking a side.
 */
export function appendObservation(data, { deployment, conditions, note, session, who = null, now = new Date() }) {
  if (!String(deployment ?? '').trim()) return { problem: '--deployment is required' };
  if (!conditions) return { problem: '--conditions is required: an investigation records what the stand ran' };
  if (!String(note ?? '').trim()) return { problem: '--note is required: what was observed, under these conditions' };
  // Refused, not cut as the door cuts it: a judge writes this once, by hand, and can shorten it.
  if (String(note).trim().length > NOTE_MAX) return { problem: `--note is over ${NOTE_MAX} characters; the argument belongs in the PR` };
  if (!session) return { problem: 'no session key: run inside a Claude Code session' };
  if (!hasOpenDispute(data)) return { problem: `${data.id} is not an active entry with an open dispute; an observation of any other entry goes through the door (kb_confirm / kb_dispute)` };
  const item = {
    method: 'observation',
    deployment: String(deployment).trim(),
    conditions,
    at: now.toISOString(),
    by: `session:${session}`,
    ...(who ? { who } : {}),
    note: String(note).trim(),
    investigation: true,
  };
  return { data: { ...data, evidence: [...(Array.isArray(data.evidence) ? data.evidence : []), item] }, item };
}

export const RESOLUTION_MAX = 600;

/**
 * Close one dispute on an entry: write how it was resolved ON the contradicting item, in place.
 * Returns `{data}` or `{problem}`.
 *
 * INDEPENDENCE IS CHECKED HERE, not asked for in a prompt: a session that wrote ANY evidence on this
 * entry is a party and cannot resolve it -- a confirm or dispute through the door after the dispute
 * takes a side as surely as one before it. The only exception is the judge's own investigation
 * (`appendObservation`, marked `investigation`) written after the dispute.
 *
 * The dispute is named by `at`; every open copy of it shares `at|by|note` (a split or merge copies the
 * item whole). Two DIFFERENT disputes with one `at` are refused unless `by` names which.
 *
 * A party is a SESSION, which is what `by` holds -- not a person: one operator in the desktop app and
 * in the CLI holds two keys. `session` must be a real session key (`hasSessionId`); outside Claude
 * Code every process mints its own key, so every run would be "independent" of everyone, and the
 * caller passes null instead. The dossier prints `who` beside `by` so a reviewer sees the person.
 */
export function applyResolution(data, { at, by: disputedBy = null, verdict, why, ref, session, now = new Date() }) {
  if (!RESOLUTIONS.includes(verdict)) return { problem: `--verdict must be one of: ${RESOLUTIONS.join(', ')}` };
  const reason = String(why ?? '').trim();
  if (!reason) return { problem: '--why is required: one sentence a reader of the entry can check' };
  if (reason.length > RESOLUTION_MAX) return { problem: `--why is over ${RESOLUTION_MAX} characters; the argument belongs in the PR, the conclusion here` };
  if (!String(ref ?? '').trim()) return { problem: '--in is required: the PR (or branch) that carries the decision' };
  if (!session) return { problem: 'no session key: run inside a Claude Code session' };
  const items = Array.isArray(data.evidence) ? data.evidence : [];
  // Every open item with this `at` is the SAME dispute: a schema-2 split or a merge can carry one
  // dispute into an entry twice (KB-59E4B5FC held two copies), and closing only the first left the
  // entry DISPUTED with no way to name the second.
  const matching = items.filter((e) => e.contradicts && e.at != null && String(e.at) === String(at)
    && (!disputedBy || e.by === disputedBy));
  if (!matching.length) return { problem: `no dispute at ${at}${disputedBy ? ` by ${disputedBy}` : ''} on ${data.id}; the dossier lists each item's \`at\` and \`by\`` };
  const disputes = new Set(matching.map((e) => `${e.by ?? ''}|${e.note ?? ''}`));
  if (disputes.size > 1) return { problem: `${disputes.size} different disputes on ${data.id} share at ${at}; name one with --by <its by>` };
  const targets = new Set(matching.filter((e) => !isResolved(e)));
  if (!targets.size) return { problem: `the dispute at ${at} is already resolved (${matching[0].resolved})` };
  const by = `session:${session}`;
  const party = items.some((e) => e.by === by && !(isInvestigation(e) && !atOrBefore(e.at, at)));
  if (party) return { problem: `${by} confirmed or disputed ${data.id} itself: a party to a dispute never judges it (only its own \`observe\` items after the dispute are exempt)` };
  const evidence = items.map((e) => (!targets.has(e) ? e : {
    ...e,
    resolved: verdict,
    resolvedAt: now.toISOString(),
    resolvedBy: by,
    resolvedIn: String(ref).trim(),
    resolution: reason,
  }));
  return { data: { ...data, evidence } };
}
