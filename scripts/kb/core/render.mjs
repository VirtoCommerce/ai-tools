// What a verb's result LOOKS LIKE, in one place, because there are two doors onto it.
//
// The CLI prints these lines to a terminal; the MCP server joins them into the `text` content of a
// `tools/call` result. Neither formats anything itself. That is not tidiness: the three things this
// renderer prints -- the trust label, the confirmation count and the per-observation provenance --
// are exactly what `cat` cannot print and what the bypass measurement (PLAN §1.4) is about, so an
// agent reaching the base through the OTHER door must not silently get less. Two renderers would
// drift apart on precisely the fields that justify the tool existing.
//
// Every function returns an ARRAY OF LINES rather than a string. The CLI writes them one at a time
// and the server joins them; neither has to guess where the newlines were meant to be.

import { MSYS_REMEDY } from './anchors.mjs';
import { HEADLINE } from './exits.mjs';

/** The three things `cat` cannot print, printed (PLAN §3.1 step 4). */
export function hitLines(hit) {
  const lines = [''];
  lines.push(`  ${hit.id}  [${hit.trust.label}]  ${hit.trust.confirmations} confirmation(s)`
    + `${hit.trust.provisional ? ' per the index, unverified — the body did not arrive' : ''}`
    + `${hit.trust.disputed ? `, ${hit.trust.disputed} DISPUTED` : ''}`
    // SESSIONS, NOT "INDEPENDENT PARTIES". `by` holds a session key and never held a person, so the
    // old wording promised independence of JUDGEMENT and delivered independence of RUN. Measured the
    // day it was noticed: all 125 commits in the base are one author, so every "5 independent
    // parties" meant one person five times. Two sessions ARE two genuine re-derivations — that is
    // worth saying — but only under their own name.
    + `${hit.trust.sessions > 1 ? `, ${hit.trust.sessions} sessions` : ''}`
    // And the number that will eventually mean what the old wording pretended to. Absent until the
    // evidence carries it, rather than reported as zero: an item written before operators were
    // recorded cannot be assigned to one, and "0 operators" would be the same defect inverted.
    + `${hit.trust.operators != null ? `, ${hit.trust.operators} operator(s)${hit.trust.operatorsUnknown ? ` + ${hit.trust.operatorsUnknown} unattributed` : ''}` : ''}`
    // ANONYMOUS EVIDENCE IS SAID, not folded into the party count and not silently dropped. Until
    // 2026-09-22 an item with no observer was counted as a party by way of its DEPLOYMENT, so 14 of
    // 109 live entries overstated their independence and 7 read as "one identified observer" where
    // nobody was identified at all. Naming it is what turns "we do not know who saw this" from an
    // invisible state into a readable one — and a reader deciding whether to re-verify a claim is
    // exactly who needs it.
    + `${hit.trust.anonymous ? `, ${hit.trust.anonymous} anonymous` : ''}`);
  lines.push(`  ${hit.subject}`);
  const matched = [
    hit.matchedOn.anchors.length ? `anchor ${hit.matchedOn.anchors.join(', ')}` : null,
    hit.matchedOn.tokens.length ? `words ${hit.matchedOn.tokens.join(' ')}` : null,
  ].filter(Boolean).join('; ');
  lines.push(`  matched on: ${matched || '—'}   (score ${hit.score})`);
  if (hit.indexDrift) lines.push(`  ! ${hit.indexDrift}`);
  if (hit.unavailable) { lines.push(`  ! ${hit.unavailable}`); return lines; }
  for (const p of hit.provenance) {
    lines.push(`  ${p.contradicts ? 'contradicted' : 'seen'} by ${p.by ?? '?'} on ${p.deployment ?? '?'}`
      + ` at ${p.at ?? '?'} (${p.method})${p.note ? ` — ${p.note}` : ''}`);
  }
  lines.push('');
  for (const line of String(hit.body ?? '').split('\n')) lines.push(`  | ${line}`);
  return lines;
}

export function askLines(r, { prefix = 'kb ask' } = {}) {
  const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
  if (r.why) lines.push(`  ${r.why}`);
  // Said on every state: the repair already ran, but the next command from the same shell will be
  // mangled the same way, and only the agent can change how it is typed.
  if (r.repaired === 'msys') lines.push(`  (your shell rewrote a leading "/" into a local path; it was undone. ${MSYS_REMEDY})`);
  // A MISS SAYS THE BASE WAS RANKED, NOT MERELY THAT IT WAS EMPTY -- and it does NOT hand back the
  // near-miss id. The near-miss is diagnostic, written to the log for whoever is judging the floor
  // (PLAN §7); giving it to the agent would put a rejected entry in front of exactly the reader
  // most likely to use it anyway, which is the confident-wrong-answer this floor exists to stop.
  // The COUNT is safe and is worth saying: it distinguishes "read, and nothing came close" from
  // "read, and something came close but did not clear the bar".
  if (r.state === 'miss' && r.nearMiss) {
    lines.push(`  the closest candidate scored ${r.nearMiss.score} and did not clear the floor`
      + ` (it matched ${Math.round(r.nearMiss.coverage * 100)}% of your question's words, and no anchor).`);
  }
  // AND WHAT THIS SESSION ITSELF WROTE AND HAS NOT PUSHED. Unlike the near-miss above, this is safe
  // to hand back, because it is not a rejected entry somebody else wrote — it is the reader's own
  // work, and the reader is the one party who can judge it. Named as a DRAFT and kept out of the
  // hit list: it carries no trust, no confirmations and no provenance a second person could check,
  // and the state stays `miss` because the base really does hold nothing yet.
  if (r.state === 'miss' && (r.queued ?? []).length) {
    lines.push(`  you captured this yourself earlier in THIS session and it is not published yet —`
      + ` it is not in the base and nobody else can see it:`);
    for (const q of r.queued) lines.push(`    ${q.id}  ${q.subject}${q.at ? `  (queued ${q.at})` : ''}`);
  }
  for (const hit of r.hits ?? []) lines.push(...hitLines(hit));
  return lines;
}

export function showLines(r, { prefix = 'kb show' } = {}) {
  if (r.state !== 'answer') {
    const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  const lines = [
    `${r.entry.id}  [${r.trust.label}]  ${r.trust.confirmations} confirmation(s)`
      + `${r.trust.disputed ? `, ${r.trust.disputed} DISPUTED` : ''}   status: ${r.entry.status}`,
    `${r.entry.subject}`,
    `question: ${r.entry.question ?? '—'}`,
    `anchors:  ${(r.entry.anchors ?? []).map((a) => a.coordinate).join(', ')}`,
    `scope:    ${r.row.scope.join(', ')}`,
  ];
  for (const e of r.entry.evidence ?? []) {
    lines.push(`  ${e.contradicts ? 'contradicted' : 'seen'} by ${e.by ?? '?'} on ${e.deployment ?? '?'} at ${e.at ?? '?'}`
      + `${e.note ? ` — ${e.note}` : ''}`);
  }
  lines.push('');
  lines.push(r.body);
  return lines;
}

export function captureLines(r, { prefix = 'kb capture' } = {}) {
  if (r.state === 'invalid') {
    return [`${prefix}: ${r.why}`, ...(r.problems ?? []).map((p) => `  ${p.coordinate} — ${p.kind}: ${p.why}`)];
  }
  if (r.state === 'refused') {
    // A refusal is not a failure -- it is the design working. The ranking missed an entry that
    // exists, and instead of a duplicate the base gets a confirmation.
    // A taken SUBJECT is not necessarily the same fact — the writer decides which (PR #313 review 2).
    const head = r.reason === 'subject-taken'
      ? 'REFUSED — an entry already has this subject, so this capture would take its id.'
      : 'REFUSED — the base already holds this fact.';
    return [`${prefix}: ${head}`, '', `  ${r.message.split('\n').join('\n  ')}`];
  }
  if (r.state !== 'queued') {
    const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  return [
    `${prefix}: queued ${r.id} — ${r.entry.subject}`,
    `  ${r.queuedTo}`,
    '  nothing has been sent; it ships with the next push.',
    ...readLines(r.read),
    ...neighbourLines(r.alsoHere),
    ...relatedLines(r.related),
  ];
}

/**
 * Entries this session already opened — printed FIRST, and the only one of the three lists that
 * names the thing it is actually worried about.
 *
 * The other two say "this may be about the same thing" and leave the reader to work out why they
 * should care. This one can be specific because the premise is specific: the agent read these,
 * minutes ago, and is now writing something down. So it asks the question directly, which the
 * measurement says is the question — of the three contradictions the corpus records in its own
 * bodies, all three were with an entry the writing session had already opened, and the vocabulary
 * hint found one of four targets.
 *
 * Still a hint and still not a gate: the capture is queued by the time these lines exist, and the
 * wording says so rather than leaving it to be inferred.
 */
function readLines(read) {
  if (!read?.length) return [];
  return [
    '  you opened these earlier in this session — does what you just wrote disagree with any of them?',
    ...read.map((n) => `    ${n.id} — ${n.subject}`),
    '    if it does, `kb dispute <id>` says so; nothing here is blocked.',
  ];
}

/**
 * Anchor neighbours, capped. `more` is printed for the reason it is printed on `related`: a capped
 * list cannot distinguish "three at this coordinate" from "three shown, twenty-two not", and a
 * coordinate carrying twenty-five entries is itself worth knowing about.
 */
function neighbourLines(alsoHere) {
  if (!alsoHere?.hits?.length) return [];
  const lines = alsoHere.hits.map((n) => `  also anchored at ${n.coordinate}: ${n.id} — ${n.subject}`);
  if (alsoHere.more) lines.push(`  …and ${alsoHere.more} more at the same coordinate(s).`);
  return lines;
}

/**
 * Entries the fact just written may speak to — printed LAST, and phrased so it cannot be mistaken
 * for a gate.
 *
 * The capture is already queued by the time these lines exist; nothing here can undo that, and the
 * wording says so in the first line rather than leaving the reader to infer it from the absence of
 * a prompt. The sentence is here, in the one renderer both doors go through, so the CLI and the
 * MCP server cannot drift apart on the one thing this hint has to communicate: that it is advice.
 *
 * `more` is printed rather than folded into the list because a capped list cannot distinguish
 * "three related entries" from "three shown, ten not" — and those ask different things of whoever
 * is deciding whether to go and read them.
 */
function relatedLines(related) {
  if (!related?.hits?.length) return [];
  const lines = ['  related — these may be about the same thing; nothing is blocked:'];
  for (const h of related.hits) lines.push(`    ${h.row.id} — ${h.row.subject}`);
  if (related.more) lines.push(`    …and ${related.more} more; \`kb ask\` to see them.`);
  return lines;
}

export function evidenceLines(verb, r) {
  if (r.state === 'invalid') return [`kb ${verb}: ${r.why}`];
  if (r.state !== 'queued') {
    const lines = [`kb ${verb}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  return [
    `kb ${verb}: queued on ${r.id} (${r.row.subject})`,
    `  ${r.queuedTo}`,
    '  nothing has been sent; it ships with the next push.',
  ];
}
